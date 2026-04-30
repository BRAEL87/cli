/**
 * Standalone Agent Runner — Enhanced CLI agent with Electron-level capabilities
 * Tools: read_file, read_chunk, write_file, append_to_file, edit_file,
 *        multi_edit_file, delete_file, bash, get_file_tree, list_dir,
 *        find_by_name, grep_in_file, search_codebase, view_file_outline,
 *        get_diagnostics, run_tests
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import axios from 'axios'
import { AgentOptions, AgentResult, IterationLog } from './types'
import { LoopDetector } from './loop-detector'
import { JSONLLogger } from './jsonl-logger'

// ─── Dangerous command guard ──────────────────────────────────────────────────

const DANGEROUS = [
    /rm\s+-rf\s+[/~]/i, /mkfs/i, /dd\s+if=/i, /:\(\)\{.*\}/,
    /chmod\s+-R\s+777\s+\//i, /shutdown|reboot|halt/i,
    /curl.*\|\s*(ba)?sh/i, /wget.*\|\s*(ba)?sh/i,
    /format\s+[a-z]:/i,  // Windows format drive
]
function isDangerous(cmd: string): boolean {
    return DANGEROUS.some(p => p.test(cmd))
}

// ─── Parallel-safe read tools ─────────────────────────────────────────────────

const PARALLEL_SAFE = new Set([
    'read_file', 'read_chunk', 'get_file_tree', 'list_dir',
    'find_by_name', 'grep_in_file', 'search_codebase',
    'view_file_outline', 'get_diagnostics', 'search_web',
])

export class StandaloneAgent {
    private loopDetector: LoopDetector
    private logger: JSONLLogger
    private apiKey: string
    private apiBase: string
    private abortController: AbortController | null = null
    // Conversation memory: persists across prompts in REPL mode
    private conversationHistory: Array<{ role: string; content: string }> = []

    constructor(apiKey: string, apiBase: string = 'https://openrouter.ai/api/v1', logPath?: string) {
        this.apiKey = apiKey
        this.apiBase = apiBase
        this.loopDetector = new LoopDetector()
        this.logger = new JSONLLogger(logPath)
    }

    /** Clear conversation memory (called between REPL sessions if user wants fresh start) */
    public clearMemory(): void {
        this.conversationHistory = []
    }

    /** Cancel the current running task */
    public cancel(): void {
        this.abortController?.abort()
    }

    public async run(options: AgentOptions): Promise<AgentResult> {
        const {
            prompt, maxIterations, model = 'tencent/hy3-preview:free',
            cwd = process.cwd(), timeout = 300000,
            onIteration, onAction, onObservation, onThought, onChunk,
        } = options

        this.abortController = new AbortController()
        this.logger.logStart(prompt, model, maxIterations)
        this.loopDetector.reset()

        const logs: IterationLog[] = []
        let iteration = 0
        let loopDetected = false

        // Build context: system + conversation history + new user message
        const systemPrompt = this.getSystemPrompt(cwd)
        let context: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory,
            { role: 'user', content: prompt }
        ]

        // ── Checkpoint restore ────────────────────────────────────────────────
        const saved = this.loadCheckpoint(cwd)
        if (saved && saved.prompt === prompt && saved.model === model && saved.iteration > 0) {
            console.log(`\n[Resuming from checkpoint at iteration ${saved.iteration}/${maxIterations}]`)
            context = saved.context
            iteration = saved.iteration
        }

        // Inject workspace context at session start (saves 3-5 iterations)
        const wsContext = this.buildWorkspaceContext(cwd)
        if (wsContext && iteration === 0) {
            context[0] = { role: 'system', content: `${systemPrompt}\n\n${wsContext}` }
        }

        try {
            while (iteration < maxIterations) {
                if (this.abortController.signal.aborted) break
                iteration++
                if (!onIteration) console.log(`\n[Iteration ${iteration}/${maxIterations}]`)

                const response = await this.callAI(model, context, timeout, onChunk)
                const thought = this.extractThought(response)
                const allCalls = this.parseAllToolCalls(response)
                const toolCall = allCalls[0] || null

                if (!onIteration) console.log(`Thought: ${thought.substring(0, 100)}...`)

                if (!toolCall) {
                    if (!onIteration) console.log('✓ Agent completed')
                    onThought?.(thought)

                    // Save to conversation memory for follow-up prompts
                    this.conversationHistory.push({ role: 'user', content: prompt })
                    this.conversationHistory.push({ role: 'assistant', content: thought })
                    // Keep memory bounded (last 10 exchanges)
                    if (this.conversationHistory.length > 20) {
                        this.conversationHistory.splice(0, 2)
                    }

                    this.clearCheckpoint(cwd)
                    const result: AgentResult = {
                        success: true, iterations: iteration, exitCode: 0,
                        finalMessage: thought, logs, maxReached: false, loopDetected: false
                    }
                    this.logger.logComplete(result)
                    await this.logger.close()
                    return result
                }

                if (!onIteration) console.log(`Action: ${toolCall.tool}(${JSON.stringify(toolCall.args).substring(0, 50)}...)`)
                onIteration?.(iteration, thought, toolCall.tool)
                onAction?.(toolCall.tool, toolCall.args)

                // Parallel execution for safe read-only tools
                let observation: string
                let success: boolean

                const allParallel = allCalls.length > 1 && allCalls.every(tc => PARALLEL_SAFE.has(tc.name || tc.tool))
                if (allParallel) {
                    const results = await Promise.all(allCalls.map(tc => this.executeTool(tc.name || tc.tool, tc.args, cwd, onChunk)))
                    observation = results.map((r, i) => `[${allCalls[i].name || allCalls[i].tool}]\n${r.observation}`).join('\n\n---\n\n')
                    success = results.every(r => r.success)
                } else {
                    const r = await this.executeTool(toolCall.tool, toolCall.args, cwd, onChunk)
                    observation = r.observation
                    success = r.success
                }

                if (!onIteration) console.log(`Result: ${success ? '✓' : '✗'} ${observation.substring(0, 100)}...`)
                onObservation?.(observation, success)

                const log: IterationLog = {
                    iteration, timestamp: Date.now(), thought,
                    action: { tool: toolCall.tool, args: toolCall.args },
                    observation, success
                }
                logs.push(log)
                this.logger.logIteration(log)

                const loopCheck = this.loopDetector.detectLoop(log)
                if (loopCheck.isLooping) {
                    if (!onIteration) console.log(`⚠️  Loop detected: ${loopCheck.reason}`)
                    this.logger.logLoopDetected(iteration, loopCheck.reason!)
                    const suggestion = this.loopDetector.getLoopBreakSuggestion()
                    observation = `${observation}\n\n[SYSTEM WARNING] ${loopCheck.reason}\nSuggestion: ${suggestion}`
                    loopDetected = true
                }

                context.push({ role: 'assistant', content: response })
                context.push({ role: 'user', content: `OBSERVATION:\n${observation}` })

                // Save checkpoint after each iteration so we can resume on crash
                this.saveCheckpoint(cwd, { prompt, model, iteration, context })

                // Smart context truncation: keep system prompt + user task + last 8 exchanges
                // Never remove index 0 (system) or index 1 (original user task)
                if (context.length > 20) {
                    // Truncate old tool observations to summaries instead of removing them
                    const keepFrom = Math.max(2, context.length - 16)
                    for (let i = 2; i < keepFrom; i++) {
                        if (context[i].role === 'user' && context[i].content.startsWith('OBSERVATION:') && context[i].content.length > 300) {
                            context[i] = { ...context[i], content: context[i].content.slice(0, 300) + '\n[...truncated for context]' }
                        }
                    }
                }
            }

            if (!onIteration) console.log(`⚠️  Max iterations (${maxIterations}) reached`)
            const result: AgentResult = {
                success: false, iterations: iteration, exitCode: 1,
                finalMessage: 'Max iterations reached', logs, maxReached: true, loopDetected
            }
            this.logger.logComplete(result)
            await this.logger.close()
            return result

        } catch (error: any) {
            if (this.abortController.signal.aborted) {
                const result: AgentResult = {
                    success: false, iterations: iteration, exitCode: 1,
                    finalMessage: 'Cancelled by user', logs, maxReached: false, loopDetected, error: 'Cancelled'
                }
                await this.logger.close()
                return result
            }
            // Transient network errors — retry the current iteration once
            const isTransient = /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(error.message)
            if (isTransient && iteration < maxIterations) {
                if (!onIteration) console.error(`⚠ Network error (${error.message}), retrying iteration ${iteration}...`)
                iteration-- // will be re-incremented at top of loop
                context.splice(-2) // remove the incomplete assistant+observation pair if any
                try {
                    // brief pause before retry
                    await new Promise(r => setTimeout(r, 3000))
                    // re-enter the loop
                    // (fall through to the while loop by not returning)
                } catch { /* ignore */ }
                // restart loop — reconstruct by re-entering
                return this.run({ ...options, maxIterations: maxIterations - iteration, prompt: context[context.length - 1]?.content || options.prompt })
            }
            if (!onIteration) console.error(`✗ Error: ${error.message}`)
            this.logger.logError(error.message, iteration)
            await this.logger.close()
            return {
                success: false, iterations: iteration, exitCode: 1,
                finalMessage: error.message, logs, maxReached: false, loopDetected, error: error.message
            }
        }
    }

    private async callAI(model: string, messages: any[], timeout: number, onChunk?: (t: string) => void, retries = 3): Promise<string> {
        const isCompat = this.apiBase.includes('openrouter.ai') || this.apiBase.includes('openai.com') ||
            this.apiBase.includes('puter.com') || this.apiBase.includes('/v1')

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (isCompat) {
                    const url = this.apiBase.endsWith('/chat/completions')
                        ? this.apiBase : `${this.apiBase.replace(/\/$/, '')}/chat/completions`

                    const isPuter = this.apiBase.includes('puter.com')
                    const authHeaders = isPuter && !this.apiKey
                        ? {}
                        : { 'Authorization': `Bearer ${this.apiKey}` }

                    const response = await axios.post(url, { model, messages, temperature: 0.7, stream: true }, {
                        headers: {
                            ...authHeaders,
                            'Content-Type': 'application/json',
                            ...(this.apiBase.includes('openrouter.ai') ? {
                                'HTTP-Referer': 'https://nova-studio.app', 'X-Title': 'Nova CLI'
                            } : {})
                        },
                        responseType: 'stream', timeout,
                        signal: this.abortController?.signal as any
                    })

                    return await new Promise<string>((resolve, reject) => {
                        let fullText = '', buffer = ''
                        response.data.on('data', (chunk: Buffer) => {
                            buffer += chunk.toString('utf-8')
                            const lines = buffer.split('\n')
                            buffer = lines.pop() ?? ''
                            for (const line of lines) {
                                const t = line.trim()
                                if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue
                                try {
                                    const token: string = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content ?? ''
                                    if (token) { fullText += token; onChunk?.(token) }
                                } catch { /* skip */ }
                            }
                        })
                        response.data.on('end', () => resolve(fullText))
                        response.data.on('error', reject)
                    })
                } else {
                    const r = await axios.post(`${this.apiBase}/ai/chat`, { model, messages },
                        { headers: { 'Authorization': `Bearer ${this.apiKey}` }, timeout })
                    const text = r.data.content || r.data.message || ''
                    onChunk?.(text)
                    return text
                }
            } catch (error: any) {
                const status = error.response?.status
                const detail = error.response?.data?.error?.message || error.message
                if (status === 401 || status === 403) {
                    const isPuter = this.apiBase.includes('puter.com')
                    if (isPuter) throw new Error(`PUTER_AUTH: Puter requires authentication. Get your auth_token from puter.com → F12 → Application → Cookies → auth_token, then run /provider and paste it as the API key.`)
                    throw new Error(`AUTH_ERROR: Invalid API key. Run /provider to update.`)
                }
                if (status === 429) {
                    const wait = Math.min(parseInt(error.response?.headers?.['retry-after'] || '5') * 1000, 30000) * attempt
                    if (attempt < retries) { onChunk?.(`\n[Rate limited, retrying in ${Math.round(wait / 1000)}s...]\n`); await new Promise(r => setTimeout(r, wait)); continue }
                    throw new Error(`RATE_LIMIT: Rate limited. Try again in a moment.`)
                }
                if (status >= 500 && attempt < retries) { await new Promise(r => setTimeout(r, 1000 * attempt)); continue }
                throw new Error(`AI call failed: ${detail}`)
            }
        }
        throw new Error('AI call failed after all retries')
    }

    private async executeTool(tool: string, args: any, cwd: string, onChunk?: (t: string) => void): Promise<{ observation: string; success: boolean }> {
        try {
            switch (tool) {
                case 'read_file': return this.toolReadFile(args.path, cwd)
                case 'read_chunk': return this.toolReadChunk(args.path, args.start_line, args.end_line, cwd)
                case 'write_file': return this.toolWriteFile(args.path, args.content, cwd, onChunk)
                case 'append_to_file': return this.toolAppendFile(args.path, args.content, cwd)
                case 'edit_file': return this.toolEditFile(args.path, args.old_content, args.new_content, cwd)
                case 'multi_edit_file': return this.toolMultiEdit(args.path, args.edits, cwd)
                case 'delete_file': return this.toolDeleteFile(args.path, cwd)
                case 'move_file': return this.toolMoveFile(args.source, args.destination, cwd)
                case 'bash':
                case 'run_terminal_command':
                case 'run_command': return this.toolBash(args.command || args.cmd, cwd, onChunk)
                case 'get_file_tree': return this.toolFileTree(args.depth || 2, cwd)
                case 'list_dir': return this.toolListDir(args.path || '.', cwd)
                case 'find_by_name': return this.toolFindByName(args.pattern, cwd)
                case 'grep_in_file': return this.toolGrepInFile(args.path, args.pattern, cwd)
                case 'search_codebase': return this.toolSearchCodebase(args.query, cwd)
                case 'view_file_outline': return this.toolViewOutline(args.path, cwd)
                case 'get_diagnostics': return await this.toolGetDiagnostics(args.path, cwd)
                case 'run_tests': return await this.toolRunTests(args.command, args.test_file, cwd, onChunk)
                case 'search_web': return await this.toolSearchWeb(args.query)
                case 'run_async_command': return await this.toolRunAsyncCommand(args.command, cwd)
                case 'check_command_status': return this.toolCheckCommandStatus(args.command_id)
                default: return { observation: `Unknown tool: '${tool}'. Available: read_file, write_file, edit_file, bash, get_file_tree, find_by_name, grep_in_file, search_codebase, view_file_outline, get_diagnostics, run_tests, search_web, run_async_command, check_command_status`, success: false }
            }
        } catch (e: any) {
            return { observation: `Tool error: ${e.message}`, success: false }
        }
    }

    // ─── File Operations ──────────────────────────────────────────────────────

    private toolReadFile(filePath: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            const content = fs.readFileSync(full, 'utf-8')
            const lines = content.split('\n')
            // Add line numbers for large files
            if (lines.length > 50) {
                const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}: ${l}`).join('\n')
                return { observation: numbered, success: true }
            }
            return { observation: content, success: true }
        } catch (e: any) {
            return { observation: `Cannot read ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolReadChunk(filePath: string, startLine: number, endLine: number, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            const lines = fs.readFileSync(full, 'utf-8').split('\n')
            const start = Math.max(0, (startLine || 1) - 1)
            const end = Math.min(lines.length, endLine || lines.length)
            const chunk = lines.slice(start, end).map((l, i) => `${String(start + i + 1).padStart(4)}: ${l}`).join('\n')
            return { observation: chunk, success: true }
        } catch (e: any) {
            return { observation: `Cannot read chunk of ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolWriteFile(filePath: string, content: string, cwd: string, onChunk?: (t: string) => void): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            fs.mkdirSync(path.dirname(full), { recursive: true })
            fs.writeFileSync(full, content, 'utf-8')
            onChunk?.(`\n[Writing ${filePath}...]\n`)
            return { observation: `Wrote ${content.split('\n').length} lines to ${filePath}`, success: true }
        } catch (e: any) {
            return { observation: `Cannot write ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolAppendFile(filePath: string, content: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            fs.mkdirSync(path.dirname(full), { recursive: true })
            fs.appendFileSync(full, content, 'utf-8')
            return { observation: `Appended to ${filePath}`, success: true }
        } catch (e: any) {
            return { observation: `Cannot append to ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolEditFile(filePath: string, oldContent: string, newContent: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            let content = fs.readFileSync(full, 'utf-8')
            if (!content.includes(oldContent)) {
                // Try normalized whitespace match
                const normalized = content.replace(/\r\n/g, '\n').replace(/\t/g, '  ')
                const normalizedOld = oldContent.replace(/\r\n/g, '\n').replace(/\t/g, '  ')
                if (!normalized.includes(normalizedOld)) {
                    return { observation: `Old content not found in ${filePath}. Use read_file first to verify exact content.`, success: false }
                }
                content = normalized.replace(normalizedOld, newContent)
            } else {
                content = content.replace(oldContent, newContent)
            }
            fs.writeFileSync(full, content, 'utf-8')
            return { observation: `Edited ${filePath} successfully`, success: true }
        } catch (e: any) {
            return { observation: `Cannot edit ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolMultiEdit(filePath: string, edits: Array<{ old_content: string; new_content: string }>, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            let content = fs.readFileSync(full, 'utf-8')
            let applied = 0
            for (const edit of edits) {
                if (content.includes(edit.old_content)) {
                    content = content.replace(edit.old_content, edit.new_content)
                    applied++
                }
            }
            fs.writeFileSync(full, content, 'utf-8')
            return { observation: `Applied ${applied}/${edits.length} edits to ${filePath}`, success: applied > 0 }
        } catch (e: any) {
            return { observation: `Cannot multi-edit ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolDeleteFile(filePath: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            if (fs.statSync(full).isDirectory()) {
                fs.rmSync(full, { recursive: true })
            } else {
                fs.unlinkSync(full)
            }
            return { observation: `Deleted ${filePath}`, success: true }
        } catch (e: any) {
            return { observation: `Cannot delete ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolMoveFile(source: string, destination: string, cwd: string): { observation: string; success: boolean } {
        try {
            const srcFull = path.resolve(cwd, source)
            const dstFull = path.resolve(cwd, destination)
            fs.mkdirSync(path.dirname(dstFull), { recursive: true })
            fs.renameSync(srcFull, dstFull)
            return { observation: `Moved ${source} → ${destination}`, success: true }
        } catch (e: any) {
            return { observation: `Cannot move ${source}: ${e.message}`, success: false }
        }
    }

    // ─── Shell & Navigation ───────────────────────────────────────────────────
    private async toolBash(command: string, cwd: string, onChunk?: (t: string) => void): Promise<{ observation: string; success: boolean }> {
        if (!command) return { observation: 'bash requires a command argument', success: false }
        if (isDangerous(command)) return { observation: `[BLOCKED] Dangerous command rejected: "${command}"`, success: false }

        onChunk?.(`\n[Running: ${command.slice(0, 60)}]\n`)

        // Install/build commands need more time; test suites need 2min; general ops 120s
        const isLongRunning = /npm install|npm ci|pip install|yarn install|cargo build|go build/i.test(command)
        const isTestRun = /pytest|npm test|npx jest|npx vitest|cargo test|go test/i.test(command)
        const timeoutMs = isLongRunning ? 300000 : isTestRun ? 120000 : 120000

        return new Promise((resolve) => {
            const { exec } = require('child_process')
            const isWindows = process.platform === 'win32'
            const shell = isWindows ? 'cmd.exe' : '/bin/sh'

            exec(command, { cwd, timeout: timeoutMs, shell, maxBuffer: 1024 * 1024 * 5 },
                (error: any, stdout: string, stderr: string) => {
                    const out = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')).trim()
                    if (error && !stdout) {
                        resolve({ observation: `Exit ${error.code || 1}\n${stderr || error.message}`, success: false })
                    } else {
                        resolve({ observation: `Exit 0\n${out || '(no output)'}`, success: true })
                    }
                })
        })
    }

    private toolFileTree(depth: number, cwd: string): { observation: string; success: boolean } {
        try {
            const lines: string[] = []
            const walk = (dir: string, d: number, prefix = '') => {
                if (d > depth) return
                const items = fs.readdirSync(dir).filter(i => !i.startsWith('.') && i !== 'node_modules' && i !== '__pycache__' && i !== 'dist')
                items.forEach((item, idx) => {
                    const isLast = idx === items.length - 1
                    const connector = isLast ? '└── ' : '├── '
                    const full = path.join(dir, item)
                    const stat = fs.statSync(full)
                    lines.push(`${prefix}${connector}${item}${stat.isDirectory() ? '/' : ''}`)
                    if (stat.isDirectory()) walk(full, d + 1, prefix + (isLast ? '    ' : '│   '))
                })
            }
            lines.push(path.basename(cwd) + '/')
            walk(cwd, 1)
            return { observation: lines.join('\n'), success: true }
        } catch (e: any) {
            return { observation: `Cannot build tree: ${e.message}`, success: false }
        }
    }

    private toolListDir(dirPath: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, dirPath)
            const items = fs.readdirSync(full)
            const lines = items.map(item => {
                const stat = fs.statSync(path.join(full, item))
                const size = stat.isFile() ? ` (${(stat.size / 1024).toFixed(1)}KB)` : ''
                return `${stat.isDirectory() ? 'd' : '-'} ${item}${size}`
            })
            return { observation: lines.join('\n'), success: true }
        } catch (e: any) {
            return { observation: `Cannot list ${dirPath}: ${e.message}`, success: false }
        }
    }

    private toolFindByName(pattern: string, cwd: string): { observation: string; success: boolean } {
        try {
            const results: string[] = []
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
            const walk = (dir: string) => {
                if (results.length > 100) return
                const items = fs.readdirSync(dir)
                for (const item of items) {
                    if (item === 'node_modules' || item === '.git' || item === 'dist') continue
                    const full = path.join(dir, item)
                    const rel = path.relative(cwd, full)
                    if (regex.test(item)) results.push(rel)
                    try { if (fs.statSync(full).isDirectory()) walk(full) } catch { /* skip */ }
                }
            }
            walk(cwd)
            return { observation: results.length > 0 ? results.join('\n') : `No files matching "${pattern}"`, success: results.length > 0 }
        } catch (e: any) {
            return { observation: `Find error: ${e.message}`, success: false }
        }
    }

    private toolGrepInFile(filePath: string, pattern: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            const lines = fs.readFileSync(full, 'utf-8').split('\n')
            const regex = new RegExp(pattern, 'i')
            const matches = lines
                .map((line, i) => ({ line, num: i + 1 }))
                .filter(({ line }) => regex.test(line))
                .map(({ line, num }) => `${String(num).padStart(4)}: ${line}`)
            return {
                observation: matches.length > 0 ? matches.join('\n') : `No matches for "${pattern}" in ${filePath}`,
                success: matches.length > 0
            }
        } catch (e: any) {
            return { observation: `Cannot grep ${filePath}: ${e.message}`, success: false }
        }
    }

    private toolSearchCodebase(query: string, cwd: string): { observation: string; success: boolean } {
        const results: string[] = []
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.md'])

        const walk = (dir: string) => {
            if (results.length > 50) return
            try {
                const items = fs.readdirSync(dir)
                for (const item of items) {
                    if (item === 'node_modules' || item === '.git' || item === 'dist' || item === '__pycache__') continue
                    const full = path.join(dir, item)
                    try {
                        const stat = fs.statSync(full)
                        if (stat.isDirectory()) { walk(full); continue }
                        if (!exts.has(path.extname(item))) continue
                        const lines = fs.readFileSync(full, 'utf-8').split('\n')
                        lines.forEach((line, i) => {
                            if (regex.test(line) && results.length < 50) {
                                results.push(`${path.relative(cwd, full)}:${i + 1}: ${line.trim()}`)
                            }
                        })
                    } catch { /* skip unreadable */ }
                }
            } catch { /* skip unreadable dirs */ }
        }
        walk(cwd)
        return {
            observation: results.length > 0 ? results.join('\n') : `No matches for "${query}"`,
            success: results.length > 0
        }
    }

    private toolViewOutline(filePath: string, cwd: string): { observation: string; success: boolean } {
        try {
            const full = path.resolve(cwd, filePath)
            const content = fs.readFileSync(full, 'utf-8')
            const lines = content.split('\n')
            const outline: string[] = []

            // Extract classes, functions, methods, exports
            const patterns = [
                { re: /^(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/, label: 'fn' },
                { re: /^(export\s+)?(abstract\s+)?class\s+(\w+)/, label: 'class' },
                { re: /^\s+(async\s+)?(\w+)\s*\(.*\)\s*[:{]/, label: 'method' },
                { re: /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/, label: 'fn' },
                { re: /^def\s+(\w+)/, label: 'fn' },  // Python
                { re: /^class\s+(\w+)/, label: 'class' },  // Python
            ]

            lines.forEach((line, i) => {
                for (const { re, label } of patterns) {
                    if (re.test(line.trim())) {
                        outline.push(`${String(i + 1).padStart(4)}: [${label}] ${line.trim().slice(0, 80)}`)
                        break
                    }
                }
            })

            return {
                observation: outline.length > 0 ? outline.join('\n') : `No symbols found in ${filePath}`,
                success: true
            }
        } catch (e: any) {
            return { observation: `Cannot outline ${filePath}: ${e.message}`, success: false }
        }
    }

    private async toolGetDiagnostics(filePath: string, cwd: string): Promise<{ observation: string; success: boolean }> {
        const full = path.resolve(cwd, filePath)
        const ext = path.extname(filePath)

        if (ext === '.ts' || ext === '.tsx') {
            return new Promise(resolve => {
                const { exec } = require('child_process')
                // Detect which TypeScript runner is available: local tsc, npx tsc, or none
                const hasTsconfig = fs.existsSync(path.join(cwd, 'tsconfig.json'))
                const localTsc = path.join(cwd, 'node_modules', '.bin', 'tsc')
                const hasLocalTsc = fs.existsSync(localTsc)

                if (!hasTsconfig && !hasLocalTsc) {
                    // No TypeScript setup — do a basic syntax check via node --check
                    exec(`node --check "${full}" 2>&1`, { cwd, timeout: 10000 },
                        (error: any, _: string, stderr: string) => {
                            resolve({
                                observation: error ? `Syntax error: ${stderr}` : `No syntax errors in ${filePath} (basic check — no tsconfig found)`,
                                success: !error
                            })
                        })
                    return
                }

                const tscCmd = hasLocalTsc ? `"${localTsc}" --noEmit --skipLibCheck --pretty false 2>&1` : `npx --no-install tsc --noEmit --skipLibCheck --pretty false 2>&1`
                exec(tscCmd, { cwd, timeout: 30000 },
                    (_: any, stdout: string) => {
                        const lines = stdout.split('\n').filter(l => l.trim())
                        if (lines.length === 0 || stdout.trim() === '') {
                            resolve({ observation: `No TypeScript errors`, success: true })
                        } else {
                            const base = path.basename(filePath)
                            const relevant = lines.filter(l => l.includes(base))
                            const output = relevant.length > 0
                                ? `Errors in ${filePath}:\n${relevant.join('\n')}\n\nAll errors (${lines.length} total):\n${lines.slice(0, 20).join('\n')}`
                                : `No errors in ${filePath}. Other errors:\n${lines.slice(0, 20).join('\n')}`
                            resolve({ observation: output, success: relevant.length === 0 })
                        }
                    })
            })
        }

        // Python: try py_compile, fall back to ast.parse check
        if (ext === '.py') {
            return new Promise(resolve => {
                const { exec } = require('child_process')
                exec(`python -m py_compile "${full}" 2>&1`, { cwd, timeout: 10000 },
                    (error: any, _: string, stderr: string) => {
                        if (error && stderr.includes('python: not found')) {
                            // Try python3
                            exec(`python3 -m py_compile "${full}" 2>&1`, { cwd, timeout: 10000 },
                                (err2: any, __: string, stderr2: string) => {
                                    resolve({
                                        observation: err2 ? `Syntax error: ${stderr2}` : `No syntax errors in ${filePath}`,
                                        success: !err2
                                    })
                                })
                        } else {
                            resolve({
                                observation: error ? `Syntax error: ${stderr}` : `No syntax errors in ${filePath}`,
                                success: !error
                            })
                        }
                    })
            })
        }

        // JS/JSX: use node --check for basic syntax validation
        if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
            return new Promise(resolve => {
                const { exec } = require('child_process')
                exec(`node --check "${full}" 2>&1`, { cwd, timeout: 10000 },
                    (error: any, _: string, stderr: string) => {
                        resolve({
                            observation: error ? `Syntax error: ${stderr}` : `No syntax errors in ${filePath}`,
                            success: !error
                        })
                    })
            })
        }

        return { observation: `Diagnostics not supported for ${ext} files. Use bash to run a linter.`, success: true }
    }

    private async toolRunTests(command: string | undefined, testFile: string | undefined, cwd: string, onChunk?: (t: string) => void): Promise<{ observation: string; success: boolean }> {
        // Auto-detect test command if not provided
        let cmd = command
        if (!cmd) {
            // Check package.json test script first — always prefer the project's own runner
            const pkgPath = path.join(cwd, 'package.json')
            let pkgTestScript: string | undefined
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
                pkgTestScript = pkg?.scripts?.test
            } catch { /* ignore */ }

            if (testFile) {
                const ext = path.extname(testFile)
                if (ext === '.py') {
                    cmd = `python -m pytest "${testFile}" -v 2>&1`
                } else if (pkgTestScript) {
                    // Use the project's own test runner — pass the file as argument
                    // Detect runner from the script
                    if (pkgTestScript.includes('mocha')) {
                        cmd = `npx mocha --require test/support/env "${testFile}" 2>&1`
                    } else if (pkgTestScript.includes('vitest')) {
                        cmd = `npx vitest run "${testFile}" 2>&1`
                    } else if (pkgTestScript.includes('jest')) {
                        cmd = `npx jest "${testFile}" 2>&1`
                    } else {
                        cmd = `npm test 2>&1`
                    }
                } else {
                    cmd = `npm test 2>&1`
                }
            } else {
                const hasPy = fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))
                if (hasPy) cmd = `python -m pytest -v 2>&1`
                else if (pkgTestScript) cmd = `npm test 2>&1`
                else cmd = `echo "No test runner detected"`
            }
        }

        onChunk?.(`\n[Running tests: ${cmd?.slice(0, 80)}]\n`)
        return this.toolBash(cmd!, cwd, onChunk)
    }

    // ─── New Tools: search_web, async commands, checkpoint ───────────────────

    private async toolSearchWeb(query: string): Promise<{ observation: string; success: boolean }> {
        if (!query) return { observation: 'search_web requires a query', success: false }
        try {
            // Use DuckDuckGo instant answer API — no key required
            const encoded = encodeURIComponent(query)
            const resp = await axios.get(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`, {
                timeout: 10000,
                headers: { 'User-Agent': 'Nova-Agent/1.0' }
            })
            const data = resp.data
            const results: string[] = []

            if (data.AbstractText) results.push(`Summary: ${data.AbstractText}`)
            if (data.AbstractURL) results.push(`Source: ${data.AbstractURL}`)
            if (data.RelatedTopics?.length) {
                const topics = data.RelatedTopics
                    .filter((t: any) => t.Text)
                    .slice(0, 5)
                    .map((t: any) => `• ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ''}`)
                if (topics.length) results.push(`Related:\n${topics.join('\n')}`)
            }

            if (results.length === 0) {
                // Fallback: return a search URL the agent can reference
                return {
                    observation: `No instant answer found. Search manually at: https://duckduckgo.com/?q=${encoded}\nOr try: https://stackoverflow.com/search?q=${encoded}`,
                    success: false
                }
            }

            return { observation: results.join('\n\n'), success: true }
        } catch (e: any) {
            return { observation: `Web search failed: ${e.message}. Try bash with curl or check docs manually.`, success: false }
        }
    }

    // Async command registry: commandId → { process, output, done }
    private asyncCommands: Map<string, { output: string; done: boolean; exitCode?: number }> = new Map()

    private async toolRunAsyncCommand(command: string, cwd: string): Promise<{ observation: string; success: boolean }> {
        if (!command) return { observation: 'run_async_command requires a command', success: false }
        if (isDangerous(command)) return { observation: `[BLOCKED] Dangerous command rejected`, success: false }

        const commandId = `async-${Date.now()}`
        const state = { output: '', done: false, exitCode: undefined as number | undefined }
        this.asyncCommands.set(commandId, state)

        const { exec } = require('child_process')
        const isWindows = process.platform === 'win32'
        const shell = isWindows ? 'cmd.exe' : '/bin/sh'

        const proc = exec(command, { cwd, shell, maxBuffer: 1024 * 1024 * 5 })
        proc.stdout?.on('data', (d: string) => { state.output += d; state.output = state.output.slice(-50000) })
        proc.stderr?.on('data', (d: string) => { state.output += d; state.output = state.output.slice(-50000) })
        proc.on('close', (code: number) => { state.done = true; state.exitCode = code })

        return {
            observation: `Started async command (id: ${commandId}): ${command.slice(0, 80)}\nUse check_command_status({"command_id": "${commandId}"}) to poll output.`,
            success: true
        }
    }

    private toolCheckCommandStatus(commandId: string): { observation: string; success: boolean } {
        const state = this.asyncCommands.get(commandId)
        if (!state) return { observation: `No async command with id: ${commandId}`, success: false }

        const status = state.done ? `DONE (exit ${state.exitCode ?? '?'})` : 'RUNNING'
        const output = state.output.slice(-3000) || '(no output yet)'
        return {
            observation: `[${status}]\n${output}`,
            success: state.done ? state.exitCode === 0 : true
        }
    }

    // ─── Checkpoint / Resume ──────────────────────────────────────────────────

    private getCheckpointPath(cwd: string): string {
        return path.join(cwd, '.nova', 'agent-checkpoint.json')
    }

    private saveCheckpoint(cwd: string, data: { prompt: string; model: string; iteration: number; context: any[] }): void {
        try {
            const dir = path.join(cwd, '.nova')
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(this.getCheckpointPath(cwd), JSON.stringify({ ...data, savedAt: Date.now() }, null, 2))
        } catch { /* ignore checkpoint failures */ }
    }

    private loadCheckpoint(cwd: string): { prompt: string; model: string; iteration: number; context: any[]; savedAt: number } | null {
        try {
            const p = this.getCheckpointPath(cwd)
            if (!fs.existsSync(p)) return null
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
            // Only restore checkpoints less than 24 hours old
            if (Date.now() - data.savedAt > 86400000) { fs.unlinkSync(p); return null }
            return data
        } catch { return null }
    }

    private clearCheckpoint(cwd: string): void {
        try { fs.unlinkSync(this.getCheckpointPath(cwd)) } catch { /* ignore */ }
    }

    // ─── Parsing & Prompts ────────────────────────────────────────────────────

    private parseAllToolCalls(text: string): Array<{ name: string; tool: string; args: any }> {
        const results: Array<{ name: string; tool: string; args: any }> = []

        // Support <tool_call> and <tool_calls> (plural)
        const re = /<tool_calls?>\s*([\s\S]*?)\s*<\/tool_calls?>/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
            try {
                const p = JSON.parse(m[1].trim())
                const name = p.name || p.tool
                if (name) results.push({ name, tool: name, args: p.args || p.parameters || {} })
            } catch { /* skip */ }
        }
        if (results.length > 0) return results

        // Fallback: bare JSON code block
        const jm = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || text.match(/(\{[\s\S]*?"name"[\s\S]*?\})/)
        if (jm) {
            try {
                const p = JSON.parse(jm[1])
                if (p.name) results.push({ name: p.name, tool: p.name, args: p.args || {} })
            } catch { /* skip */ }
        }

        return results
    }

    private extractThought(text: string): string {
        // Handle THOUGHT: prefix in various positions
        const m = text.match(/THOUGHT:\s*([\s\S]*?)(?=<tool_calls?|$)/i)
        if (m) return m[1].trim()
        // Strip tool_call blocks and return remaining text
        return text.replace(/<tool_calls?>[\s\S]*?<\/tool_calls?>/gi, '').trim()
    }

    private buildWorkspaceContext(cwd: string): string {
        const parts: string[] = []
        try {
            // File tree (depth 2)
            const treeResult = this.toolFileTree(2, cwd)
            if (treeResult.success) parts.push(`[WORKSPACE]\n${treeResult.observation.slice(0, 1500)}`)

            // Package manifest
            const pkgFile = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].find(f => fs.existsSync(path.join(cwd, f)))
            if (pkgFile) {
                const content = fs.readFileSync(path.join(cwd, pkgFile), 'utf-8').slice(0, 300)
                parts.push(`[PROJECT: ${pkgFile}]\n${content}`)
            }
        } catch { /* ignore */ }
        return parts.join('\n\n')
    }

    private getSystemPrompt(cwd: string): string {
        return `You are Nova, an autonomous AI coding agent. Working directory: ${cwd}

## RESPONSE FORMAT

THOUGHT:
<your reasoning — what you know, what you plan>

<tool_call>
{"name": "tool_name", "args": {"key": "value"}}
</tool_call>

Rules:
- Always write THOUGHT before tool_call
- Output ONE tool_call per turn (or zero when done)
- For READ-ONLY tools (read_file, read_chunk, grep_in_file, search_codebase, get_file_tree, list_dir, find_by_name, view_file_outline, get_diagnostics) you MAY output 2-4 tool_calls in one turn to read in parallel
- When done, write THOUGHT with final answer and OMIT tool_call
- NEVER describe what you are about to do in a THOUGHT without also including the tool_call to do it — describing an action is not the same as performing it
- After writing any file, you MUST verify with at least one follow-up action (read_file to confirm content, or run_tests/bash to confirm it works)
- Never repeat the EXACT same action twice in a row — if a tool call returns the same result, try a different approach
- After writing a file, verify it with read_file

## TASK PLANNING (classify before acting)
- SIMPLE (read/explain/find): respond directly, 1-3 tool calls max
- MEDIUM (bug fix, add feature to 1-2 files): run test first, fix, verify
- COMPLEX (refactor, multi-file feature): plan steps mentally, execute sequentially, verify each step

## BUG-FIXING STRATEGY (MANDATORY for any bug fix or test failure)
Follow this EXACT order — do NOT skip steps:
1. Run the failing test FIRST before reading any code:
   bash("python -m pytest path/to/test.py::test_name -xvs 2>&1 | tail -50")
   OR: bash("npm test -- --testNamePattern='test_name' 2>&1 | tail -50")
2. Read the error message carefully — understand what is ACTUALLY broken:
   - Note the exact assertion that failed
   - Note the expected vs actual values
   - Note the stack trace and which line failed
3. Search for the relevant code based on the error (not guessing):
   - Use grep_in_file or search_codebase with keywords from the error
   - Read the implementation file the test is testing
4. Make the MINIMAL fix — change only what is needed
5. Run the test again to verify the fix works
6. If tests still fail, read the NEW error — do NOT repeat the same fix
7. Run ALL related tests before concluding

CRITICAL:
- NEVER edit code before seeing the test failure output (step 1)
- NEVER repeat the same bash command if output is identical — try something different
- NEVER repeat the same file edit if it didn't work — the approach is wrong
- If stuck after 3 attempts, read the test file itself to understand what it expects
- NEVER spend more than 3 iterations reading/searching before writing something — if you understand the pattern from one example file, act on it

## TYPESCRIPT CONVERSION STRATEGY
When converting JS to TypeScript:
1. Read the original JS file fully
2. Use move_file to rename .js → .ts (preserves git history)
3. Add types incrementally — run get_diagnostics after each batch of changes
4. Fix errors one category at a time (missing types → wrong types → imports)
5. Update package.json: add typescript, @types/node; add tsconfig.json
6. Run bash("npx tsc --noEmit") to verify zero errors before finishing

## TEST COVERAGE STRATEGY
When asked to add test coverage:
1. Run bash("npm test -- --coverage 2>&1") to see current coverage report
2. Read the coverage output — identify which lines/branches are uncovered
3. Read the source file to understand all code paths
4. Write tests targeting uncovered branches specifically
5. Re-run with coverage to verify improvement
6. Repeat until target coverage is reached

## TOOLS

### File Operations
- read_file path:string — read file with line numbers
- read_chunk path:string start_line:number end_line:number — read specific lines
- write_file path:string content:string — create or overwrite file
- append_to_file path:string content:string — append to file
- edit_file path:string old_content:string new_content:string — replace text in file
- multi_edit_file path:string edits:[{old_content,new_content}] — multiple edits in one pass
- move_file source:string destination:string — move or rename a file
- delete_file path:string — delete file or directory

### Navigation & Search
- get_file_tree depth:number — show directory tree
- list_dir path:string — list directory contents with sizes
- find_by_name pattern:string — find files by name/glob
- grep_in_file path:string pattern:string — search within a file (safe to call multiple times with different patterns)
- search_codebase query:string — search across all source files
- view_file_outline path:string — show classes/functions/methods

### Code Quality
- get_diagnostics path:string — TypeScript errors (uses local tsc if available, falls back to node --check) or Python syntax errors; also works for .js files
- run_tests command?:string test_file?:string — run test suite

### Shell
- bash command:string — run any shell command (git, npm, python, pytest, etc.)
  NOTE: On Windows, use 'findstr' instead of 'grep', use 'type' instead of 'cat', use 'dir' instead of 'ls'.
  Prefer search_codebase and grep_in_file over bash grep — they work cross-platform.
  NOTE: If npm test fails with "mocha not found" or similar, run 'npm install' first (allow up to 5 minutes).
  NOTE: npm install and pip install may take 1-3 minutes — this is normal, wait for them to complete.

### Web & Async
- search_web query:string — search the web for docs, error messages, or library info (no API key needed)
- run_async_command command:string — start a long-running command in background (returns command_id); use for dev servers, watchers
- check_command_status command_id:string — poll output of a background command started with run_async_command`
    }
}

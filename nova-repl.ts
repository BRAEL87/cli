#!/usr/bin/env node
/**
 * Nova REPL - Interactive CLI interface like Claude Code
 * Usage: npx tsx nova-repl.ts
 */
import 'dotenv/config'
import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'
import { StandaloneAgent } from './standalone-agent'

// ─── Config file (~/.nova_config) ────────────────────────────────────────────

const CONFIG_FILE = path.join(os.homedir(), '.nova_config')
const HISTORY_FILE = path.join(os.homedir(), '.nova_history')
const MAX_HISTORY = 100

interface NovaConfig {
    model: string
    apiKey?: string
    apiBase?: string
    maxIterations: number
    debug: boolean
    customModels?: Array<{ id: string; label: string; note: string }>
    onboarded?: boolean
}

const DEFAULT_CONFIG: NovaConfig = {
    model: 'tencent/hy3-preview:free',
    apiBase: 'https://openrouter.ai/api/v1',
    maxIterations: 40,
    debug: false,
    customModels: [],
    onboarded: false,
}

function loadConfig(): NovaConfig {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
        }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIG }
}

function saveConfig(cfg: NovaConfig) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
    } catch { /* ignore */ }
}

// ─── Known Providers ──────────────────────────────────────────────────────────

interface ProviderEntry {
    id: string
    label: string
    apiBase: string
    note: string
    authNote: string
}

const KNOWN_PROVIDERS: ProviderEntry[] = [
    {
        id: 'openrouter',
        label: 'OpenRouter (recommended)',
        apiBase: 'https://openrouter.ai/api/v1',
        note: 'Access 200+ models, genuinely free tier — no credit card',
        authNote: 'Get free key at openrouter.ai/keys (takes 30 seconds)'
    },
    {
        id: 'puter',
        label: 'Puter (browser only)',
        apiBase: 'https://api.puter.com/puterai/openai/v1',
        note: 'Puter free models only work in browsers — not supported in CLI',
        authNote: 'Use the Nova Studio desktop app for Puter models instead'
    },
    {
        id: 'openai',
        label: 'OpenAI (direct)',
        apiBase: 'https://api.openai.com/v1',
        note: 'Direct OpenAI API',
        authNote: 'Get key at platform.openai.com/api-keys'
    },
    {
        id: 'custom',
        label: 'Custom / Local',
        apiBase: '',
        note: 'Any OpenAI-compatible endpoint (Ollama, LM Studio, etc.)',
        authNote: 'Enter your endpoint URL'
    },
]

// ─── Known Models ─────────────────────────────────────────────────────────────

interface ModelEntry {
    id: string
    label: string
    free: boolean
    note: string
}

const KNOWN_MODELS: ModelEntry[] = [
    // Free via OpenRouter
    { id: 'tencent/hy3-preview:free',                    label: 'Hy3 Preview',           free: true,  note: '74.4% SWE-bench — best free (OpenRouter)' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free',       label: 'Qwen 2.5 Coder 32B',    free: true,  note: 'coding specialist (OpenRouter)' },
    { id: 'google/gemini-2.0-flash-thinking-exp:free',   label: 'Gemini 2.0 Flash Think', free: true,  note: 'strong reasoning (OpenRouter)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free',      label: 'Llama 3.3 70B',         free: true,  note: 'general purpose (OpenRouter)' },
    { id: 'openrouter/free',                             label: 'Auto (best free)',       free: true,  note: 'auto-selects available free model' },
    // Free via Puter (requires Puter auth token + api base change)
    { id: 'claude-opus-4-7',                             label: 'Claude Opus 4.7 (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    { id: 'gpt-5.5',                                     label: 'GPT-5.5 (Puter)',        free: true,  note: 'free via Puter — set api base to puter' },
    { id: 'gemini-3-pro',                                label: 'Gemini 3 Pro (Puter)',   free: true,  note: 'free via Puter — set api base to puter' },
    { id: 'deepseek-v4-pro',                             label: 'DeepSeek V4 Pro (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    // Paid via OpenRouter
    { id: 'openai/gpt-4o-mini',                          label: 'GPT-4o Mini',            free: false, note: '$0.15/1M — cheap & reliable' },
    { id: 'openai/gpt-4o',                               label: 'GPT-4o',                 free: false, note: '$2.50/1M — strong' },
    { id: 'anthropic/claude-3.5-sonnet',                 label: 'Claude 3.5 Sonnet',      free: false, note: '$3/1M — excellent coding' },
    { id: 'google/gemini-flash-1.5',                     label: 'Gemini Flash 1.5',       free: false, note: '$0.075/1M — very fast' },
    { id: 'deepseek/deepseek-r1',                        label: 'DeepSeek R1',            free: false, note: '$0.55/1M — strong reasoning' },
]

// ─── State ────────────────────────────────────────────────────────────────────

const cfg = loadConfig()

const state = {
    model: process.env.NOVA_MODEL || cfg.model,
    workspace: process.cwd(),
    maxIterations: cfg.maxIterations,
    debug: cfg.debug,
    history: [] as string[],
}

// Apply saved API base if not overridden by env
if (cfg.apiBase && !process.env.NOVA_API_BASE) {
    process.env.NOVA_API_BASE = cfg.apiBase
}
if (cfg.apiKey && !process.env.NOVA_API_KEY) {
    process.env.NOVA_API_KEY = cfg.apiKey
}


// ─── Platform Detection ───────────────────────────────────────────────────────

const isWindows = process.platform === 'win32'
const supportsUnicode = !isWindows || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode'

// ─── UI Helpers ───────────────────────────────────────────────────────────────

const NOVA_LOGO_UNICODE = `
${chalk.cyan('███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ')}
${chalk.cyan('████╗  ██║██╔═══██╗██║   ██║██╔══██╗')}
${chalk.cyan('██╔██╗ ██║██║   ██║██║   ██║███████║')}
${chalk.cyan('██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║')}
${chalk.cyan('██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║')}
${chalk.cyan('╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝')}
`

const NOVA_LOGO_ASCII = `
${chalk.cyan('  _   _  _____  _   _  ___')}
${chalk.cyan(' | \\ | ||  _  || | | |/ _ \\')}
${chalk.cyan(' |  \\| || | | || | | / /_\\ \\')}
${chalk.cyan(' | . ` || | | || | | |  _  |')}
${chalk.cyan(' | |\\  |\\ \\_/ /\\ \\_/ / | | |')}
${chalk.cyan(' \\_| \\_/ \\___/  \\___/\\_| |_/')}
`

const NOVA_LOGO = supportsUnicode ? NOVA_LOGO_UNICODE : NOVA_LOGO_ASCII

const DIVIDER = supportsUnicode ? '─'.repeat(37) : '-'.repeat(37)

function printBanner() {
    console.clear()
    console.log(NOVA_LOGO)
    console.log(chalk.gray('  Autonomous AI Coding Agent'))
    console.log(chalk.gray(`  ${DIVIDER}`))
    console.log(`  ${chalk.bold('Model:')}     ${chalk.green(state.model)}`)
    console.log(`  ${chalk.bold('Workspace:')} ${chalk.yellow(state.workspace)}`)
    console.log(`  ${chalk.bold('Max iter:')}  ${chalk.yellow(state.maxIterations)}`)
    console.log()
    console.log(chalk.gray('  Type your task, or /help for commands'))
    console.log(chalk.gray('  ─────────────────────────────────────'))
    console.log()
}

function printHelp() {
    console.log()
    console.log(chalk.bold('  Commands:'))
    console.log(`  ${chalk.cyan('/help')}              Show this help`)
    console.log(`  ${chalk.cyan('/models')}            Browse & select model interactively`)
    console.log(`  ${chalk.cyan('/model <id>')}        Set model directly by ID`)
    console.log(`  ${chalk.cyan('/model delete <id>')} Delete a custom model from your list`)
    console.log(`  ${chalk.cyan('/provider')}          Switch API provider (OpenRouter, Puter, OpenAI, custom)`)
    console.log(`  ${chalk.cyan('/workspace <path>')}  Change workspace directory`)
    console.log(`  ${chalk.cyan('/iter <n>')}          Set max iterations (default: 40)`)
    console.log(`  ${chalk.cyan('/debug')}             Toggle debug mode`)
    console.log(`  ${chalk.cyan('/clear')}             Clear screen`)
    console.log(`  ${chalk.cyan('/status')}            Show current settings`)
    console.log(`  ${chalk.cyan('/history')}           Show recent prompts`)
    console.log(`  ${chalk.cyan('/exit')}              Exit Nova`)
    console.log()
    console.log(chalk.bold('  Free Models:'))
    console.log(`  ${chalk.green('tencent/hy3-preview:free')}          ${chalk.gray('Best free (74.4% SWE-bench)')}`)
    console.log(`  ${chalk.green('qwen/qwen-2.5-coder-32b-instruct:free')} ${chalk.gray('Coding specialist')}`)
    console.log(`  ${chalk.green('openrouter/free')}                   ${chalk.gray('Auto-select free model')}`)
    console.log()
    console.log(chalk.bold('  Examples:'))
    console.log(`  ${chalk.gray('>')} Create a Python function that sorts a list`)
    console.log(`  ${chalk.gray('>')} Fix the bug in app.py where login returns 401`)
    console.log(`  ${chalk.gray('>')} Add error handling to all functions in utils.py`)
    console.log()
}

function printStatus() {
    console.log()
    console.log(chalk.bold('  Current Settings:'))
    console.log(`  Model:          ${chalk.green(state.model)}`)
    console.log(`  Workspace:      ${chalk.yellow(state.workspace)}`)
    console.log(`  Max iterations: ${chalk.yellow(state.maxIterations)}`)
    console.log(`  Debug:          ${state.debug ? chalk.green('on') : chalk.gray('off')}`)
    const currentBase = process.env.NOVA_API_BASE || cfg.apiBase || 'https://openrouter.ai/api/v1'
    const isPuter = currentBase.includes('puter.com')
    const apiKeyStatus = process.env.NOVA_API_KEY
        ? chalk.green('set ✓')
        : isPuter
            ? chalk.gray('not needed (Puter)')
            : chalk.red('not set ✗')
    console.log(`  API Key:        ${apiKeyStatus}`)
    console.log(`  API Base:       ${chalk.gray(currentBase)}`)
    console.log(`  Config file:    ${chalk.gray(CONFIG_FILE)}`)
    console.log()
}

function printIterationUpdate(iteration: number, maxIter: number, thought: string, tool?: string) {
    const bar = buildProgressBar(iteration, maxIter)
    const iterStr = chalk.gray(`[${iteration}/${maxIter}]`)
    const toolStr = tool ? chalk.cyan(` → ${tool}`) : ''
    const thoughtStr = thought.length > 60 ? thought.slice(0, 60) + '…' : thought

    process.stdout.write(`\r  ${iterStr} ${bar}${toolStr} ${chalk.gray(thoughtStr)}`)
}

function buildProgressBar(current: number, max: number, width = 12): string {
    const filled = Math.round((current / max) * width)
    const empty = width - filled
    return chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
}

function printSuccess(iterations: number) {
    console.log()
    console.log()
    console.log(`  ${chalk.green('✓')} ${chalk.bold('Task completed')} ${chalk.gray(`in ${iterations} iteration${iterations !== 1 ? 's' : ''}`)}`)
    console.log()
}

function printError(msg: string) {
    console.log()
    console.log(`  ${chalk.red('✗')} ${chalk.bold('Failed:')} ${chalk.red(msg)}`)
    console.log()
}

function printThought(thought: string) {
    if (!state.debug) return
    console.log()
    console.log(chalk.gray('  ┌─ Thought ─────────────────────────────'))
    const lines = thought.split('\n').slice(0, 5)
    lines.forEach(l => console.log(chalk.gray(`  │ ${l}`)))
    console.log(chalk.gray('  └───────────────────────────────────────'))
}

function printAction(tool: string, args: any) {
    const argsStr = JSON.stringify(args).slice(0, 80)
    console.log(`  ${chalk.blue('⚡')} ${chalk.bold(tool)} ${chalk.gray(argsStr)}`)
}

function printObservation(obs: string, success: boolean) {
    if (!state.debug) return
    const icon = success ? chalk.green('✓') : chalk.red('✗')
    const preview = obs.slice(0, 100).replace(/\n/g, ' ')
    console.log(`  ${icon} ${chalk.gray(preview)}`)
}

// ─── History ──────────────────────────────────────────────────────────────────

function loadHistory(): string[] {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return fs.readFileSync(HISTORY_FILE, 'utf-8')
                .split('\n')
                .filter(Boolean)
                .slice(-MAX_HISTORY)
        }
    } catch { /* ignore */ }
    return []
}

function saveHistory(history: string[]) {
    try {
        fs.writeFileSync(HISTORY_FILE, history.slice(-MAX_HISTORY).join('\n') + '\n')
    } catch { /* ignore */ }
}

function addToHistory(prompt: string) {
    if (!prompt.trim() || prompt.startsWith('/')) return
    state.history = state.history.filter(h => h !== prompt)
    state.history.push(prompt)
    saveHistory(state.history)
}

// ─── Interactive Model Picker ─────────────────────────────────────────────────

async function pickProvider(): Promise<void> {
    console.log()
    console.log(chalk.bold('  Select a provider:'))
    console.log()

    KNOWN_PROVIDERS.forEach((p, i) => {
        const currentBase = process.env.NOVA_API_BASE || cfg.apiBase || DEFAULT_CONFIG.apiBase
        const active = currentBase?.includes(p.apiBase.split('/')[2] || '') ? chalk.cyan(' ◀ current') : ''
        console.log(`  ${chalk.cyan(String(i + 1))}  ${chalk.bold(p.label.padEnd(20))} ${chalk.gray(p.note)}${active}`)
        console.log(`     ${chalk.gray(p.authNote)}`)
        console.log()
    })

    console.log(chalk.gray('  Enter number or paste a custom API base URL:'))
    console.log()

    const answer = await new Promise<string>(resolve => {
        rl.question(chalk.cyan('  ❯ '), resolve)
    })

    const trimmed = answer.trim()
    if (!trimmed) { console.log(chalk.gray('  Cancelled.')); console.log(); return }

    let selectedBase = ''
    const num = parseInt(trimmed)

    if (!isNaN(num) && num >= 1 && num <= KNOWN_PROVIDERS.length) {
        const provider = KNOWN_PROVIDERS[num - 1]
        if (provider.id === 'custom') {
            const urlAnswer = await new Promise<string>(resolve => {
                rl.question(chalk.gray('  Enter API base URL: '), resolve)
            })
            selectedBase = urlAnswer.trim()
        } else {
            selectedBase = provider.apiBase
        }
    } else if (trimmed.startsWith('http')) {
        selectedBase = trimmed
    } else {
        console.log(chalk.red('  Invalid selection'))
        console.log()
        return
    }

    if (!selectedBase) return

    // Save to config
    cfg.apiBase = selectedBase
    saveConfig(cfg)
    process.env.NOVA_API_BASE = selectedBase

    console.log(`  ${chalk.green('✓')} API base set to ${chalk.green(selectedBase)}`)
    console.log(`  ${chalk.gray('Saved to')} ${chalk.gray(CONFIG_FILE)}`)
    console.log()

    // Prompt for API key if switching providers
    const keyAnswer = await new Promise<string>(resolve => {
        rl.question(chalk.gray('  Enter API key for this provider (or press Enter to skip): '), resolve)
    })
    if (keyAnswer.trim()) {
        process.env.NOVA_API_KEY = keyAnswer.trim()
        cfg.apiKey = keyAnswer.trim()
        saveConfig(cfg)
        console.log(`  ${chalk.green('✓')} API key updated`)
    }
    console.log()
}

async function pickModel(): Promise<void> {
    const freeModels = KNOWN_MODELS.filter(m => m.free)
    const paidModels = KNOWN_MODELS.filter(m => !m.free)
    const customModels = cfg.customModels || []

    console.log()
    console.log(chalk.bold('  Select a model:'))
    console.log()

    if (customModels.length > 0) {
        console.log(chalk.magenta('  ── Your Custom Models ──'))
        customModels.forEach((m, i) => {
            const active = m.id === state.model ? chalk.cyan(' ◀ current') : ''
            console.log(`  ${chalk.magenta(String(i + 1).padStart(2))}  ${chalk.bold(m.label.padEnd(28))} ${chalk.gray(m.note)}${active}`)
        })
        console.log()
    }

    const offset = customModels.length
    console.log(chalk.green('  ── Free Models ──'))
    freeModels.forEach((m, i) => {
        const active = m.id === state.model ? chalk.cyan(' ◀ current') : ''
        console.log(`  ${chalk.cyan(String(offset + i + 1).padStart(2))}  ${chalk.bold(m.label.padEnd(28))} ${chalk.gray(m.note)}${active}`)
    })

    console.log()
    console.log(chalk.yellow('  ── Paid Models ──'))
    paidModels.forEach((m, i) => {
        const idx = offset + freeModels.length + i + 1
        const active = m.id === state.model ? chalk.cyan(' ◀ current') : ''
        console.log(`  ${chalk.yellow(String(idx).padStart(2))}  ${chalk.bold(m.label.padEnd(28))} ${chalk.gray(m.note)}${active}`)
    })

    const total = customModels.length + freeModels.length + paidModels.length
    console.log()
    console.log(chalk.gray(`  Enter number (1-${total}), a model ID, or type a custom ID:`))
    console.log(chalk.gray(`  (e.g. "claude-opus-4-7" for Puter, "ollama/llama3" for local)`))
    if (customModels.length > 0) {
        console.log(chalk.gray(`  Prefix with "d" to delete a custom model (e.g. "d1" deletes #1)`))
    }
    console.log()

    const answer = await new Promise<string>(resolve => {
        rl.question(chalk.cyan('  ❯ '), resolve)
    })

    const trimmed = answer.trim()
    if (!trimmed) {
        console.log(chalk.gray('  Cancelled.'))
        console.log()
        return
    }

    // Number selection
    const num = parseInt(trimmed)
    if (!isNaN(num) && num >= 1 && num <= total) {
        const allModels = [...customModels, ...freeModels, ...paidModels]
        const selected = allModels[num - 1]
        setModel(selected.id)
        return
    }

    // "d<n>" = delete custom model by number
    const deleteMatch = trimmed.match(/^d(\d+)$/i)
    if (deleteMatch) {
        const delNum = parseInt(deleteMatch[1])
        if (delNum >= 1 && delNum <= customModels.length) {
            const target = customModels[delNum - 1]
            const confirm = await new Promise<string>(resolve => {
                rl.question(chalk.red(`  Delete "${target.label}" (${target.id})? (y/N) `), resolve)
            })
            if (confirm.trim().toLowerCase() === 'y') {
                deleteCustomModel(target.id)
            } else {
                console.log(chalk.gray('  Cancelled.'))
                console.log()
            }
        } else {
            console.log(chalk.red(`  Can only delete custom models (numbers 1-${customModels.length})`))
            console.log()
        }
        return
    }

    // Any string = custom model ID
    setModel(trimmed)
    // Ask if they want to save it
    const saveAnswer = await new Promise<string>(resolve => {
        rl.question(chalk.gray(`  Save "${trimmed}" to your model list? (y/N) `), resolve)
    })
    if (saveAnswer.trim().toLowerCase() === 'y') {
        const labelAnswer = await new Promise<string>(resolve => {
            rl.question(chalk.gray('  Label (e.g. "My Puter Claude"): '), resolve)
        })
        const noteAnswer = await new Promise<string>(resolve => {
            rl.question(chalk.gray('  Note (e.g. "via Puter, free"): '), resolve)
        })
        const newEntry = { id: trimmed, label: labelAnswer.trim() || trimmed, note: noteAnswer.trim() || '' }
        // Update both disk and in-memory cfg so it shows up immediately
        cfg.customModels = [...(cfg.customModels || []), newEntry]
        saveConfig(cfg)
        console.log(`  ${chalk.green('✓')} Saved to your model list`)
    }
    console.log()
}

function setModel(modelId: string) {
    state.model = modelId
    // Update both in-memory cfg and disk
    cfg.model = modelId
    saveConfig(cfg)
    console.log(`  ${chalk.green('✓')} Model set to ${chalk.green(modelId)}`)
    console.log(`  ${chalk.gray('Saved to')} ${chalk.gray(CONFIG_FILE)}`)
    console.log()
}

function deleteCustomModel(modelId: string) {
    const before = (cfg.customModels || []).length
    cfg.customModels = (cfg.customModels || []).filter(m => m.id !== modelId)
    const after = cfg.customModels.length

    if (before === after) {
        console.log(`  ${chalk.red('✗')} Model not found in your custom list: ${chalk.yellow(modelId)}`)
        console.log(`  ${chalk.gray('Only custom models can be deleted. Built-in models cannot be removed.')}`)
    } else {
        saveConfig(cfg)
        console.log(`  ${chalk.green('✓')} Deleted ${chalk.yellow(modelId)} from your model list`)
        // If deleted model was active, reset to default
        if (state.model === modelId) {
            setModel(DEFAULT_CONFIG.model)
            console.log(`  ${chalk.gray('Active model reset to default:')} ${chalk.green(DEFAULT_CONFIG.model)}`)
        }
    }
    console.log()
}

// ─── Command Handling ─────────────────────────────────────────────────────────

function handleCommand(input: string): boolean {
    const parts = input.trim().split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const arg = parts.slice(1).join(' ')

    switch (cmd) {
        case '/help':
            printHelp()
            return true

        case '/models':
            // Async — handled separately in the line handler
            return false  // signal: needs async handling

        case '/provider':
            // Async — handled separately in the line handler
            return false

        case '/model':
            if (!arg) {
                console.log(`  Current model: ${chalk.green(state.model)}`)
                console.log(`  Use ${chalk.cyan('/models')} to browse all available models`)
            } else if (arg.startsWith('delete ') || arg.startsWith('remove ')) {
                const targetId = arg.split(' ').slice(1).join(' ').trim()
                deleteCustomModel(targetId)
            } else {
                setModel(arg)
            }
            return true

        case '/workspace':
        case '/cwd':
            if (!arg) {
                console.log(`  Current workspace: ${chalk.yellow(state.workspace)}`)
            } else {
                const resolved = path.resolve(arg)
                if (fs.existsSync(resolved)) {
                    state.workspace = resolved
                    console.log(`  ${chalk.green('✓')} Workspace set to ${chalk.yellow(resolved)}`)
                } else {
                    console.log(`  ${chalk.red('✗')} Directory not found: ${arg}`)
                }
            }
            return true

        case '/iter':
        case '/iterations':
            if (!arg || isNaN(parseInt(arg))) {
                console.log(`  Current max iterations: ${chalk.yellow(state.maxIterations)}`)
            } else {
                state.maxIterations = parseInt(arg)
                cfg.maxIterations = state.maxIterations
                saveConfig(cfg)
                console.log(`  ${chalk.green('✓')} Max iterations set to ${chalk.yellow(state.maxIterations)}`)
            }
            return true

        case '/debug':
            state.debug = !state.debug
            cfg.debug = state.debug
            saveConfig(cfg)
            console.log(`  Debug mode: ${state.debug ? chalk.green('on') : chalk.gray('off')}`)
            return true

        case '/clear':
            printBanner()
            return true

        case '/status':
            printStatus()
            return true

        case '/history':
            if (state.history.length === 0) {
                console.log(chalk.gray('  No history yet'))
            } else {
                console.log()
                state.history.slice(-10).forEach((h, i) => {
                    console.log(`  ${chalk.gray(String(i + 1).padStart(2, ' '))}  ${h}`)
                })
                console.log()
            }
            return true

        case '/exit':
        case '/quit':
        case '/q':
            console.log()
            console.log(chalk.cyan('  Goodbye! 👋'))
            console.log()
            process.exit(0)

        default:
            if (cmd.startsWith('/')) {
                console.log(`  ${chalk.red('Unknown command:')} ${cmd}. Type /help for commands.`)
                return true
            }
            return false
    }
}

// ─── Animated Status Line ────────────────────────────────────────────────────

// Windows CMD/PowerShell don't support braille spinners — use ASCII fallback
const STATUS_FRAMES = supportsUnicode
    ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    : ['-', '\\', '|', '/']

const STATUS_MESSAGES = [
    'Thinking...', 'Reasoning...', 'Planning...', 'Analyzing...',
    'Generating...', 'Working...', 'Processing...', 'Computing...'
]

class StatusLine {
    private frame = 0
    private msgIndex = 0
    private msgCounter = 0
    private timer: NodeJS.Timeout | null = null
    private currentLabel = ''
    private active = false

    start(label = 'Thinking...') {
        this.currentLabel = label
        this.active = true
        this.frame = 0
        this.msgIndex = 0
        this.msgCounter = 0
        this.render()
        this.timer = setInterval(() => this.tick(), 80)
    }

    setLabel(label: string) {
        this.currentLabel = label
        this.render()
    }

    private tick() {
        this.frame = (this.frame + 1) % STATUS_FRAMES.length
        this.msgCounter++
        // Rotate status message every ~2 seconds
        if (this.msgCounter % 25 === 0) {
            this.msgIndex = (this.msgIndex + 1) % STATUS_MESSAGES.length
            this.currentLabel = STATUS_MESSAGES[this.msgIndex]
        }
        this.render()
    }

    private render() {
        if (!this.active) return
        const spinner = chalk.cyan(STATUS_FRAMES[this.frame])
        const label = chalk.gray(this.currentLabel)
        process.stdout.write(`\r  ${spinner} ${label}                    `)
    }

    stop() {
        if (this.timer) { clearInterval(this.timer); this.timer = null }
        this.active = false
        process.stdout.write('\r' + ' '.repeat(60) + '\r')
    }
}

// ─── Agent Runner ─────────────────────────────────────────────────────────────

async function runAgent(prompt: string) {
    const apiKey = process.env.NOVA_API_KEY || process.env.OPENAI_API_KEY || ''
    const apiBase = process.env.NOVA_API_BASE || 'https://openrouter.ai/api/v1'

    const isPuter = apiBase.includes('puter.com')
    if (!apiKey && !isPuter) {
        console.log()
        console.log(`  ${chalk.red('✗')} No API key found.`)
        console.log(`  Set ${chalk.yellow('NOVA_API_KEY')} in ${chalk.yellow('cli/.env')}`)
        console.log(`  Get a free key at ${chalk.cyan('https://openrouter.ai/keys')}`)
        console.log()
        return
    }

    console.log()
    console.log(`  ${chalk.cyan(supportsUnicode ? '◆' : '*')} ${chalk.bold('Nova')} ${chalk.gray(`(${state.model})`)}`)
    console.log()

    const status = new StatusLine()
    const agent = new StandaloneAgent(apiKey, apiBase)

    // Register for cancellation via SIGTERM (fired by Ctrl+C handler)
    const cancelHandler = () => { agent.cancel() }
    process.once('SIGTERM', cancelHandler)

    // Track whether we're currently streaming tokens to stdout
    let streaming = false
    let streamBuffer = ''       // accumulates raw tokens to detect/strip tool_call blocks
    let inToolCall = false      // true while inside <tool_call>...</tool_call>
    let thoughtPrinted = false  // true once we've printed the thought prefix for this iteration

    // Strip THOUGHT: prefix and tool_call blocks from streamed output
    function flushBuffer() {
        // Remove THOUGHT: prefix (handles both start-of-stream and after newlines)
        streamBuffer = streamBuffer.replace(/^[\s]*THOUGHT:\s*/i, '')
        // Also strip if it appears after a newline mid-stream
        streamBuffer = streamBuffer.replace(/\n[\s]*THOUGHT:\s*/gi, '\n')

        // If we hit <tool_call> or <tool_calls>, stop printing — hide everything from here
        const toolCallStart = streamBuffer.search(/<tool_calls?>/i)
        if (toolCallStart !== -1) {
            const visible = streamBuffer.slice(0, toolCallStart).trimEnd()
            if (visible) {
                if (!streaming) {
                    status.stop()
                    streaming = true
                    process.stdout.write(`\n  ${chalk.gray(supportsUnicode ? '│' : '|')} `)
                    thoughtPrinted = true
                }
                process.stdout.write(chalk.white(visible))
            }
            inToolCall = true
            streamBuffer = ''
            return
        }

        // Reset inToolCall if we see closing tag (shouldn't normally happen but be safe)
        if (inToolCall && streamBuffer.search(/<\/tool_calls?>/i) !== -1) {
            inToolCall = false
            streamBuffer = ''
            return
        }

        if (inToolCall) {
            streamBuffer = ''
            return
        }

        // Print safe portion — keep last 30 chars buffered in case a tag is split across chunks
        const LOOKAHEAD = 30
        if (streamBuffer.length > LOOKAHEAD) {
            const safe = streamBuffer.slice(0, streamBuffer.length - LOOKAHEAD)
            streamBuffer = streamBuffer.slice(streamBuffer.length - LOOKAHEAD)

            if (safe.trim()) {
                if (!streaming) {
                    status.stop()
                    streaming = true
                    process.stdout.write(`\n  ${chalk.gray(supportsUnicode ? '│' : '|')} `)
                    thoughtPrinted = true
                }
                process.stdout.write(chalk.white(safe))
            }
        }
    }

    try {
        status.start('Thinking...')

        const result = await agent.run({
            prompt,
            model: state.model,
            maxIterations: state.maxIterations,
            cwd: state.workspace,
            debug: state.debug,

            onIteration: (_iter: number, _thought: string, _tool?: string) => {
                // Reset per-iteration state
                streamBuffer = ''
                inToolCall = false
                thoughtPrinted = false
            },

            // Live token streaming — filter out internal format tags
            onChunk: (token: string) => {
                if (inToolCall) return   // discard everything inside tool_call
                streamBuffer += token
                flushBuffer()
            },

            // Called when agent picks a tool to execute
            onAction: (tool: string, args: any) => {
                // Flush any remaining buffered text
                if (!inToolCall && streamBuffer.trim()) {
                    const clean = streamBuffer.replace(/^THOUGHT:\s*/i, '').trimEnd()
                    if (clean) {
                        if (!streaming) {
                            status.stop()
                            streaming = true
                            process.stdout.write(`\n  ${chalk.gray(supportsUnicode ? '│' : '|')} `)
                        }
                        process.stdout.write(chalk.white(clean))
                    }
                }
                streamBuffer = ''
                inToolCall = false

                if (streaming) {
                    process.stdout.write('\n')
                    streaming = false
                }

                const argPreview = JSON.stringify(args).slice(0, 70)
                console.log(`  ${chalk.blue('⚡')} ${chalk.bold(tool)} ${chalk.gray(argPreview)}`)
                status.start(`Running ${tool}...`)
                thoughtPrinted = false
            },

            onObservation: (obs: string, success: boolean) => {
                status.stop()
                if (state.debug) {
                    const icon = success ? chalk.green('✓') : chalk.red('✗')
                    const preview = obs.replace(/\n/g, ' ').slice(0, 80)
                    console.log(`  ${icon} ${chalk.gray(preview)}`)
                }
                status.start('Thinking...')
                streaming = false
                streamBuffer = ''
                inToolCall = false
                thoughtPrinted = false
            },

            onThought: (_thought: string) => {
                // Already streamed token-by-token via onChunk
            },
        })

        // Clean up any active streaming/spinner
        if (streaming) { process.stdout.write('\n'); streaming = false }
        status.stop()
        process.removeListener('SIGTERM', cancelHandler)
        if (result.success) {
            printSuccess(result.iterations)
        } else {
            if (result.error) printError(result.error)
            else if (result.maxReached) printError(`Max iterations (${state.maxIterations}) reached`)
            else if (result.loopDetected) printError('Loop detected — agent got stuck')
        }

    } catch (e: any) {
        if (streaming) { process.stdout.write('\n'); streaming = false }
        status.stop()
        process.removeListener('SIGTERM', cancelHandler)

        // Friendly error messages for common failures
        if (e.message?.includes('AUTH_ERROR')) {
            console.log()
            console.log(`  ${chalk.red('✗')} Invalid API key or unauthorized.`)
            console.log(`  Run ${chalk.cyan('/provider')} to update your API key.`)
            console.log()
        } else if (e.message?.includes('RATE_LIMIT')) {
            console.log()
            console.log(`  ${chalk.yellow('⚠')}  Rate limited. Wait a moment and try again.`)
            console.log(`  Tip: use ${chalk.cyan('/model')} to switch to a different free model.`)
            console.log()
        } else {
            printError(e.message)
        }
    }
}

// ─── Input Loop ───────────────────────────────────────────────────────────────

let rl: readline.Interface

function createReadline() {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        historySize: MAX_HISTORY,
        prompt: chalk.cyan('  ❯ ')
    })

    // Load history into readline
    ;(rl as any).history = [...state.history].reverse()

    return rl
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

async function runOnboarding(): Promise<void> {
    console.clear()
    console.log(NOVA_LOGO)
    console.log(chalk.bold('  Welcome to Nova! Let\'s get you set up.\n'))
    console.log(chalk.gray('  Nova needs an API key to talk to AI models.'))
    console.log(chalk.gray('  The fastest option is OpenRouter — free, no credit card needed.\n'))

    console.log(chalk.bold('  Where do you want to get your API key?'))
    console.log()
    console.log(`  ${chalk.cyan('1')}  OpenRouter ${chalk.green('(recommended, free)')}`)
    console.log(`     → openrouter.ai/keys`)
    console.log()
    console.log(`  ${chalk.cyan('2')}  Puter ${chalk.green('(free, no key needed)')}`)
    console.log(`     → puter.com`)
    console.log()
    console.log(`  ${chalk.cyan('3')}  OpenAI (paid)`)
    console.log(`     → platform.openai.com/api-keys`)
    console.log()
    console.log(`  ${chalk.cyan('4')}  I already have a key`)
    console.log()

    const choice = await question('  Enter choice (1-4): ')

    if (choice.trim() === '2') {
        // Puter — no key needed, just set the base
        cfg.apiBase = 'https://api.puter.com/v1'
        cfg.apiKey = 'puter'  // Puter uses session auth, key is a placeholder
        cfg.model = 'claude-opus-4-7'
        cfg.onboarded = true
        process.env.NOVA_API_BASE = cfg.apiBase
        process.env.NOVA_API_KEY = cfg.apiKey
        state.model = cfg.model
        saveConfig(cfg)
        console.log()
        console.log(`  ${chalk.green('✓')} Configured for Puter (free access to Claude, GPT-5, Gemini)`)
        console.log()
        await pressEnter()
        return
    }

    let apiBase = 'https://openrouter.ai/api/v1'
    if (choice.trim() === '3') apiBase = 'https://api.openai.com/v1'

    if (choice.trim() === '1') {
        console.log()
        console.log(`  ${chalk.cyan('→')} Opening ${chalk.underline('https://openrouter.ai/keys')} in your browser...`)
        try {
            const { exec } = await import('child_process')
            const url = 'https://openrouter.ai/keys'
            if (process.platform === 'win32') {
                exec(`start "" "${url}"`)
            } else if (process.platform === 'darwin') {
                exec(`open "${url}"`)
            } else {
                exec(`xdg-open "${url}"`)
            }
        } catch { /* ignore if browser can't open */ }
        console.log(`  ${chalk.gray('(If it didn\'t open, visit the URL manually)')}`)
    }

    console.log()
    const apiKey = await question('  Paste your API key here: ')

    if (!apiKey.trim()) {
        console.log(chalk.yellow('\n  Skipped. You can set your key later with /provider\n'))
        cfg.onboarded = true
        saveConfig(cfg)
        return
    }

    cfg.apiKey = apiKey.trim()
    cfg.apiBase = apiBase
    cfg.onboarded = true
    process.env.NOVA_API_KEY = cfg.apiKey
    process.env.NOVA_API_BASE = cfg.apiBase
    saveConfig(cfg)

    console.log()
    console.log(`  ${chalk.green('✓')} API key saved to ${chalk.gray(CONFIG_FILE)}`)
    console.log(`  ${chalk.gray('Note: key is stored in plaintext. Keep this file private.')}`)
    console.log()

    // Quick validation
    process.stdout.write(`  ${chalk.gray('Validating key...')}`)
    const valid = await validateApiKey(cfg.apiKey, cfg.apiBase)
    if (valid) {
        process.stdout.write(`\r  ${chalk.green('✓')} Key is valid! You\'re ready to go.\n`)
    } else {
        process.stdout.write(`\r  ${chalk.yellow('⚠')}  Could not validate key (might still work). Check if it\'s correct.\n`)
    }
    console.log()
    await pressEnter()
}

async function validateApiKey(apiKey: string, apiBase: string): Promise<boolean> {
    try {
        const axios = (await import('axios')).default
        const url = `${apiBase.replace(/\/$/, '')}/models`
        await axios.get(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 5000
        })
        return true
    } catch (e: any) {
        return e?.response?.status !== 401 && e?.response?.status !== 403
    }
}

function question(prompt: string): Promise<string> {
    return new Promise(resolve => rl.question(prompt, resolve))
}

async function pressEnter(): Promise<void> {
    await question(chalk.gray('  Press Enter to continue...'))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    // Load history
    state.history = loadHistory()

    // Create readline first (needed for onboarding)
    createReadline()

    // First-run onboarding
    const needsOnboarding = !cfg.onboarded && !process.env.NOVA_API_KEY && !process.env.OPENAI_API_KEY
    if (needsOnboarding) {
        await runOnboarding()
    }

    // Print banner
    printBanner()

    // Warn if still no key after onboarding
    const apiKey = process.env.NOVA_API_KEY || process.env.OPENAI_API_KEY || cfg.apiKey
    if (!apiKey) {
        console.log(`  ${chalk.yellow('⚠')}  No API key set. Run ${chalk.cyan('/provider')} to configure one.`)
        console.log()
    }

    rl.prompt()

    // Track if agent is running for SIGINT handling
    let agentRunning = false

    rl.on('line', async (input) => {
        const trimmed = input.trim()

        if (!trimmed) {
            rl.prompt()
            return
        }

        // Handle slash commands
        if (trimmed.startsWith('/')) {
            if (trimmed.toLowerCase() === '/models') {
                rl.pause()
                await pickModel()
                rl.resume()
                rl.prompt()
                return
            }
            if (trimmed.toLowerCase() === '/provider') {
                rl.pause()
                await pickProvider()
                rl.resume()
                rl.prompt()
                return
            }
            handleCommand(trimmed)
            rl.prompt()
            return
        }

        addToHistory(trimmed)
        rl.pause()
        agentRunning = true

        await runAgent(trimmed)

        agentRunning = false
        rl.resume()
        rl.prompt()
    })

    rl.on('close', () => {
        console.log()
        console.log(chalk.cyan('  Goodbye! 👋'))
        console.log()
        process.exit(0)
    })

    let ctrlCCount = 0
    rl.on('SIGINT', () => {
        ctrlCCount++
        if (agentRunning) {
            console.log()
            console.log(chalk.yellow('  ⚠  Stopping agent...'))
            // Signal will propagate to abort controller in runAgent
            process.emit('SIGTERM')
            agentRunning = false
            rl.resume()
            rl.prompt()
            ctrlCCount = 0
        } else if (ctrlCCount >= 2) {
            console.log()
            console.log(chalk.cyan('  Goodbye! 👋'))
            console.log()
            process.exit(0)
        } else {
            console.log()
            console.log(chalk.gray('  Press Ctrl+C again or type /exit to quit'))
            rl.prompt()
            setTimeout(() => { ctrlCCount = 0 }, 2000)
        }
    })
}

main().catch(console.error)

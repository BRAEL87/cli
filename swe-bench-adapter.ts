/**
 * SWE-bench Adapter - Integrates Nova agent with SWE-bench harness
 */
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { StandaloneAgent } from './standalone-agent'
import { JSONLLogger } from './jsonl-logger'

export interface SWEBenchTask {
    instance_id: string
    repo: string
    base_commit: string
    problem_statement: string
    hints_text?: string
    test_patch: string
    FAIL_TO_PASS: string[]
    PASS_TO_PASS: string[]
}

export interface SWEBenchPrediction {
    instance_id: string
    model_patch: string
    model_name_or_path: string
    iterations: number
    success: boolean
    error?: string
}

export class SWEBenchAdapter {
    private workDir: string
    private logger: JSONLLogger

    constructor(workDir: string, logFile: string) {
        this.workDir = workDir
        this.logger = new JSONLLogger(logFile)
    }

    /**
     * Run a single SWE-bench task
     */
    async runTask(
        task: SWEBenchTask,
        model: string,
        maxIterations: number = 40
    ): Promise<SWEBenchPrediction> {
        const taskDir = join(this.workDir, task.instance_id)
        
        try {
            // 1. Clone repo and checkout commit
            await this.setupRepo(task, taskDir)
            
            // 2. Build enhanced prompt with context
            const prompt = this.buildPrompt(task)
            
            // 3. Run Nova agent
            const apiKey = process.env['NOVA_API_KEY'] || process.env['OPENAI_API_KEY'] || ''
            const apiBase = process.env['NOVA_API_BASE'] || 'http://localhost:5000/api'
            const agent = new StandaloneAgent(apiKey, apiBase, join(taskDir, 'trace.jsonl'))
            const result = await agent.run({
                prompt,
                model,
                maxIterations,
                cwd: taskDir,
            })
            
            // 4. Extract git diff as patch
            const patch = await this.extractPatch(taskDir)
            
            // 5. Return prediction in SWE-bench format
            return {
                instance_id: task.instance_id,
                model_patch: patch,
                model_name_or_path: `nova-${model}`,
                iterations: result.iterations,
                success: result.success && patch.length > 0,
                error: result.error
            }
        } catch (error: any) {
            return {
                instance_id: task.instance_id,
                model_patch: '',
                model_name_or_path: `nova-${model}`,
                iterations: 0,
                success: false,
                error: error.message
            }
        } finally {
            // Cleanup
            await this.cleanup(taskDir)
        }
    }

    /**
     * Run multiple SWE-bench tasks
     */
    async runBatch(
        tasks: SWEBenchTask[],
        model: string,
        maxIterations: number = 40,
        maxWorkers: number = 1
    ): Promise<SWEBenchPrediction[]> {
        const results: SWEBenchPrediction[] = []
        
        // Process tasks in batches
        for (let i = 0; i < tasks.length; i += maxWorkers) {
            const batch = tasks.slice(i, i + maxWorkers)
            const batchResults = await Promise.all(
                batch.map(task => this.runTask(task, model, maxIterations))
            )
            results.push(...batchResults)
            
            // Log progress
            console.log(`Completed ${results.length}/${tasks.length} tasks`)
        }
        
        return results
    }

    /**
     * Setup repository for testing
     */
    private async setupRepo(task: SWEBenchTask, taskDir: string): Promise<void> {
        // Create task directory
        await fs.mkdir(taskDir, { recursive: true })
        
        // Clone repo
        await this.execCommand(`git clone https://github.com/${task.repo}.git .`, taskDir)
        
        // Checkout specific commit
        await this.execCommand(`git checkout ${task.base_commit}`, taskDir)
        
        // Create a new branch for changes
        await this.execCommand('git checkout -b nova-fix', taskDir)
    }

    /**
     * Build enhanced prompt with SWE-bench context
     */
    private buildPrompt(task: SWEBenchTask): string {
        let prompt = `# Bug Fix Task

${task.problem_statement}

## Your Goal
Fix this bug by editing the necessary files. Follow these steps:

1. **Understand the problem**: Read the issue description carefully
2. **Locate the bug**: Search for relevant files and code
3. **Analyze the code**: Understand how the bug occurs
4. **Implement the fix**: Edit files to resolve the issue
5. **Verify the fix**: Run tests to confirm it works

## Important Rules
- Make minimal changes - only fix what's broken
- Don't break existing functionality
- Run tests after making changes
- If tests fail, iterate and fix
- Commit your changes when done

## Available Tools
- \`search_code(query)\` - Search for code patterns
- \`read_file(path)\` - Read file contents
- \`edit_file(path, old_content, new_content)\` - Edit a file
- \`bash(command)\` - Run shell commands (tests, git, etc)
- \`list_files(path)\` - List directory contents

`

        if (task.hints_text) {
            prompt += `## Hints\n${task.hints_text}\n\n`
        }

        prompt += `## Tests to Pass
The following tests must pass after your fix:
${task.FAIL_TO_PASS.map(t => `- ${t}`).join('\n')}

Start by understanding the problem, then locate and fix the bug.`

        return prompt
    }

    /**
     * Extract git diff as patch
     */
    private async extractPatch(taskDir: string): Promise<string> {
        try {
            const { stdout } = await this.execCommand('git diff HEAD', taskDir)
            return stdout
        } catch {
            return ''
        }
    }

    /**
     * Execute shell command
     */
    private execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, {
                shell: true,
                cwd,
                stdio: ['ignore', 'pipe', 'pipe']
            })

            let stdout = ''
            let stderr = ''

            child.stdout?.on('data', (data) => { stdout += data.toString() })
            child.stderr?.on('data', (data) => { stderr += data.toString() })

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr })
                } else {
                    reject(new Error(`Command failed: ${command}\n${stderr}`))
                }
            })

            child.on('error', reject)
        })
    }

    /**
     * Cleanup task directory
     */
    private async cleanup(taskDir: string): Promise<void> {
        try {
            await fs.rm(taskDir, { recursive: true, force: true })
        } catch {
            // Ignore cleanup errors
        }
    }

    /**
     * Save predictions to JSONL file
     */
    async savePredictions(predictions: SWEBenchPrediction[], outputPath: string): Promise<void> {
        const lines = predictions.map(p => JSON.stringify(p)).join('\n')
        await fs.writeFile(outputPath, lines, 'utf-8')
    }

    /**
     * Load SWE-bench tasks from JSONL file
     */
    static async loadTasks(tasksPath: string): Promise<SWEBenchTask[]> {
        const content = await fs.readFile(tasksPath, 'utf-8')
        return content.trim().split('\n').map(line => JSON.parse(line))
    }
}

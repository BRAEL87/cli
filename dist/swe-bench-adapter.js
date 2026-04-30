"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWEBenchAdapter = void 0;
/**
 * SWE-bench Adapter - Integrates Nova agent with SWE-bench harness
 */
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const standalone_agent_1 = require("./standalone-agent");
const jsonl_logger_1 = require("./jsonl-logger");
class SWEBenchAdapter {
    constructor(workDir, logFile) {
        this.workDir = workDir;
        this.logger = new jsonl_logger_1.JSONLLogger(logFile);
    }
    /**
     * Run a single SWE-bench task
     */
    async runTask(task, model, maxIterations = 40) {
        const taskDir = (0, path_1.join)(this.workDir, task.instance_id);
        try {
            // 1. Clone repo and checkout commit
            await this.setupRepo(task, taskDir);
            // 2. Build enhanced prompt with context
            const prompt = this.buildPrompt(task);
            // 3. Run Nova agent
            const apiKey = process.env['NOVA_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
            const apiBase = process.env['NOVA_API_BASE'] || 'http://localhost:5000/api';
            const agent = new standalone_agent_1.StandaloneAgent(apiKey, apiBase, (0, path_1.join)(taskDir, 'trace.jsonl'));
            const result = await agent.run({
                prompt,
                model,
                maxIterations,
                cwd: taskDir,
            });
            // 4. Extract git diff as patch
            const patch = await this.extractPatch(taskDir);
            // 5. Return prediction in SWE-bench format
            return {
                instance_id: task.instance_id,
                model_patch: patch,
                model_name_or_path: `nova-${model}`,
                iterations: result.iterations,
                success: result.success && patch.length > 0,
                error: result.error
            };
        }
        catch (error) {
            return {
                instance_id: task.instance_id,
                model_patch: '',
                model_name_or_path: `nova-${model}`,
                iterations: 0,
                success: false,
                error: error.message
            };
        }
        finally {
            // Cleanup
            await this.cleanup(taskDir);
        }
    }
    /**
     * Run multiple SWE-bench tasks
     */
    async runBatch(tasks, model, maxIterations = 40, maxWorkers = 1) {
        const results = [];
        // Process tasks in batches
        for (let i = 0; i < tasks.length; i += maxWorkers) {
            const batch = tasks.slice(i, i + maxWorkers);
            const batchResults = await Promise.all(batch.map(task => this.runTask(task, model, maxIterations)));
            results.push(...batchResults);
            // Log progress
            console.log(`Completed ${results.length}/${tasks.length} tasks`);
        }
        return results;
    }
    /**
     * Setup repository for testing
     */
    async setupRepo(task, taskDir) {
        // Create task directory
        await fs_1.promises.mkdir(taskDir, { recursive: true });
        // Clone repo
        await this.execCommand(`git clone https://github.com/${task.repo}.git .`, taskDir);
        // Checkout specific commit
        await this.execCommand(`git checkout ${task.base_commit}`, taskDir);
        // Create a new branch for changes
        await this.execCommand('git checkout -b nova-fix', taskDir);
    }
    /**
     * Build enhanced prompt with SWE-bench context
     */
    buildPrompt(task) {
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

`;
        if (task.hints_text) {
            prompt += `## Hints\n${task.hints_text}\n\n`;
        }
        prompt += `## Tests to Pass
The following tests must pass after your fix:
${task.FAIL_TO_PASS.map(t => `- ${t}`).join('\n')}

Start by understanding the problem, then locate and fix the bug.`;
        return prompt;
    }
    /**
     * Extract git diff as patch
     */
    async extractPatch(taskDir) {
        try {
            const { stdout } = await this.execCommand('git diff HEAD', taskDir);
            return stdout;
        }
        catch {
            return '';
        }
    }
    /**
     * Execute shell command
     */
    execCommand(command, cwd) {
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(command, {
                shell: true,
                cwd,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';
            child.stdout?.on('data', (data) => { stdout += data.toString(); });
            child.stderr?.on('data', (data) => { stderr += data.toString(); });
            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                }
                else {
                    reject(new Error(`Command failed: ${command}\n${stderr}`));
                }
            });
            child.on('error', reject);
        });
    }
    /**
     * Cleanup task directory
     */
    async cleanup(taskDir) {
        try {
            await fs_1.promises.rm(taskDir, { recursive: true, force: true });
        }
        catch {
            // Ignore cleanup errors
        }
    }
    /**
     * Save predictions to JSONL file
     */
    async savePredictions(predictions, outputPath) {
        const lines = predictions.map(p => JSON.stringify(p)).join('\n');
        await fs_1.promises.writeFile(outputPath, lines, 'utf-8');
    }
    /**
     * Load SWE-bench tasks from JSONL file
     */
    static async loadTasks(tasksPath) {
        const content = await fs_1.promises.readFile(tasksPath, 'utf-8');
        return content.trim().split('\n').map(line => JSON.parse(line));
    }
}
exports.SWEBenchAdapter = SWEBenchAdapter;
//# sourceMappingURL=swe-bench-adapter.js.map
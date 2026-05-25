#!/usr/bin/env node
/**
 * Nova Agent CLI - Command-line interface for Nova Studio agent
 */
import 'dotenv/config'
import { Command } from 'commander'
import { AgentCLI } from './agent-cli'
import { registerTestCommand } from './commands/test'
import { registerBenchCommand } from './commands/bench'
import * as fs from 'fs'
import * as path from 'path'

// Read version from package.json
const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : { version: '1.0.0' }

const program = new Command()

program
    .name('qovyn')
    .description('Qovyn AI coding agent — autonomous, interactive, free')
    .version(pkg.version, '-v, --version', 'Show version number')
    .helpOption('-h, --help', 'Show help')
    .addHelpText('after', `
Examples:
  $ nova                          Start interactive session
  $ nova agent -p "Fix the bug"   Run a single task
  $ nova init                     Set up Nova in current project
  $ nova bench --tasks tasks.jsonl --output results.jsonl

Free models (no credits needed):
  tencent/hy3-preview:free        Best free model (74.4% SWE-bench)
  openrouter/free                 Auto-select best available free model

Docs: https://github.com/nova-studio/nova-agent-cli
`)

// Default: if no subcommand given, launch REPL
program.action(() => {
    import('./nova-repl').catch(console.error)
})

// REPL command - interactive mode like Claude Code
program
    .command('chat')
    .alias('repl')
    .description('Start interactive chat session (default)')
    .option('-m, --model <model>', 'Model to use', 'tencent/hy3-preview:free')
    .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
    .action(async (options) => {
        process.env._NOVA_MODEL = options.model
        process.env._NOVA_WORKSPACE = options.workspace
        await import('./nova-repl')
    })

// Agent command - run agent on a single task (non-interactive)
program
    .command('agent')
    .description('Run autonomous agent on a single task (non-interactive)')
    .requiredOption('-p, --prompt <prompt>', 'Task prompt for the agent')
    .option('-m, --model <model>', 'Model to use', 'tencent/hy3-preview:free')
    .option('-i, --max-iterations <number>', 'Maximum iterations', '40')
    .option('-d, --debug', 'Enable debug logging', false)
    .option('-l, --log <path>', 'Log file path (JSONL format)')
    .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
    .option('--puter', 'Use Puter.js free AI (no API key required)', false)
    .option('--puter-token <token>', 'Puter auth token (get from puter.com dev tools → Application → Cookies → auth_token)')
    .action(async (options) => {
        // Puter mode: use Puter's OpenAI-compat endpoint, no key needed
        if (options.puter || options.puterToken) {
            process.env['NOVA_API_BASE'] = 'https://api.puter.com/puterai/openai/v1'
            if (options.puterToken) {
                process.env['NOVA_API_KEY'] = options.puterToken
            } else {
                // No token — set a placeholder so the key check passes
                // Puter's public endpoint accepts requests without auth for free models
                process.env['NOVA_API_KEY'] = process.env['NOVA_API_KEY'] || 'puter-free'
            }
            // Default to a good free Puter model if user didn't specify
            if (options.model === 'tencent/hy3-preview:free') {
                options.model = 'gpt-4o-mini'
            }
        }
        const cli = new AgentCLI()
        await cli.run({
            prompt: options.prompt,
            model: options.model,
            maxIterations: parseInt(options.maxIterations),
            debug: options.debug,
            logFile: options.log,
            workspace: options.workspace,
            apiKey: process.env['NOVA_API_KEY'],
            apiBase: process.env['NOVA_API_BASE'],
        })
    })

// Init command - scaffold .qovyn/ config in current project
program
    .command('init')
    .description('Set up Qovyn in the current project')
    .action(async () => {
        const { runInit } = await import('./commands/init')
        await runInit()
    })

// Test command - run agent tests
registerTestCommand(program)

// Bench command - run SWE-bench evaluation
registerBenchCommand(program)

// Parse arguments
program.parse(process.argv)

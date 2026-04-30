#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Nova Agent CLI - Command-line interface for Nova Studio agent
 */
require("dotenv/config");
const commander_1 = require("commander");
const agent_cli_1 = require("./agent-cli");
const test_1 = require("./commands/test");
const bench_1 = require("./commands/bench");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Read version from package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : { version: '1.0.0' };
const program = new commander_1.Command();
program
    .name('nova')
    .description('Nova AI coding agent — autonomous, interactive, free')
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
`);
// Default: if no subcommand given, launch REPL
program.action(() => {
    Promise.resolve().then(() => __importStar(require('./nova-repl'))).catch(console.error);
});
// REPL command - interactive mode like Claude Code
program
    .command('chat')
    .alias('repl')
    .description('Start interactive chat session (default)')
    .option('-m, --model <model>', 'Model to use', 'tencent/hy3-preview:free')
    .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
    .action(async (options) => {
    process.env._NOVA_MODEL = options.model;
    process.env._NOVA_WORKSPACE = options.workspace;
    await Promise.resolve().then(() => __importStar(require('./nova-repl')));
});
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
        process.env['NOVA_API_BASE'] = 'https://api.puter.com/puterai/openai/v1';
        if (options.puterToken) {
            process.env['NOVA_API_KEY'] = options.puterToken;
        }
        else {
            // No token — set a placeholder so the key check passes
            // Puter's public endpoint accepts requests without auth for free models
            process.env['NOVA_API_KEY'] = process.env['NOVA_API_KEY'] || 'puter-free';
        }
        // Default to a good free Puter model if user didn't specify
        if (options.model === 'tencent/hy3-preview:free') {
            options.model = 'gpt-4o-mini';
        }
    }
    const cli = new agent_cli_1.AgentCLI();
    await cli.run({
        prompt: options.prompt,
        model: options.model,
        maxIterations: parseInt(options.maxIterations),
        debug: options.debug,
        logFile: options.log,
        workspace: options.workspace,
        apiKey: process.env['NOVA_API_KEY'],
        apiBase: process.env['NOVA_API_BASE'],
    });
});
// Init command - scaffold .nova/ config in current project
program
    .command('init')
    .description('Set up Nova in the current project')
    .action(async () => {
    const { runInit } = await Promise.resolve().then(() => __importStar(require('./commands/init')));
    await runInit();
});
// Test command - run agent tests
(0, test_1.registerTestCommand)(program);
// Bench command - run SWE-bench evaluation
(0, bench_1.registerBenchCommand)(program);
// Parse arguments
program.parse(process.argv);
//# sourceMappingURL=nova-agent.js.map
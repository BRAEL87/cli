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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Nova REPL - Interactive CLI interface like Claude Code
 * Usage: npx tsx nova-repl.ts
 */
require("dotenv/config");
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const standalone_agent_1 = require("./standalone-agent");
// ─── Config file (~/.nova_config) ────────────────────────────────────────────
const CONFIG_FILE = path.join(os.homedir(), '.nova_config');
const HISTORY_FILE = path.join(os.homedir(), '.nova_history');
const MAX_HISTORY = 100;
const DEFAULT_CONFIG = {
    model: 'tencent/hy3-preview:free',
    apiBase: 'https://openrouter.ai/api/v1',
    maxIterations: 40,
    debug: false,
    customModels: [],
    onboarded: false,
};
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    }
    catch { /* ignore */ }
    return { ...DEFAULT_CONFIG };
}
function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    }
    catch { /* ignore */ }
}
const KNOWN_PROVIDERS = [
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
];
const KNOWN_MODELS = [
    // Free via OpenRouter
    { id: 'tencent/hy3-preview:free', label: 'Hy3 Preview', free: true, note: '74.4% SWE-bench — best free (OpenRouter)' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', free: true, note: 'coding specialist (OpenRouter)' },
    { id: 'google/gemini-2.0-flash-thinking-exp:free', label: 'Gemini 2.0 Flash Think', free: true, note: 'strong reasoning (OpenRouter)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', free: true, note: 'general purpose (OpenRouter)' },
    { id: 'openrouter/free', label: 'Auto (best free)', free: true, note: 'auto-selects available free model' },
    // Free via Puter (requires Puter auth token + api base change)
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    { id: 'gpt-5.5', label: 'GPT-5.5 (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    { id: 'gemini-3-pro', label: 'Gemini 3 Pro (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (Puter)', free: true, note: 'free via Puter — set api base to puter' },
    // Paid via OpenRouter
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', free: false, note: '$0.15/1M — cheap & reliable' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', free: false, note: '$2.50/1M — strong' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', free: false, note: '$3/1M — excellent coding' },
    { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', free: false, note: '$0.075/1M — very fast' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', free: false, note: '$0.55/1M — strong reasoning' },
];
// ─── State ────────────────────────────────────────────────────────────────────
const cfg = loadConfig();
const state = {
    model: process.env.NOVA_MODEL || cfg.model,
    workspace: process.cwd(),
    maxIterations: cfg.maxIterations,
    debug: cfg.debug,
    history: [],
};
// Apply saved API base if not overridden by env
if (cfg.apiBase && !process.env.NOVA_API_BASE) {
    process.env.NOVA_API_BASE = cfg.apiBase;
}
if (cfg.apiKey && !process.env.NOVA_API_KEY) {
    process.env.NOVA_API_KEY = cfg.apiKey;
}
// ─── Platform Detection ───────────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const supportsUnicode = !isWindows || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode';
// ─── UI Helpers ───────────────────────────────────────────────────────────────
const NOVA_LOGO_UNICODE = `
${chalk_1.default.cyan('███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ')}
${chalk_1.default.cyan('████╗  ██║██╔═══██╗██║   ██║██╔══██╗')}
${chalk_1.default.cyan('██╔██╗ ██║██║   ██║██║   ██║███████║')}
${chalk_1.default.cyan('██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║')}
${chalk_1.default.cyan('██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║')}
${chalk_1.default.cyan('╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝')}
`;
const NOVA_LOGO_ASCII = `
${chalk_1.default.cyan('  _   _  _____  _   _  ___')}
${chalk_1.default.cyan(' | \\ | ||  _  || | | |/ _ \\')}
${chalk_1.default.cyan(' |  \\| || | | || | | / /_\\ \\')}
${chalk_1.default.cyan(' | . ` || | | || | | |  _  |')}
${chalk_1.default.cyan(' | |\\  |\\ \\_/ /\\ \\_/ / | | |')}
${chalk_1.default.cyan(' \\_| \\_/ \\___/  \\___/\\_| |_/')}
`;
const NOVA_LOGO = supportsUnicode ? NOVA_LOGO_UNICODE : NOVA_LOGO_ASCII;
const DIVIDER = supportsUnicode ? '─'.repeat(37) : '-'.repeat(37);
function printBanner() {
    console.clear();
    console.log(NOVA_LOGO);
    console.log(chalk_1.default.gray('  Autonomous AI Coding Agent'));
    console.log(chalk_1.default.gray(`  ${DIVIDER}`));
    console.log(`  ${chalk_1.default.bold('Model:')}     ${chalk_1.default.green(state.model)}`);
    console.log(`  ${chalk_1.default.bold('Workspace:')} ${chalk_1.default.yellow(state.workspace)}`);
    console.log(`  ${chalk_1.default.bold('Max iter:')}  ${chalk_1.default.yellow(state.maxIterations)}`);
    console.log();
    console.log(chalk_1.default.gray('  Type your task, or /help for commands'));
    console.log(chalk_1.default.gray('  ─────────────────────────────────────'));
    console.log();
}
function printHelp() {
    console.log();
    console.log(chalk_1.default.bold('  Commands:'));
    console.log(`  ${chalk_1.default.cyan('/help')}              Show this help`);
    console.log(`  ${chalk_1.default.cyan('/models')}            Browse & select model interactively`);
    console.log(`  ${chalk_1.default.cyan('/model <id>')}        Set model directly by ID`);
    console.log(`  ${chalk_1.default.cyan('/model delete <id>')} Delete a custom model from your list`);
    console.log(`  ${chalk_1.default.cyan('/provider')}          Switch API provider (OpenRouter, Puter, OpenAI, custom)`);
    console.log(`  ${chalk_1.default.cyan('/workspace <path>')}  Change workspace directory`);
    console.log(`  ${chalk_1.default.cyan('/iter <n>')}          Set max iterations (default: 40)`);
    console.log(`  ${chalk_1.default.cyan('/debug')}             Toggle debug mode`);
    console.log(`  ${chalk_1.default.cyan('/clear')}             Clear screen`);
    console.log(`  ${chalk_1.default.cyan('/status')}            Show current settings`);
    console.log(`  ${chalk_1.default.cyan('/history')}           Show recent prompts`);
    console.log(`  ${chalk_1.default.cyan('/exit')}              Exit Nova`);
    console.log();
    console.log(chalk_1.default.bold('  Free Models:'));
    console.log(`  ${chalk_1.default.green('tencent/hy3-preview:free')}          ${chalk_1.default.gray('Best free (74.4% SWE-bench)')}`);
    console.log(`  ${chalk_1.default.green('qwen/qwen-2.5-coder-32b-instruct:free')} ${chalk_1.default.gray('Coding specialist')}`);
    console.log(`  ${chalk_1.default.green('openrouter/free')}                   ${chalk_1.default.gray('Auto-select free model')}`);
    console.log();
    console.log(chalk_1.default.bold('  Examples:'));
    console.log(`  ${chalk_1.default.gray('>')} Create a Python function that sorts a list`);
    console.log(`  ${chalk_1.default.gray('>')} Fix the bug in app.py where login returns 401`);
    console.log(`  ${chalk_1.default.gray('>')} Add error handling to all functions in utils.py`);
    console.log();
}
function printStatus() {
    console.log();
    console.log(chalk_1.default.bold('  Current Settings:'));
    console.log(`  Model:          ${chalk_1.default.green(state.model)}`);
    console.log(`  Workspace:      ${chalk_1.default.yellow(state.workspace)}`);
    console.log(`  Max iterations: ${chalk_1.default.yellow(state.maxIterations)}`);
    console.log(`  Debug:          ${state.debug ? chalk_1.default.green('on') : chalk_1.default.gray('off')}`);
    const currentBase = process.env.NOVA_API_BASE || cfg.apiBase || 'https://openrouter.ai/api/v1';
    const isPuter = currentBase.includes('puter.com');
    const apiKeyStatus = process.env.NOVA_API_KEY
        ? chalk_1.default.green('set ✓')
        : isPuter
            ? chalk_1.default.gray('not needed (Puter)')
            : chalk_1.default.red('not set ✗');
    console.log(`  API Key:        ${apiKeyStatus}`);
    console.log(`  API Base:       ${chalk_1.default.gray(currentBase)}`);
    console.log(`  Config file:    ${chalk_1.default.gray(CONFIG_FILE)}`);
    console.log();
}
function printIterationUpdate(iteration, maxIter, thought, tool) {
    const bar = buildProgressBar(iteration, maxIter);
    const iterStr = chalk_1.default.gray(`[${iteration}/${maxIter}]`);
    const toolStr = tool ? chalk_1.default.cyan(` → ${tool}`) : '';
    const thoughtStr = thought.length > 60 ? thought.slice(0, 60) + '…' : thought;
    process.stdout.write(`\r  ${iterStr} ${bar}${toolStr} ${chalk_1.default.gray(thoughtStr)}`);
}
function buildProgressBar(current, max, width = 12) {
    const filled = Math.round((current / max) * width);
    const empty = width - filled;
    return chalk_1.default.cyan('█'.repeat(filled)) + chalk_1.default.gray('░'.repeat(empty));
}
function printSuccess(iterations) {
    console.log();
    console.log();
    console.log(`  ${chalk_1.default.green('✓')} ${chalk_1.default.bold('Task completed')} ${chalk_1.default.gray(`in ${iterations} iteration${iterations !== 1 ? 's' : ''}`)}`);
    console.log();
}
function printError(msg) {
    console.log();
    console.log(`  ${chalk_1.default.red('✗')} ${chalk_1.default.bold('Failed:')} ${chalk_1.default.red(msg)}`);
    console.log();
}
function printThought(thought) {
    if (!state.debug)
        return;
    console.log();
    console.log(chalk_1.default.gray('  ┌─ Thought ─────────────────────────────'));
    const lines = thought.split('\n').slice(0, 5);
    lines.forEach(l => console.log(chalk_1.default.gray(`  │ ${l}`)));
    console.log(chalk_1.default.gray('  └───────────────────────────────────────'));
}
function printAction(tool, args) {
    const argsStr = JSON.stringify(args).slice(0, 80);
    console.log(`  ${chalk_1.default.blue('⚡')} ${chalk_1.default.bold(tool)} ${chalk_1.default.gray(argsStr)}`);
}
function printObservation(obs, success) {
    if (!state.debug)
        return;
    const icon = success ? chalk_1.default.green('✓') : chalk_1.default.red('✗');
    const preview = obs.slice(0, 100).replace(/\n/g, ' ');
    console.log(`  ${icon} ${chalk_1.default.gray(preview)}`);
}
// ─── History ──────────────────────────────────────────────────────────────────
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return fs.readFileSync(HISTORY_FILE, 'utf-8')
                .split('\n')
                .filter(Boolean)
                .slice(-MAX_HISTORY);
        }
    }
    catch { /* ignore */ }
    return [];
}
function saveHistory(history) {
    try {
        fs.writeFileSync(HISTORY_FILE, history.slice(-MAX_HISTORY).join('\n') + '\n');
    }
    catch { /* ignore */ }
}
function addToHistory(prompt) {
    if (!prompt.trim() || prompt.startsWith('/'))
        return;
    state.history = state.history.filter(h => h !== prompt);
    state.history.push(prompt);
    saveHistory(state.history);
}
// ─── Interactive Model Picker ─────────────────────────────────────────────────
async function pickProvider() {
    console.log();
    console.log(chalk_1.default.bold('  Select a provider:'));
    console.log();
    KNOWN_PROVIDERS.forEach((p, i) => {
        const currentBase = process.env.NOVA_API_BASE || cfg.apiBase || DEFAULT_CONFIG.apiBase;
        const active = currentBase?.includes(p.apiBase.split('/')[2] || '') ? chalk_1.default.cyan(' ◀ current') : '';
        console.log(`  ${chalk_1.default.cyan(String(i + 1))}  ${chalk_1.default.bold(p.label.padEnd(20))} ${chalk_1.default.gray(p.note)}${active}`);
        console.log(`     ${chalk_1.default.gray(p.authNote)}`);
        console.log();
    });
    console.log(chalk_1.default.gray('  Enter number or paste a custom API base URL:'));
    console.log();
    const answer = await new Promise(resolve => {
        rl.question(chalk_1.default.cyan('  ❯ '), resolve);
    });
    const trimmed = answer.trim();
    if (!trimmed) {
        console.log(chalk_1.default.gray('  Cancelled.'));
        console.log();
        return;
    }
    let selectedBase = '';
    const num = parseInt(trimmed);
    if (!isNaN(num) && num >= 1 && num <= KNOWN_PROVIDERS.length) {
        const provider = KNOWN_PROVIDERS[num - 1];
        if (provider.id === 'custom') {
            const urlAnswer = await new Promise(resolve => {
                rl.question(chalk_1.default.gray('  Enter API base URL: '), resolve);
            });
            selectedBase = urlAnswer.trim();
        }
        else {
            selectedBase = provider.apiBase;
        }
    }
    else if (trimmed.startsWith('http')) {
        selectedBase = trimmed;
    }
    else {
        console.log(chalk_1.default.red('  Invalid selection'));
        console.log();
        return;
    }
    if (!selectedBase)
        return;
    // Save to config
    cfg.apiBase = selectedBase;
    saveConfig(cfg);
    process.env.NOVA_API_BASE = selectedBase;
    console.log(`  ${chalk_1.default.green('✓')} API base set to ${chalk_1.default.green(selectedBase)}`);
    console.log(`  ${chalk_1.default.gray('Saved to')} ${chalk_1.default.gray(CONFIG_FILE)}`);
    console.log();
    // Prompt for API key if switching providers
    const keyAnswer = await new Promise(resolve => {
        rl.question(chalk_1.default.gray('  Enter API key for this provider (or press Enter to skip): '), resolve);
    });
    if (keyAnswer.trim()) {
        process.env.NOVA_API_KEY = keyAnswer.trim();
        cfg.apiKey = keyAnswer.trim();
        saveConfig(cfg);
        console.log(`  ${chalk_1.default.green('✓')} API key updated`);
    }
    console.log();
}
async function pickModel() {
    const freeModels = KNOWN_MODELS.filter(m => m.free);
    const paidModels = KNOWN_MODELS.filter(m => !m.free);
    const customModels = cfg.customModels || [];
    console.log();
    console.log(chalk_1.default.bold('  Select a model:'));
    console.log();
    if (customModels.length > 0) {
        console.log(chalk_1.default.magenta('  ── Your Custom Models ──'));
        customModels.forEach((m, i) => {
            const active = m.id === state.model ? chalk_1.default.cyan(' ◀ current') : '';
            console.log(`  ${chalk_1.default.magenta(String(i + 1).padStart(2))}  ${chalk_1.default.bold(m.label.padEnd(28))} ${chalk_1.default.gray(m.note)}${active}`);
        });
        console.log();
    }
    const offset = customModels.length;
    console.log(chalk_1.default.green('  ── Free Models ──'));
    freeModels.forEach((m, i) => {
        const active = m.id === state.model ? chalk_1.default.cyan(' ◀ current') : '';
        console.log(`  ${chalk_1.default.cyan(String(offset + i + 1).padStart(2))}  ${chalk_1.default.bold(m.label.padEnd(28))} ${chalk_1.default.gray(m.note)}${active}`);
    });
    console.log();
    console.log(chalk_1.default.yellow('  ── Paid Models ──'));
    paidModels.forEach((m, i) => {
        const idx = offset + freeModels.length + i + 1;
        const active = m.id === state.model ? chalk_1.default.cyan(' ◀ current') : '';
        console.log(`  ${chalk_1.default.yellow(String(idx).padStart(2))}  ${chalk_1.default.bold(m.label.padEnd(28))} ${chalk_1.default.gray(m.note)}${active}`);
    });
    const total = customModels.length + freeModels.length + paidModels.length;
    console.log();
    console.log(chalk_1.default.gray(`  Enter number (1-${total}), a model ID, or type a custom ID:`));
    console.log(chalk_1.default.gray(`  (e.g. "claude-opus-4-7" for Puter, "ollama/llama3" for local)`));
    if (customModels.length > 0) {
        console.log(chalk_1.default.gray(`  Prefix with "d" to delete a custom model (e.g. "d1" deletes #1)`));
    }
    console.log();
    const answer = await new Promise(resolve => {
        rl.question(chalk_1.default.cyan('  ❯ '), resolve);
    });
    const trimmed = answer.trim();
    if (!trimmed) {
        console.log(chalk_1.default.gray('  Cancelled.'));
        console.log();
        return;
    }
    // Number selection
    const num = parseInt(trimmed);
    if (!isNaN(num) && num >= 1 && num <= total) {
        const allModels = [...customModels, ...freeModels, ...paidModels];
        const selected = allModels[num - 1];
        setModel(selected.id);
        return;
    }
    // "d<n>" = delete custom model by number
    const deleteMatch = trimmed.match(/^d(\d+)$/i);
    if (deleteMatch) {
        const delNum = parseInt(deleteMatch[1]);
        if (delNum >= 1 && delNum <= customModels.length) {
            const target = customModels[delNum - 1];
            const confirm = await new Promise(resolve => {
                rl.question(chalk_1.default.red(`  Delete "${target.label}" (${target.id})? (y/N) `), resolve);
            });
            if (confirm.trim().toLowerCase() === 'y') {
                deleteCustomModel(target.id);
            }
            else {
                console.log(chalk_1.default.gray('  Cancelled.'));
                console.log();
            }
        }
        else {
            console.log(chalk_1.default.red(`  Can only delete custom models (numbers 1-${customModels.length})`));
            console.log();
        }
        return;
    }
    // Any string = custom model ID
    setModel(trimmed);
    // Ask if they want to save it
    const saveAnswer = await new Promise(resolve => {
        rl.question(chalk_1.default.gray(`  Save "${trimmed}" to your model list? (y/N) `), resolve);
    });
    if (saveAnswer.trim().toLowerCase() === 'y') {
        const labelAnswer = await new Promise(resolve => {
            rl.question(chalk_1.default.gray('  Label (e.g. "My Puter Claude"): '), resolve);
        });
        const noteAnswer = await new Promise(resolve => {
            rl.question(chalk_1.default.gray('  Note (e.g. "via Puter, free"): '), resolve);
        });
        const newEntry = { id: trimmed, label: labelAnswer.trim() || trimmed, note: noteAnswer.trim() || '' };
        // Update both disk and in-memory cfg so it shows up immediately
        cfg.customModels = [...(cfg.customModels || []), newEntry];
        saveConfig(cfg);
        console.log(`  ${chalk_1.default.green('✓')} Saved to your model list`);
    }
    console.log();
}
function setModel(modelId) {
    state.model = modelId;
    // Update both in-memory cfg and disk
    cfg.model = modelId;
    saveConfig(cfg);
    console.log(`  ${chalk_1.default.green('✓')} Model set to ${chalk_1.default.green(modelId)}`);
    console.log(`  ${chalk_1.default.gray('Saved to')} ${chalk_1.default.gray(CONFIG_FILE)}`);
    console.log();
}
function deleteCustomModel(modelId) {
    const before = (cfg.customModels || []).length;
    cfg.customModels = (cfg.customModels || []).filter(m => m.id !== modelId);
    const after = cfg.customModels.length;
    if (before === after) {
        console.log(`  ${chalk_1.default.red('✗')} Model not found in your custom list: ${chalk_1.default.yellow(modelId)}`);
        console.log(`  ${chalk_1.default.gray('Only custom models can be deleted. Built-in models cannot be removed.')}`);
    }
    else {
        saveConfig(cfg);
        console.log(`  ${chalk_1.default.green('✓')} Deleted ${chalk_1.default.yellow(modelId)} from your model list`);
        // If deleted model was active, reset to default
        if (state.model === modelId) {
            setModel(DEFAULT_CONFIG.model);
            console.log(`  ${chalk_1.default.gray('Active model reset to default:')} ${chalk_1.default.green(DEFAULT_CONFIG.model)}`);
        }
    }
    console.log();
}
// ─── Command Handling ─────────────────────────────────────────────────────────
function handleCommand(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');
    switch (cmd) {
        case '/help':
            printHelp();
            return true;
        case '/models':
            // Async — handled separately in the line handler
            return false; // signal: needs async handling
        case '/provider':
            // Async — handled separately in the line handler
            return false;
        case '/model':
            if (!arg) {
                console.log(`  Current model: ${chalk_1.default.green(state.model)}`);
                console.log(`  Use ${chalk_1.default.cyan('/models')} to browse all available models`);
            }
            else if (arg.startsWith('delete ') || arg.startsWith('remove ')) {
                const targetId = arg.split(' ').slice(1).join(' ').trim();
                deleteCustomModel(targetId);
            }
            else {
                setModel(arg);
            }
            return true;
        case '/workspace':
        case '/cwd':
            if (!arg) {
                console.log(`  Current workspace: ${chalk_1.default.yellow(state.workspace)}`);
            }
            else {
                const resolved = path.resolve(arg);
                if (fs.existsSync(resolved)) {
                    state.workspace = resolved;
                    console.log(`  ${chalk_1.default.green('✓')} Workspace set to ${chalk_1.default.yellow(resolved)}`);
                }
                else {
                    console.log(`  ${chalk_1.default.red('✗')} Directory not found: ${arg}`);
                }
            }
            return true;
        case '/iter':
        case '/iterations':
            if (!arg || isNaN(parseInt(arg))) {
                console.log(`  Current max iterations: ${chalk_1.default.yellow(state.maxIterations)}`);
            }
            else {
                state.maxIterations = parseInt(arg);
                cfg.maxIterations = state.maxIterations;
                saveConfig(cfg);
                console.log(`  ${chalk_1.default.green('✓')} Max iterations set to ${chalk_1.default.yellow(state.maxIterations)}`);
            }
            return true;
        case '/debug':
            state.debug = !state.debug;
            cfg.debug = state.debug;
            saveConfig(cfg);
            console.log(`  Debug mode: ${state.debug ? chalk_1.default.green('on') : chalk_1.default.gray('off')}`);
            return true;
        case '/clear':
            printBanner();
            return true;
        case '/status':
            printStatus();
            return true;
        case '/history':
            if (state.history.length === 0) {
                console.log(chalk_1.default.gray('  No history yet'));
            }
            else {
                console.log();
                state.history.slice(-10).forEach((h, i) => {
                    console.log(`  ${chalk_1.default.gray(String(i + 1).padStart(2, ' '))}  ${h}`);
                });
                console.log();
            }
            return true;
        case '/exit':
        case '/quit':
        case '/q':
            console.log();
            console.log(chalk_1.default.cyan('  Goodbye! 👋'));
            console.log();
            process.exit(0);
        default:
            if (cmd.startsWith('/')) {
                console.log(`  ${chalk_1.default.red('Unknown command:')} ${cmd}. Type /help for commands.`);
                return true;
            }
            return false;
    }
}
// ─── Animated Status Line ────────────────────────────────────────────────────
// Windows CMD/PowerShell don't support braille spinners — use ASCII fallback
const STATUS_FRAMES = supportsUnicode
    ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    : ['-', '\\', '|', '/'];
const STATUS_MESSAGES = [
    'Thinking...', 'Reasoning...', 'Planning...', 'Analyzing...',
    'Generating...', 'Working...', 'Processing...', 'Computing...'
];
class StatusLine {
    constructor() {
        this.frame = 0;
        this.msgIndex = 0;
        this.msgCounter = 0;
        this.timer = null;
        this.currentLabel = '';
        this.active = false;
    }
    start(label = 'Thinking...') {
        this.currentLabel = label;
        this.active = true;
        this.frame = 0;
        this.msgIndex = 0;
        this.msgCounter = 0;
        this.render();
        this.timer = setInterval(() => this.tick(), 80);
    }
    setLabel(label) {
        this.currentLabel = label;
        this.render();
    }
    tick() {
        this.frame = (this.frame + 1) % STATUS_FRAMES.length;
        this.msgCounter++;
        // Rotate status message every ~2 seconds
        if (this.msgCounter % 25 === 0) {
            this.msgIndex = (this.msgIndex + 1) % STATUS_MESSAGES.length;
            this.currentLabel = STATUS_MESSAGES[this.msgIndex];
        }
        this.render();
    }
    render() {
        if (!this.active)
            return;
        const spinner = chalk_1.default.cyan(STATUS_FRAMES[this.frame]);
        const label = chalk_1.default.gray(this.currentLabel);
        process.stdout.write(`\r  ${spinner} ${label}                    `);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.active = false;
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
}
// ─── Agent Runner ─────────────────────────────────────────────────────────────
async function runAgent(prompt) {
    const apiKey = process.env.NOVA_API_KEY || process.env.OPENAI_API_KEY || '';
    const apiBase = process.env.NOVA_API_BASE || 'https://openrouter.ai/api/v1';
    const isPuter = apiBase.includes('puter.com');
    if (!apiKey && !isPuter) {
        console.log();
        console.log(`  ${chalk_1.default.red('✗')} No API key found.`);
        console.log(`  Set ${chalk_1.default.yellow('NOVA_API_KEY')} in ${chalk_1.default.yellow('cli/.env')}`);
        console.log(`  Get a free key at ${chalk_1.default.cyan('https://openrouter.ai/keys')}`);
        console.log();
        return;
    }
    console.log();
    console.log(`  ${chalk_1.default.cyan(supportsUnicode ? '◆' : '*')} ${chalk_1.default.bold('Nova')} ${chalk_1.default.gray(`(${state.model})`)}`);
    console.log();
    const status = new StatusLine();
    const agent = new standalone_agent_1.StandaloneAgent(apiKey, apiBase);
    // Register for cancellation via SIGTERM (fired by Ctrl+C handler)
    const cancelHandler = () => { agent.cancel(); };
    process.once('SIGTERM', cancelHandler);
    // Track whether we're currently streaming tokens to stdout
    let streaming = false;
    let streamBuffer = ''; // accumulates raw tokens to detect/strip tool_call blocks
    let inToolCall = false; // true while inside <tool_call>...</tool_call>
    let thoughtPrinted = false; // true once we've printed the thought prefix for this iteration
    // Strip THOUGHT: prefix and tool_call blocks from streamed output
    function flushBuffer() {
        // Remove THOUGHT: prefix (handles both start-of-stream and after newlines)
        streamBuffer = streamBuffer.replace(/^[\s]*THOUGHT:\s*/i, '');
        // Also strip if it appears after a newline mid-stream
        streamBuffer = streamBuffer.replace(/\n[\s]*THOUGHT:\s*/gi, '\n');
        // If we hit <tool_call> or <tool_calls>, stop printing — hide everything from here
        const toolCallStart = streamBuffer.search(/<tool_calls?>/i);
        if (toolCallStart !== -1) {
            const visible = streamBuffer.slice(0, toolCallStart).trimEnd();
            if (visible) {
                if (!streaming) {
                    status.stop();
                    streaming = true;
                    process.stdout.write(`\n  ${chalk_1.default.gray(supportsUnicode ? '│' : '|')} `);
                    thoughtPrinted = true;
                }
                process.stdout.write(chalk_1.default.white(visible));
            }
            inToolCall = true;
            streamBuffer = '';
            return;
        }
        // Reset inToolCall if we see closing tag (shouldn't normally happen but be safe)
        if (inToolCall && streamBuffer.search(/<\/tool_calls?>/i) !== -1) {
            inToolCall = false;
            streamBuffer = '';
            return;
        }
        if (inToolCall) {
            streamBuffer = '';
            return;
        }
        // Print safe portion — keep last 30 chars buffered in case a tag is split across chunks
        const LOOKAHEAD = 30;
        if (streamBuffer.length > LOOKAHEAD) {
            const safe = streamBuffer.slice(0, streamBuffer.length - LOOKAHEAD);
            streamBuffer = streamBuffer.slice(streamBuffer.length - LOOKAHEAD);
            if (safe.trim()) {
                if (!streaming) {
                    status.stop();
                    streaming = true;
                    process.stdout.write(`\n  ${chalk_1.default.gray(supportsUnicode ? '│' : '|')} `);
                    thoughtPrinted = true;
                }
                process.stdout.write(chalk_1.default.white(safe));
            }
        }
    }
    try {
        status.start('Thinking...');
        const result = await agent.run({
            prompt,
            model: state.model,
            maxIterations: state.maxIterations,
            cwd: state.workspace,
            debug: state.debug,
            onIteration: (_iter, _thought, _tool) => {
                // Reset per-iteration state
                streamBuffer = '';
                inToolCall = false;
                thoughtPrinted = false;
            },
            // Live token streaming — filter out internal format tags
            onChunk: (token) => {
                if (inToolCall)
                    return; // discard everything inside tool_call
                streamBuffer += token;
                flushBuffer();
            },
            // Called when agent picks a tool to execute
            onAction: (tool, args) => {
                // Flush any remaining buffered text
                if (!inToolCall && streamBuffer.trim()) {
                    const clean = streamBuffer.replace(/^THOUGHT:\s*/i, '').trimEnd();
                    if (clean) {
                        if (!streaming) {
                            status.stop();
                            streaming = true;
                            process.stdout.write(`\n  ${chalk_1.default.gray(supportsUnicode ? '│' : '|')} `);
                        }
                        process.stdout.write(chalk_1.default.white(clean));
                    }
                }
                streamBuffer = '';
                inToolCall = false;
                if (streaming) {
                    process.stdout.write('\n');
                    streaming = false;
                }
                const argPreview = JSON.stringify(args).slice(0, 70);
                console.log(`  ${chalk_1.default.blue('⚡')} ${chalk_1.default.bold(tool)} ${chalk_1.default.gray(argPreview)}`);
                status.start(`Running ${tool}...`);
                thoughtPrinted = false;
            },
            onObservation: (obs, success) => {
                status.stop();
                if (state.debug) {
                    const icon = success ? chalk_1.default.green('✓') : chalk_1.default.red('✗');
                    const preview = obs.replace(/\n/g, ' ').slice(0, 80);
                    console.log(`  ${icon} ${chalk_1.default.gray(preview)}`);
                }
                status.start('Thinking...');
                streaming = false;
                streamBuffer = '';
                inToolCall = false;
                thoughtPrinted = false;
            },
            onThought: (_thought) => {
                // Already streamed token-by-token via onChunk
            },
        });
        // Clean up any active streaming/spinner
        if (streaming) {
            process.stdout.write('\n');
            streaming = false;
        }
        status.stop();
        process.removeListener('SIGTERM', cancelHandler);
        if (result.success) {
            printSuccess(result.iterations);
        }
        else {
            if (result.error)
                printError(result.error);
            else if (result.maxReached)
                printError(`Max iterations (${state.maxIterations}) reached`);
            else if (result.loopDetected)
                printError('Loop detected — agent got stuck');
        }
    }
    catch (e) {
        if (streaming) {
            process.stdout.write('\n');
            streaming = false;
        }
        status.stop();
        process.removeListener('SIGTERM', cancelHandler);
        // Friendly error messages for common failures
        if (e.message?.includes('AUTH_ERROR')) {
            console.log();
            console.log(`  ${chalk_1.default.red('✗')} Invalid API key or unauthorized.`);
            console.log(`  Run ${chalk_1.default.cyan('/provider')} to update your API key.`);
            console.log();
        }
        else if (e.message?.includes('RATE_LIMIT')) {
            console.log();
            console.log(`  ${chalk_1.default.yellow('⚠')}  Rate limited. Wait a moment and try again.`);
            console.log(`  Tip: use ${chalk_1.default.cyan('/model')} to switch to a different free model.`);
            console.log();
        }
        else {
            printError(e.message);
        }
    }
}
// ─── Input Loop ───────────────────────────────────────────────────────────────
let rl;
function createReadline() {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        historySize: MAX_HISTORY,
        prompt: chalk_1.default.cyan('  ❯ ')
    });
    rl.history = [...state.history].reverse();
    return rl;
}
// ─── Onboarding ───────────────────────────────────────────────────────────────
async function runOnboarding() {
    console.clear();
    console.log(NOVA_LOGO);
    console.log(chalk_1.default.bold('  Welcome to Nova! Let\'s get you set up.\n'));
    console.log(chalk_1.default.gray('  Nova needs an API key to talk to AI models.'));
    console.log(chalk_1.default.gray('  The fastest option is OpenRouter — free, no credit card needed.\n'));
    console.log(chalk_1.default.bold('  Where do you want to get your API key?'));
    console.log();
    console.log(`  ${chalk_1.default.cyan('1')}  OpenRouter ${chalk_1.default.green('(recommended, free)')}`);
    console.log(`     → openrouter.ai/keys`);
    console.log();
    console.log(`  ${chalk_1.default.cyan('2')}  Puter ${chalk_1.default.green('(free, no key needed)')}`);
    console.log(`     → puter.com`);
    console.log();
    console.log(`  ${chalk_1.default.cyan('3')}  OpenAI (paid)`);
    console.log(`     → platform.openai.com/api-keys`);
    console.log();
    console.log(`  ${chalk_1.default.cyan('4')}  I already have a key`);
    console.log();
    const choice = await question('  Enter choice (1-4): ');
    if (choice.trim() === '2') {
        // Puter — no key needed, just set the base
        cfg.apiBase = 'https://api.puter.com/v1';
        cfg.apiKey = 'puter'; // Puter uses session auth, key is a placeholder
        cfg.model = 'claude-opus-4-7';
        cfg.onboarded = true;
        process.env.NOVA_API_BASE = cfg.apiBase;
        process.env.NOVA_API_KEY = cfg.apiKey;
        state.model = cfg.model;
        saveConfig(cfg);
        console.log();
        console.log(`  ${chalk_1.default.green('✓')} Configured for Puter (free access to Claude, GPT-5, Gemini)`);
        console.log();
        await pressEnter();
        return;
    }
    let apiBase = 'https://openrouter.ai/api/v1';
    if (choice.trim() === '3')
        apiBase = 'https://api.openai.com/v1';
    if (choice.trim() === '1') {
        console.log();
        console.log(`  ${chalk_1.default.cyan('→')} Opening ${chalk_1.default.underline('https://openrouter.ai/keys')} in your browser...`);
        try {
            const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
            const url = 'https://openrouter.ai/keys';
            if (process.platform === 'win32') {
                exec(`start "" "${url}"`);
            }
            else if (process.platform === 'darwin') {
                exec(`open "${url}"`);
            }
            else {
                exec(`xdg-open "${url}"`);
            }
        }
        catch { /* ignore if browser can't open */ }
        console.log(`  ${chalk_1.default.gray('(If it didn\'t open, visit the URL manually)')}`);
    }
    console.log();
    const apiKey = await question('  Paste your API key here: ');
    if (!apiKey.trim()) {
        console.log(chalk_1.default.yellow('\n  Skipped. You can set your key later with /provider\n'));
        cfg.onboarded = true;
        saveConfig(cfg);
        return;
    }
    cfg.apiKey = apiKey.trim();
    cfg.apiBase = apiBase;
    cfg.onboarded = true;
    process.env.NOVA_API_KEY = cfg.apiKey;
    process.env.NOVA_API_BASE = cfg.apiBase;
    saveConfig(cfg);
    console.log();
    console.log(`  ${chalk_1.default.green('✓')} API key saved to ${chalk_1.default.gray(CONFIG_FILE)}`);
    console.log(`  ${chalk_1.default.gray('Note: key is stored in plaintext. Keep this file private.')}`);
    console.log();
    // Quick validation
    process.stdout.write(`  ${chalk_1.default.gray('Validating key...')}`);
    const valid = await validateApiKey(cfg.apiKey, cfg.apiBase);
    if (valid) {
        process.stdout.write(`\r  ${chalk_1.default.green('✓')} Key is valid! You\'re ready to go.\n`);
    }
    else {
        process.stdout.write(`\r  ${chalk_1.default.yellow('⚠')}  Could not validate key (might still work). Check if it\'s correct.\n`);
    }
    console.log();
    await pressEnter();
}
async function validateApiKey(apiKey, apiBase) {
    try {
        const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
        const url = `${apiBase.replace(/\/$/, '')}/models`;
        await axios.get(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 5000
        });
        return true;
    }
    catch (e) {
        return e?.response?.status !== 401 && e?.response?.status !== 403;
    }
}
function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}
async function pressEnter() {
    await question(chalk_1.default.gray('  Press Enter to continue...'));
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    // Load history
    state.history = loadHistory();
    // Create readline first (needed for onboarding)
    createReadline();
    // First-run onboarding
    const needsOnboarding = !cfg.onboarded && !process.env.NOVA_API_KEY && !process.env.OPENAI_API_KEY;
    if (needsOnboarding) {
        await runOnboarding();
    }
    // Print banner
    printBanner();
    // Warn if still no key after onboarding
    const apiKey = process.env.NOVA_API_KEY || process.env.OPENAI_API_KEY || cfg.apiKey;
    if (!apiKey) {
        console.log(`  ${chalk_1.default.yellow('⚠')}  No API key set. Run ${chalk_1.default.cyan('/provider')} to configure one.`);
        console.log();
    }
    rl.prompt();
    // Track if agent is running for SIGINT handling
    let agentRunning = false;
    rl.on('line', async (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
            rl.prompt();
            return;
        }
        // Handle slash commands
        if (trimmed.startsWith('/')) {
            if (trimmed.toLowerCase() === '/models') {
                rl.pause();
                await pickModel();
                rl.resume();
                rl.prompt();
                return;
            }
            if (trimmed.toLowerCase() === '/provider') {
                rl.pause();
                await pickProvider();
                rl.resume();
                rl.prompt();
                return;
            }
            handleCommand(trimmed);
            rl.prompt();
            return;
        }
        addToHistory(trimmed);
        rl.pause();
        agentRunning = true;
        await runAgent(trimmed);
        agentRunning = false;
        rl.resume();
        rl.prompt();
    });
    rl.on('close', () => {
        console.log();
        console.log(chalk_1.default.cyan('  Goodbye! 👋'));
        console.log();
        process.exit(0);
    });
    let ctrlCCount = 0;
    rl.on('SIGINT', () => {
        ctrlCCount++;
        if (agentRunning) {
            console.log();
            console.log(chalk_1.default.yellow('  ⚠  Stopping agent...'));
            // Signal will propagate to abort controller in runAgent
            process.emit('SIGTERM');
            agentRunning = false;
            rl.resume();
            rl.prompt();
            ctrlCCount = 0;
        }
        else if (ctrlCCount >= 2) {
            console.log();
            console.log(chalk_1.default.cyan('  Goodbye! 👋'));
            console.log();
            process.exit(0);
        }
        else {
            console.log();
            console.log(chalk_1.default.gray('  Press Ctrl+C again or type /exit to quit'));
            rl.prompt();
            setTimeout(() => { ctrlCCount = 0; }, 2000);
        }
    });
}
main().catch(console.error);
//# sourceMappingURL=nova-repl.js.map
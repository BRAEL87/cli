# Nova Agent CLI

An autonomous AI coding agent for your terminal — like Claude Code, but free. Powered by [Hy3](https://openrouter.ai/tencent/hy3-preview:free) (74.4% SWE-bench) via OpenRouter.

```
npm install -g nova-agent-cli
nova
```

---

## Features

- **Interactive REPL** — conversational coding sessions with memory across prompts
- **Autonomous agent** — runs multi-step tasks end-to-end without hand-holding
- **Free by default** — uses `tencent/hy3-preview:free` with no credits required
- **Full file system access** — read, write, edit, move, delete files
- **Shell execution** — runs build commands, tests, installs, git operations
- **Codebase search** — grep, file tree, outline, find by name
- **Loop detection** — automatically detects and breaks out of repetitive cycles
- **Checkpoint resume** — picks up where it left off if interrupted
- **Parallel tool calls** — batches read-only operations for speed
- **SWE-bench evaluation** — built-in benchmark runner
- **Multi-provider** — OpenRouter, OpenAI, Puter, Ollama, or any OpenAI-compatible endpoint

---

## Install

```bash
npm install -g nova-agent-cli
```

Requires Node.js 18+.

---

## Quick Start

### 1. Get a free API key

Sign up at [openrouter.ai/keys](https://openrouter.ai/keys) — no credit card needed.

### 2. Set your key

```bash
export NOVA_API_KEY=sk-or-v1-your-key-here
```

Or create a `.env` file in your project:

```env
NOVA_API_KEY=sk-or-v1-your-key-here
NOVA_API_BASE=https://openrouter.ai/api/v1
```

### 3. Run

```bash
nova
```

---

## Usage

### Interactive mode (default)

```bash
nova
nova chat
nova repl
```

Starts a REPL session. Type your task in plain English. The agent reads your codebase, makes changes, runs commands, and reports back.

```
> Fix the bug in auth.ts where login returns 401 for valid users
> Add input validation to all API routes
> Write tests for the payment service
```

### Single task (non-interactive)

```bash
nova agent -p "Refactor utils.py to use async/await"
nova agent -p "Add TypeScript types to all exported functions" --model openai/gpt-4o
nova agent -p "Fix failing tests" --max-iterations 60 --log run.jsonl
```

### Initialize in a project

```bash
cd my-project
nova init
```

Creates `.nova/config.json` with your preferred model and settings, and adds `.nova/` to `.gitignore`.

---

## Commands

### CLI flags

| Command | Description |
|---|---|
| `nova` | Start interactive REPL |
| `nova chat` | Same as above |
| `nova agent -p "<task>"` | Run a single task autonomously |
| `nova init` | Scaffold `.nova/` config in current project |
| `nova test` | Run agent capability tests |
| `nova bench` | Run SWE-bench evaluation |

#### `nova agent` options

| Flag | Default | Description |
|---|---|---|
| `-p, --prompt` | required | Task to run |
| `-m, --model` | `tencent/hy3-preview:free` | Model ID |
| `-i, --max-iterations` | `40` | Max agent iterations |
| `-d, --debug` | `false` | Verbose debug output |
| `-l, --log <path>` | — | Save run log as JSONL |
| `-w, --workspace <path>` | `cwd` | Working directory |
| `--puter` | — | Use Puter free AI (no key needed) |
| `--puter-token <token>` | — | Puter auth token |

### REPL commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/models` | Browse and select a model interactively |
| `/model <id>` | Set model by ID |
| `/provider` | Switch API provider |
| `/workspace <path>` | Change working directory |
| `/iter <n>` | Set max iterations |
| `/debug` | Toggle debug output |
| `/status` | Show current settings |
| `/history` | Show recent prompts |
| `/clear` | Clear screen |
| `/exit` | Quit |

---

## Models

### Free (no credits)

| Model | ID | Notes |
|---|---|---|
| Hy3 Preview | `tencent/hy3-preview:free` | **Recommended** — 74.4% SWE-bench |
| Qwen 2.5 Coder 32B | `qwen/qwen-2.5-coder-32b-instruct:free` | Coding specialist |
| Gemini 2.0 Flash Thinking | `google/gemini-2.0-flash-thinking-exp:free` | Strong reasoning |
| Llama 3.3 70B | `meta-llama/llama-3.3-70b-instruct:free` | General purpose |
| Auto | `openrouter/free` | Auto-selects best available free model |

### Paid (via OpenRouter)

| Model | ID | Cost |
|---|---|---|
| GPT-4o Mini | `openai/gpt-4o-mini` | $0.15/1M tokens |
| GPT-4o | `openai/gpt-4o` | $2.50/1M tokens |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | $3/1M tokens |
| Gemini Flash 1.5 | `google/gemini-flash-1.5` | $0.075/1M tokens |
| DeepSeek R1 | `deepseek/deepseek-r1` | $0.55/1M tokens |

---

## Providers

Switch providers with `/provider` in the REPL or set env vars directly.

### OpenRouter (default)

```env
NOVA_API_KEY=sk-or-v1-your-key
NOVA_API_BASE=https://openrouter.ai/api/v1
```

### OpenAI

```env
NOVA_API_KEY=sk-your-openai-key
NOVA_API_BASE=https://api.openai.com/v1
```

### Puter (free, requires auth token)

```bash
nova agent -p "your task" --puter-token <your-puter-auth-token>
```

Get your token from [puter.com](https://puter.com) → F12 → Application → Cookies → `auth_token`.

### Local (Ollama, LM Studio, etc.)

```env
NOVA_API_KEY=anything
NOVA_API_BASE=http://localhost:11434/v1
```

---

## Agent Tools

The agent has access to these tools at runtime:

| Tool | Description |
|---|---|
| `read_file` | Read a file with line numbers |
| `read_chunk` | Read a specific line range |
| `write_file` | Create or overwrite a file |
| `append_to_file` | Append content to a file |
| `edit_file` | Replace a specific block of content |
| `multi_edit_file` | Apply multiple edits in one call |
| `delete_file` | Delete a file or directory |
| `move_file` | Move or rename a file |
| `bash` | Run a shell command |
| `get_file_tree` | Show directory tree |
| `list_dir` | List directory contents |
| `find_by_name` | Find files by name pattern |
| `grep_in_file` | Search for a pattern in a file |
| `search_codebase` | Search across all files |
| `view_file_outline` | Get function/class structure |
| `get_diagnostics` | Check for lint/type errors |
| `run_tests` | Run test suite |
| `search_web` | Search the web |
| `run_async_command` | Run a long-running command in background |

---

## Benchmarking

Run SWE-bench evaluation:

```bash
nova bench --tasks tasks.jsonl --output predictions.jsonl --model tencent/hy3-preview:free
nova bench --tasks tasks.jsonl --output predictions.jsonl --limit 10  # quick test
```

Run capability tests:

```bash
nova test --level 1          # basic file ops
nova test --level 2          # multi-step tasks
nova test --level 3 --swe-bench tasks.jsonl  # full SWE-bench
```

---

## Configuration

`nova init` creates `.nova/config.json`:

```json
{
  "model": "tencent/hy3-preview:free",
  "maxIterations": 40,
  "workspace": ".",
  "instructions": "You are working in this project. Follow existing code style and conventions."
}
```

Global config is saved to `~/.nova_config`. Prompt history is saved to `~/.nova_history`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `NOVA_API_KEY` | API key (also accepts `OPENAI_API_KEY`) |
| `NOVA_API_BASE` | API base URL (default: OpenRouter) |

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Links

- [Nova Studio Desktop App](https://github.com/nova-studio/nova-agent-cli)
- [OpenRouter](https://openrouter.ai) — free model access
- [Hy3 on OpenRouter](https://openrouter.ai/tencent/hy3-preview:free) — the default free model


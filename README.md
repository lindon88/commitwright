# commitwright

> Ticket-aware git commit messages from your staged diff — Ollama, OpenAI, Anthropic, Claude Code CLI, or Codex CLI. Custom prompt templates. Persistent global and per-repo config.

[![npm version](https://img.shields.io/npm/v/commitwright.svg?style=flat-square)](https://www.npmjs.com/package/commitwright)
[![npm downloads](https://img.shields.io/npm/dm/commitwright.svg?style=flat-square)](https://www.npmjs.com/package/commitwright)
[![Node.js version](https://img.shields.io/node/v/commitwright.svg?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/commitwright.svg?style=flat-square)](./LICENSE)

```bash
$ git checkout -b feature/ABC-456-order-flow
$ git add -p
$ commitwright
ABC-456 Improve order processing flow
- Added missing payment validation
- Updated order status enum
- Removed unused OrderHelper class
```

`commitwright` reads your **branch name** (to extract a ticket like `ABC-123`) and your **staged diff**, then asks an LLM to write a commit message that follows your team's rules. The result is printed to stdout — no auto-commit, no surprises.

```bash
git commit -m "$(commitwright)"
```

---

## Table of contents

- [Why](#why)
- [Quick start](#quick-start)
- [Providers](#providers)
- [Install](#install)
- [Configure](#configure)
  - [Persistent config: `commitwright config`](#persistent-config-commitwright-config)
  - [Environment variables](#environment-variables)
  - [Hand-edited config file](#hand-edited-config-file)
- [Usage](#usage)
- [Templating](#templating)
- [How it works](#how-it-works)
- [Privacy and data flow](#privacy-and-data-flow)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Why

Most AI commit-message tools drop the ticket reference, ignore your team's format, and either lock you into one provider or send your code to one cloud. `commitwright`:

- **Extracts the ticket id** from your branch name (`feature/ABC-123-…`) and prefixes the message with it.
- **Plugs into five providers** — local-only Ollama for private repos, the Anthropic and OpenAI APIs for cloud, or the Claude Code and Codex CLIs you already have installed.
- **Lets you bring your own prompt template** — the default ships ticket-prefixed rules, but a Conventional Commits template is included and any `{{branch}}/{{diff}}/{{ticket}}/…` template works.
- **Has a `git config`-style command** for persistent global and per-repo settings.
- **Doesn't auto-commit** — output goes to stdout, you stay in control.

Zero runtime dependencies. Node 18+.

---

## Quick start

```bash
# 1. Install
npm install -g commitwright

# 2. Pick a provider once (writes to ~/.commitwrightrc.json)
commitwright config set provider anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Use it
git add -p
git commit -m "$(commitwright)"
```

Or with local-only Ollama:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
commitwright config set provider ollama
git add -p
git commit -m "$(commitwright)"
```

---

## Providers

| Provider    | How it runs                  | What you need                                                         |
| ----------- | ---------------------------- | --------------------------------------------------------------------- |
| `ollama`    | HTTP to local Ollama daemon  | `ollama serve` running on `http://localhost:11434`                    |
| `claude`    | Shells out to `claude -p`    | [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) on `$PATH` |
| `codex`     | Shells out to `codex exec`   | [Codex CLI](https://github.com/openai/codex) on `$PATH`               |
| `openai`    | HTTPS `/v1/chat/completions` | `OPENAI_API_KEY` (or any OpenAI-compatible endpoint via `--base-url`) |
| `anthropic` | HTTPS `/v1/messages`         | `ANTHROPIC_API_KEY`                                                   |

The `openai` provider works against Azure OpenAI, OpenRouter, Together, Groq, vLLM, LM Studio, etc. — anything that speaks the Chat Completions API. Set `--base-url` or `OPENAI_BASE_URL`.

---

## Install

### From npm

```bash
npm install -g commitwright
```

### From source

```bash
git clone https://github.com/<your-username>/commitwright.git
cd commitwright
npm install -g .
```

### Verify

```bash
commitwright --version
commitwright --help
```

Requires Node.js 18 or later. Zero runtime dependencies.

---

## Configure

Three ways to set things, in order of precedence (later wins):

1. **Built-in defaults** — Ollama, model `qwen2.5-coder:7b`.
2. **Persistent config files** — `~/.commitwrightrc.json` (global) and `.commitwrightrc.json` in the repo or any ancestor (local). Local overrides global.
3. **Environment variables** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, plus the `COMMITWRIGHT_*` family.
4. **CLI flags** on a single invocation.

### Persistent config: `commitwright config`

A `git config`-style subcommand. No JSON editing required.

```bash
# Set machine-wide defaults
commitwright config set provider anthropic
commitwright config set anthropic.model claude-haiku-4-5
commitwright config set openai.model gpt-4o-mini
commitwright config set ollama.host http://192.168.1.10:11434
commitwright config set maxDiffChars 30000

# Per-repo override
commitwright config set --local provider ollama
commitwright config set --local promptTemplateFile ./.github/commit.tmpl

# Inspect
commitwright config get provider
commitwright config list           # full effective config (API keys redacted)
commitwright config path           # show global file path
commitwright config path --local   # show local file path

# Other actions
commitwright config init           # create a starter file with defaults
commitwright config edit           # open in $EDITOR
commitwright config unset openai.model
commitwright config help
```

| Action | Description | Default scope |
| --- | --- | --- |
| `get <key>` | Print the effective value of `<key>` (after merging all sources) | n/a |
| `set <key> <value>` | Set a value. Values are coerced (`true`/`false`, integers, JSON literals, otherwise string). | `--global` |
| `unset <key>` | Remove a value | `--global` |
| `list` | Print the merged effective config; API keys are redacted to `<set>` | n/a |
| `path` | Print the file path for the chosen scope | `--global` |
| `init` | Create a starter config file with sensible defaults | `--global` |
| `edit` | Open the config file in `$VISUAL`/`$EDITOR` | `--global` |

`--local` writes to `<repo-root>/.commitwrightrc.json` (or the cwd if you're not in a repo). Use it for project-specific settings such as a different default provider or a custom prompt template per repo.

### Environment variables

| Variable | Effect |
| --- | --- |
| `COMMITWRIGHT_PROVIDER` | `ollama` \| `claude` \| `codex` \| `openai` \| `anthropic` |
| `COMMITWRIGHT_PROMPT_FILE` | Path to a custom prompt template |
| `OLLAMA_HOST` | Ollama URL (default `http://localhost:11434`) |
| `COMMITWRIGHT_OLLAMA_MODEL` | Ollama model tag |
| `COMMITWRIGHT_CLAUDE_BIN` / `COMMITWRIGHT_CLAUDE_MODEL` | Path to `claude` / model name |
| `COMMITWRIGHT_CODEX_BIN`  / `COMMITWRIGHT_CODEX_MODEL` | Path to `codex` / model name |
| `OPENAI_API_KEY` | OpenAI auth |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint |
| `COMMITWRIGHT_OPENAI_MODEL` | OpenAI model name |
| `ANTHROPIC_API_KEY` | Anthropic auth |
| `ANTHROPIC_BASE_URL` | Anthropic base URL |
| `COMMITWRIGHT_ANTHROPIC_MODEL` | Claude model name |

API keys can be stored in the config file via `commitwright config set openai.apiKey sk-...`, but env vars are recommended.

### Hand-edited config file

`.commitwrightrc.json` (global at `~/`, local in the repo):

```json
{
  "provider": "anthropic",
  "promptTemplateFile": "./.github/commit-template.tmpl",

  "ollama":    { "host": "http://localhost:11434", "model": "qwen2.5-coder:7b" },
  "claude":    { "binary": "claude",               "model": "claude-sonnet-4-6" },
  "codex":     { "binary": "codex",                "model": "gpt-5" },
  "openai":    { "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini" },
  "anthropic": { "model": "claude-haiku-4-5", "maxTokens": 1024 },

  "maxDiffChars": 20000
}
```

A `promptTemplateFile` set in the JSON is resolved relative to the config file's location. From CLI/env it's resolved relative to cwd.

---

## Usage

```bash
# Default provider (from your config)
commitwright

# Switch provider per call
commitwright --provider anthropic
commitwright --provider openai --model gpt-4o
commitwright --provider openai --base-url https://openrouter.ai/api/v1 --model anthropic/claude-haiku-4-5
commitwright --provider ollama --model qwen2.5-coder:7b

# Use a custom prompt template
commitwright --prompt-file ./templates/conventional.tmpl

# Inspect what would be sent to the LLM
commitwright --dry-run
commitwright --print-prompt    # prints prompt to stderr, then runs

# Subcommand
commitwright config <action>   # see "Persistent config" above

# Help
commitwright --help
commitwright config help
```

### Wire it into your normal workflow

Add an alias to your shell profile:

```bash
# ~/.zshrc / ~/.bashrc
alias gcm='git commit -m "$(commitwright)"'
```

Or set it as a git alias:

```bash
git config --global alias.cm '!f() { git commit -m "$(commitwright)" "$@"; }; f'
git cm
```

---

## Templating

The default template ships ticket-prefixed rules: max ~10-word summary, optional past-tense bullet list. Two ready-made templates are included in `templates/`:

- `default.tmpl` — the default ticket-prefixed format
- `conventional.tmpl` — [Conventional Commits](https://www.conventionalcommits.org/)

Override the template in any of these ways:

| Method | How |
| --- | --- |
| CLI flag | `commitwright --prompt-file ./my-template.tmpl` |
| Env var | `COMMITWRIGHT_PROMPT_FILE=./my-template.tmpl` |
| Global config | `commitwright config set promptTemplateFile ~/.config/commit.tmpl` |
| Local config | `commitwright config set --local promptTemplateFile ./.github/commit.tmpl` |
| Inline JSON | `"promptTemplate": "Full template body..."` |

### Placeholders

| Placeholder | Replaced with |
| --- | --- |
| `{{branch}}` | Current git branch name |
| `{{ticket}}` | Extracted ticket id (e.g. `ABC-123`), or empty string |
| `{{ticketNote}}` | Auto-generated sentence describing whether a ticket exists |
| `{{diff}}` | Staged diff (capped at `maxDiffChars`) |
| `{{stat}}` | `git diff --cached --stat` |
| `{{files}}` | Newline-separated list of staged file paths |
| `{{truncated}}` | Note about truncation, or empty |

Unknown placeholders are left intact, so `{{any other text}}` passes through.

### Minimal example

```text
Write a commit message for branch `{{branch}}`.
{{ticketNote}}

Files changed:
{{stat}}

Diff:
```diff
{{diff}}
```{{truncated}}

Output only the message.
```

---

## How it works

1. Confirms the cwd is inside a git repo (`git rev-parse --is-inside-work-tree`).
2. Reads the branch name (`git branch --show-current`).
3. Extracts a ticket id from the branch via the regex `[A-Za-z][A-Za-z0-9]+-\d+` and uppercases it.
4. Reads the staged diff (`git diff --cached`), the file stat (`--stat`), and the file list (`--name-only`).
5. Renders the prompt template with all the placeholders.
6. Calls the configured provider.
7. Post-processes the response — strips ` ``` ` fences, drops "Here is the commit message:" preambles, and re-prefixes the ticket if the model forgot it.
8. Prints the result to stdout. Exit code is `0` on success, non-zero on failure.

---

## Privacy and data flow

`commitwright` only sends data to the provider you've configured. There is **no telemetry**, no analytics, no phone-home.

- **`ollama`** — your branch name and staged diff stay on your machine.
- **`claude`** / **`codex`** — sent to whatever endpoint those CLIs are configured for (typically Anthropic / OpenAI).
- **`openai`** / **`anthropic`** — sent directly to the API endpoint you've configured.

Your staged diff is included in the prompt verbatim. **If your repo contains secrets in tracked files, they will be sent to the provider.** Use a `.gitignore` and tools like `git-secrets` to keep secrets out of your tree, or use the `ollama` provider to keep everything local.

---

## Troubleshooting

| Error | Fix |
| --- | --- |
| `No staged changes` | Run `git add <files>` first. `commitwright` only looks at what's staged. |
| `OpenAI provider needs an API key` | `export OPENAI_API_KEY=sk-...` or `commitwright config set openai.apiKey sk-...` |
| `Anthropic provider needs an API key` | `export ANTHROPIC_API_KEY=sk-ant-...` |
| `Could not reach Ollama` | `ollama serve` and `ollama pull qwen2.5-coder:7b` |
| `Could not find the \`claude\` binary` | Install Claude Code, or `commitwright config set claude.binary /path/to/claude` |
| `Could not find the \`codex\` binary` | Install Codex CLI, or `commitwright config set codex.binary /path/to/codex` |
| Output too verbose / wrong format | Try a different (smaller, instruction-tuned) model, or supply your own `--prompt-file` |

If you need to see the exact prompt being sent, use `commitwright --print-prompt` (writes prompt to stderr, then runs) or `commitwright --dry-run` (writes prompt to stdout and exits without calling the LLM).

---

## Contributing

Contributions welcome. Before opening a PR:

1. Fork and clone, then `npm install` (no production deps; dev deps only for tests/lint).
2. Run `npm test` and add tests for any new behavior.
3. Use `commitwright` itself for your commit messages — there's no better way to dogfood.
4. Keep the public surface small. New providers belong in `src/providers/<name>.js`; new CLI flags should be defensible.

Bug reports, model recommendations, and template contributions are all appreciated. See `CONTRIBUTING.md` (when present) for details.

---

## License

[MIT](./LICENSE) — see the LICENSE file for the full text.

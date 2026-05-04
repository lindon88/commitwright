#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { loadConfig } = require('../src/config');
const { generateCommitMessage } = require('../src');
const { SUPPORTED } = require('../src/providers');
const { buildPrompt } = require('../src/prompt');
const { runConfigCommand } = require('../src/config-cli');
const git = require('../src/git');

const HELP = `commitwright — generate a git commit message from staged changes via an LLM.

Usage:
  commitwright [options]                Generate a commit message and print it
  commitwright config <action> [...]    Manage persistent config (run 'config help')

Generate options:
  -p, --provider <name>     LLM provider: ${SUPPORTED.join(' | ')}  (default: ollama)
  -m, --model <name>        Override the selected provider's model
      --host <url>          Ollama host (default: http://localhost:11434)
      --base-url <url>      OpenAI-compatible base URL (default: https://api.openai.com/v1)
      --prompt-file <path>  Use a custom prompt template (see "Templating" in README)
      --max-diff <n>        Cap staged diff size sent to the LLM (chars, default 20000)
      --print-prompt        Print the constructed prompt to stderr (debug)
      --dry-run             Build the prompt but don't call the LLM (prints prompt to stdout)
  -h, --help                Show this help
  -v, --version             Show version

Configuration is loaded in this order (later wins):
  1. Built-in defaults
  2. ~/.commitwrightrc.json                       (global)
  3. .commitwrightrc.json in the repo or any ancestor (local)
  4. Environment variables: COMMITWRIGHT_PROVIDER, COMMITWRIGHT_PROMPT_FILE,
     OLLAMA_HOST, COMMITWRIGHT_OLLAMA_MODEL,
     COMMITWRIGHT_CLAUDE_BIN / _MODEL,
     COMMITWRIGHT_CODEX_BIN  / _MODEL,
     OPENAI_API_KEY,    OPENAI_BASE_URL,    COMMITWRIGHT_OPENAI_MODEL,
     ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, COMMITWRIGHT_ANTHROPIC_MODEL
  5. CLI flags

Use 'commitwright config' to manage 2 + 3 from the command line.

Templating:
  Override the prompt via --prompt-file <path>, the COMMITWRIGHT_PROMPT_FILE env
  var, or 'promptTemplate' / 'promptTemplateFile' in your config.
  Placeholders: {{branch}}, {{ticket}}, {{ticketNote}}, {{diff}}, {{stat}},
  {{files}}, {{truncated}}.
  Bundled examples: templates/default.tmpl, templates/conventional.tmpl

Typical usage:
  commitwright config set provider anthropic       # one-time setup
  git add -p
  git commit -m "$(commitwright)"
`;

function parseArgs(argv) {
  const out = { cliCfg: {}, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h':
      case '--help':
        out.flags.help = true;
        break;
      case '-v':
      case '--version':
        out.flags.version = true;
        break;
      case '-p':
      case '--provider':
        out.cliCfg.provider = next();
        break;
      case '-m':
      case '--model':
        out.flags.modelOverride = next();
        break;
      case '--host':
        out.cliCfg.ollama = { ...(out.cliCfg.ollama || {}), host: next() };
        break;
      case '--base-url':
        out.cliCfg.openai = { ...(out.cliCfg.openai || {}), baseURL: next() };
        break;
      case '--prompt-file': {
        const p = next();
        out.cliCfg.promptTemplateFile = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
        break;
      }
      case '--max-diff':
        out.cliCfg.maxDiffChars = Number.parseInt(next(), 10);
        break;
      case '--print-prompt':
        out.flags.printPrompt = true;
        break;
      case '--dry-run':
        out.flags.dryRun = true;
        break;
      default:
        process.stderr.write(`commitwright: unknown option "${a}"\n${HELP}`);
        process.exit(2);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);

  // Subcommand dispatch (must run before flag parsing).
  if (argv[0] === 'config') {
    return await runConfigCommand(argv.slice(1));
  }

  // Help / version handled before parseArgs so they always work.
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    const pkg = require('../package.json');
    process.stdout.write(`${pkg.name} ${pkg.version}\n`);
    return 0;
  }

  const { cliCfg, flags } = parseArgs(argv);
  let config = loadConfig(cliCfg);

  // --model after merge, scoped to the selected provider.
  if (flags.modelOverride) {
    const p = config.provider;
    if (!config[p]) config[p] = {};
    config[p].model = flags.modelOverride;
  }

  if (flags.dryRun || flags.printPrompt) {
    git.assertInsideRepo();
    const branch = git.getBranchName();
    const ticket = git.extractTicket(branch);
    const diff = git.getStagedDiff();
    const stat = git.getStagedStat();
    const files = git.getStagedFiles();
    if (!diff.trim()) {
      process.stderr.write('commitwright: no staged changes.\n');
      return 1;
    }
    const prompt = buildPrompt({
      branchName: branch,
      ticket,
      diff,
      stat,
      files,
      maxDiffChars: config.maxDiffChars,
      template: config.promptTemplate,
      templateFile: config.promptTemplateFile,
    });
    if (flags.printPrompt) process.stderr.write(prompt + '\n');
    if (flags.dryRun) {
      process.stdout.write(prompt + '\n');
      return 0;
    }
  }

  const { message } = await generateCommitMessage(config);
  process.stdout.write(message + '\n');
  return 0;
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    process.stderr.write(`commitwright: ${err.message}\n`);
    process.exit(1);
  });

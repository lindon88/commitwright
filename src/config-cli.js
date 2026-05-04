'use strict';

/**
 * `commitwright config` subcommand — git-config-style management of the
 * persistent config files.
 *
 *   commitwright config get <key>
 *   commitwright config set <key> <value>      [--global|--local]
 *   commitwright config unset <key>            [--global|--local]
 *   commitwright config list
 *   commitwright config path                   [--global|--local]
 *   commitwright config init                   [--global|--local]
 *   commitwright config edit                   [--global|--local]
 *
 * --global writes to $HOME/.commitwrightrc.json (default for set/unset/init/edit).
 * --local  writes to the repo root (or cwd if not in a repo).
 *
 * Keys use dot notation: openai.model, anthropic.apiKey, maxDiffChars.
 * Values are coerced: "true"/"false" -> boolean, ints/decimals -> number,
 * JSON objects/arrays parsed; everything else stays a string.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  loadConfig,
  globalConfigPath,
  findLocalConfigPath,
  findRepoRoot,
} = require('./config');

const HELP = `commitwright config — manage persistent configuration.

Usage:
  commitwright config <action> [args] [--global|--local]

Actions:
  get <key>             Print the effective value of <key>
  set <key> <value>     Set <key> = <value>  (default scope: --global)
  unset <key>           Remove <key>          (default scope: --global)
  list                  Print the effective merged config (API keys redacted)
  path                  Print the path of the config file for the chosen scope
  init                  Create a starter config file
  edit                  Open the config file in $EDITOR
  help                  Show this help

Scope:
  --global              ~/.commitwrightrc.json  (default for set/unset/init/edit)
  --local               <repo-root>/.commitwrightrc.json (or cwd if not in a repo)

Examples:
  commitwright config set provider anthropic
  commitwright config set anthropic.model claude-haiku-4-5
  commitwright config set openai.apiKey sk-...
  commitwright config set maxDiffChars 30000
  commitwright config set ollama.host http://192.168.1.10:11434 --global
  commitwright config set --local provider ollama
  commitwright config get provider
  commitwright config list
  commitwright config path --local

Notes:
  - Storing API keys via 'set' is allowed but env vars (OPENAI_API_KEY,
    ANTHROPIC_API_KEY) are recommended.
  - Local config beats global at runtime; CLI flags and env vars beat both.
`;

function parseScope(args) {
  const out = { scope: null, rest: [] };
  for (const a of args) {
    if (a === '--global') out.scope = 'global';
    else if (a === '--local') out.scope = 'local';
    else out.rest.push(a);
  }
  return out;
}

function parseValue(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch { /* keep as string */ }
  }
  return s;
}

function getNested(obj, key) {
  return key.split('.').reduce((cur, k) => (cur == null ? cur : cur[k]), obj);
}

function setNested(obj, key, value) {
  const keys = key.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function unsetNested(obj, key) {
  const keys = key.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) return false;
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (Object.prototype.hasOwnProperty.call(cur, last)) {
    delete cur[last];
    return true;
  }
  return false;
}

function resolveScopePath(scope) {
  if (scope === 'global' || !scope) return globalConfigPath();
  // local
  const existing = findLocalConfigPath();
  if (existing) return existing;
  const root = findRepoRoot();
  return path.join(root || process.cwd(), '.commitwrightrc.json');
}

function readScopeConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`could not parse ${file}: ${err.message}`);
  }
}

function writeScopeConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function redactSecrets(cfg) {
  const out = JSON.parse(JSON.stringify(cfg));
  if (out.openai && out.openai.apiKey) out.openai.apiKey = '<set>';
  if (out.anthropic && out.anthropic.apiKey) out.anthropic.apiKey = '<set>';
  return out;
}

async function runConfigCommand(args) {
  const action = args[0];
  if (!action || action === 'help' || action === '-h' || action === '--help') {
    process.stdout.write(HELP);
    return 0;
  }

  const { scope, rest } = parseScope(args.slice(1));

  switch (action) {
    case 'get': {
      const key = rest[0];
      if (!key) {
        process.stderr.write('usage: commitwright config get <key>\n');
        return 2;
      }
      const cfg = loadConfig({});
      const value = getNested(cfg, key);
      if (value === undefined) return 1;
      process.stdout.write(
        (typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)) + '\n',
      );
      return 0;
    }

    case 'set': {
      const [key, val] = rest;
      if (!key || val === undefined) {
        process.stderr.write('usage: commitwright config set <key> <value> [--global|--local]\n');
        return 2;
      }
      const file = resolveScopePath(scope || 'global');
      const cfg = readScopeConfig(file);
      setNested(cfg, key, parseValue(val));
      writeScopeConfig(file, cfg);
      process.stdout.write(`set ${key} = ${val} in ${file}\n`);
      return 0;
    }

    case 'unset': {
      const key = rest[0];
      if (!key) {
        process.stderr.write('usage: commitwright config unset <key> [--global|--local]\n');
        return 2;
      }
      const file = resolveScopePath(scope || 'global');
      const cfg = readScopeConfig(file);
      const removed = unsetNested(cfg, key);
      if (!removed) {
        process.stderr.write(`${key} not set in ${file}\n`);
        return 1;
      }
      writeScopeConfig(file, cfg);
      process.stdout.write(`unset ${key} in ${file}\n`);
      return 0;
    }

    case 'list': {
      const cfg = loadConfig({});
      process.stdout.write(JSON.stringify(redactSecrets(cfg), null, 2) + '\n');
      return 0;
    }

    case 'path': {
      const file = resolveScopePath(scope || 'global');
      const note = fs.existsSync(file) ? '' : ' (does not exist yet)';
      process.stdout.write(file + note + '\n');
      return 0;
    }

    case 'init': {
      const file = resolveScopePath(scope || 'global');
      if (fs.existsSync(file)) {
        process.stderr.write(`${file} already exists.\n`);
        return 1;
      }
      writeScopeConfig(file, {
        provider: 'ollama',
        ollama: { host: 'http://localhost:11434', model: 'qwen2.5-coder:7b' },
      });
      process.stdout.write(`created ${file}\n`);
      return 0;
    }

    case 'edit': {
      const file = resolveScopePath(scope || 'global');
      if (!fs.existsSync(file)) writeScopeConfig(file, {});
      const editor =
        process.env.VISUAL ||
        process.env.EDITOR ||
        (process.platform === 'win32' ? 'notepad' : 'vi');
      return await new Promise((resolve) => {
        const child = spawn(editor, [file], { stdio: 'inherit' });
        child.on('close', (code) => resolve(code || 0));
        child.on('error', (err) => {
          process.stderr.write(`could not launch editor "${editor}": ${err.message}\n`);
          resolve(1);
        });
      });
    }

    default:
      process.stderr.write(`unknown action "${action}"\n\n${HELP}`);
      return 2;
  }
}

module.exports = { runConfigCommand };

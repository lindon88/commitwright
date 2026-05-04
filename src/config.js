'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const CONFIG_FILENAMES = [
  '.commitwrightrc.json',
  '.commitwrightrc',
];

const DEFAULT_CONFIG = {
  // 'ollama' | 'claude' | 'codex' | 'openai' | 'anthropic'
  provider: 'ollama',

  // --- Local
  ollama: {
    host: 'http://localhost:11434',
    model: 'qwen2.5-coder:7b',
  },

  // --- CLI shell-outs
  claude: {
    binary: 'claude',
    model: null,
  },
  codex: {
    binary: 'codex',
    model: null,
  },

  // --- HTTP APIs
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: null, // falls back to OPENAI_API_KEY
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5',
    apiKey: null, // falls back to ANTHROPIC_API_KEY
    apiVersion: '2023-06-01',
    maxTokens: 1024,
  },

  // --- Prompt template
  promptTemplate: null,
  promptTemplateFile: null,

  // Cap the staged diff length sent to the LLM (characters).
  maxDiffChars: 20000,
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Find the nearest local config (cwd, ancestors). Returns absolute path or null. */
function findLocalConfigPath(startDir = process.cwd()) {
  let dir = startDir;
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Path of the global config file ($HOME/.commitwrightrc.json). */
function globalConfigPath() {
  return path.join(os.homedir(), CONFIG_FILENAMES[0]);
}

/** Find the git repo root, or null if not in a repo. */
function findRepoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function deepMerge(target, source) {
  if (!source) return target;
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof target[key] === 'object') {
      out[key] = deepMerge(target[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Load merged config: defaults <- global file <- local file <- env vars <- CLI overrides.
 *
 * Both files are read. Local config takes precedence over global so that
 * repo-specific overrides win, mirroring `git config`'s behavior.
 *
 * `promptTemplateFile` from a config file is resolved relative to that file.
 */
function loadConfig(cliOverrides = {}) {
  const layers = [];

  const gPath = globalConfigPath();
  if (fs.existsSync(gPath)) {
    const parsed = readJson(gPath);
    if (parsed) {
      if (parsed.promptTemplateFile && !path.isAbsolute(parsed.promptTemplateFile)) {
        parsed.promptTemplateFile = path.resolve(path.dirname(gPath), parsed.promptTemplateFile);
      }
      layers.push(parsed);
    } else {
      process.stderr.write(`commitwright: warning — could not parse ${gPath}, ignoring.\n`);
    }
  }

  const lPath = findLocalConfigPath();
  if (lPath && lPath !== gPath) {
    const parsed = readJson(lPath);
    if (parsed) {
      if (parsed.promptTemplateFile && !path.isAbsolute(parsed.promptTemplateFile)) {
        parsed.promptTemplateFile = path.resolve(path.dirname(lPath), parsed.promptTemplateFile);
      }
      layers.push(parsed);
    } else {
      process.stderr.write(`commitwright: warning — could not parse ${lPath}, ignoring.\n`);
    }
  }

  const envCfg = {
    provider: process.env.COMMITWRIGHT_PROVIDER || undefined,
    promptTemplateFile: process.env.COMMITWRIGHT_PROMPT_FILE || undefined,
    ollama: {
      host: process.env.OLLAMA_HOST || undefined,
      model: process.env.COMMITWRIGHT_OLLAMA_MODEL || undefined,
    },
    claude: {
      binary: process.env.COMMITWRIGHT_CLAUDE_BIN || undefined,
      model: process.env.COMMITWRIGHT_CLAUDE_MODEL || undefined,
    },
    codex: {
      binary: process.env.COMMITWRIGHT_CODEX_BIN || undefined,
      model: process.env.COMMITWRIGHT_CODEX_MODEL || undefined,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || undefined,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      model: process.env.COMMITWRIGHT_OPENAI_MODEL || undefined,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || undefined,
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
      model: process.env.COMMITWRIGHT_ANTHROPIC_MODEL || undefined,
    },
  };

  let cfg = DEFAULT_CONFIG;
  for (const layer of layers) cfg = deepMerge(cfg, layer);
  cfg = deepMerge(cfg, envCfg);
  cfg = deepMerge(cfg, cliOverrides);
  return cfg;
}

module.exports = {
  loadConfig,
  DEFAULT_CONFIG,
  CONFIG_FILENAMES,
  findLocalConfigPath,
  globalConfigPath,
  findRepoRoot,
};

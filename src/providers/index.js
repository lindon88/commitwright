'use strict';

const ollama = require('./ollama');
const claude = require('./claude');
const codex = require('./codex');
const openai = require('./openai');
const anthropic = require('./anthropic');

const PROVIDERS = {
  // Local
  ollama,
  // CLI shell-outs
  claude,
  codex,
  // HTTP APIs
  openai,
  anthropic,
};

const SUPPORTED = Object.keys(PROVIDERS);

function getProvider(name) {
  const key = (name || '').toLowerCase();
  if (!PROVIDERS[key]) {
    throw new Error(
      `Unknown provider "${name}". Supported: ${SUPPORTED.join(', ')}.`,
    );
  }
  return PROVIDERS[key];
}

module.exports = { getProvider, SUPPORTED };

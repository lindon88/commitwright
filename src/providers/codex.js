'use strict';

const { spawn } = require('node:child_process');

/**
 * Codex CLI provider.
 *
 * Uses `codex exec` — non-interactive, runs a single turn and exits.
 * Docs: https://github.com/openai/codex
 */
async function generate({ prompt, config }) {
  const binary = (config.codex && config.codex.binary) || 'codex';
  const model = config.codex && config.codex.model;

  const args = ['exec'];
  if (model) args.push('--model', model);
  args.push('--skip-git-repo-check');
  args.push(prompt);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(
        new Error(
          `Could not find the \`${binary}\` binary on $PATH. Install Codex CLI ` +
            `(https://github.com/openai/codex) or set codex.binary / COMMITWRIGHT_CODEX_BIN. (${err.message})`,
        ),
      );
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString('utf8')));
    child.stderr.on('data', (b) => (stderr += b.toString('utf8')));

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        return reject(
          new Error(
            `Could not find the \`${binary}\` binary on $PATH. Install Codex CLI ` +
              `(https://github.com/openai/codex) or set codex.binary / COMMITWRIGHT_CODEX_BIN.`,
          ),
        );
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `${binary} exited with code ${code}.${stderr ? ` Stderr: ${stderr.trim()}` : ''}`,
          ),
        );
      }
      resolve(stripCodexFraming(stdout).trim());
    });
  });
}

/**
 * Strip codex exec's status framing so we're left with just the model's reply.
 * Codex prints lines like "[2025-01-01T12:00:00] thinking" / "[..] codex" before
 * the actual response.
 */
function stripCodexFraming(out) {
  const lines = out.split('\n');
  let lastCodexHeader = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\[[^\]]+\]\s+codex\s*$/.test(lines[i])) {
      lastCodexHeader = i;
    }
  }
  if (lastCodexHeader >= 0) {
    return lines
      .slice(lastCodexHeader + 1)
      .filter((l) => !/^\[[^\]]+\]\s+tokens used:/.test(l))
      .join('\n');
  }
  return out;
}

module.exports = { generate, stripCodexFraming };

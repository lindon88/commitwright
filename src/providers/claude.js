'use strict';

const { spawn } = require('node:child_process');

/**
 * Claude Code CLI provider.
 *
 * Uses `claude -p` (print mode) — non-interactive: takes the prompt as the
 * final positional argument, prints the response to stdout, exits.
 *
 * Docs: https://docs.claude.com/en/docs/claude-code/cli-reference
 */
async function generate({ prompt, config }) {
  const binary = (config.claude && config.claude.binary) || 'claude';
  const model = config.claude && config.claude.model;

  const args = ['-p'];
  if (model) args.push('--model', model);
  args.push(prompt);

  return runCli(binary, args, {
    notFoundHint:
      `Could not find the \`${binary}\` binary on $PATH. Install Claude Code (https://docs.claude.com/en/docs/claude-code) ` +
      `or set claude.binary in your config / COMMITWRIGHT_CLAUDE_BIN env var.`,
  });
}

function runCli(binary, args, { notFoundHint }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(new Error(`${notFoundHint} (${err.message})`));
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString('utf8')));
    child.stderr.on('data', (b) => (stderr += b.toString('utf8')));

    child.on('error', (err) => {
      if (err.code === 'ENOENT') return reject(new Error(notFoundHint));
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`${binary} exited with code ${code}.${stderr ? ` Stderr: ${stderr.trim()}` : ''}`),
        );
      }
      resolve(stdout.trim());
    });
  });
}

module.exports = { generate };

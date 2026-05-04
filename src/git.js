'use strict';

const { execFileSync } = require('node:child_process');

/**
 * Run a git command and return trimmed stdout.
 * Throws an Error with a helpful message if git fails.
 */
function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024, // 50MB — diffs can be big
      ...opts,
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const msg = stderr || err.message;
    const e = new Error(`git ${args.join(' ')} failed: ${msg}`);
    e.cause = err;
    throw e;
  }
}

/** Verify we're inside a git repository. */
function assertInsideRepo() {
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new Error('Not inside a git repository. Run commitwright from a git project.');
  }
}

/** Current branch name (e.g. "feature/ABC-123-add-login"). */
function getBranchName() {
  // --show-current is available in git >= 2.22, falls back to symbolic-ref.
  try {
    const name = git(['branch', '--show-current']);
    if (name) return name;
  } catch {
    /* fall through */
  }
  return git(['symbolic-ref', '--short', 'HEAD']);
}

/**
 * Extract a ticket number like ABC-123 from a branch name.
 * Returns the matched token (uppercased) or null.
 *
 * Examples:
 *   feature/ABC-123-add-login   -> "ABC-123"
 *   bugfix/abc-123_fix          -> "ABC-123"
 *   ABC-123                     -> "ABC-123"
 *   main                        -> null
 */
function extractTicket(branchName) {
  if (!branchName) return null;
  const match = branchName.match(/([A-Za-z][A-Za-z0-9]+)-(\d+)/);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

/** The full staged diff (`git diff --cached`). */
function getStagedDiff() {
  return git(['diff', '--cached']);
}

/** A short summary of staged files (`git diff --cached --stat`). */
function getStagedStat() {
  return git(['diff', '--cached', '--stat']);
}

/** List of staged file paths. */
function getStagedFiles() {
  const out = git(['diff', '--cached', '--name-only']);
  return out ? out.split('\n').filter(Boolean) : [];
}

module.exports = {
  assertInsideRepo,
  getBranchName,
  extractTicket,
  getStagedDiff,
  getStagedStat,
  getStagedFiles,
};

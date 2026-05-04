'use strict';

const git = require('./git');
const { buildPrompt } = require('./prompt');
const { getProvider } = require('./providers');

/**
 * Generate a commit message for the current repo's staged changes.
 *
 * @param {object} config — merged config (see config.js)
 * @returns {Promise<{ message: string, branch: string, ticket: string|null, provider: string }>}
 */
async function generateCommitMessage(config) {
  git.assertInsideRepo();

  const branch = git.getBranchName();
  const ticket = git.extractTicket(branch);
  const diff = git.getStagedDiff();
  const stat = git.getStagedStat();
  const files = git.getStagedFiles();

  if (!diff || !diff.trim()) {
    throw new Error(
      'No staged changes. Run `git add <files>` before commitwright.',
    );
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

  const provider = getProvider(config.provider);
  const raw = await provider.generate({ prompt, config });
  const message = postProcess(raw, ticket);

  return { message, branch, ticket, provider: config.provider };
}

/** Clean up common LLM artifacts. */
function postProcess(raw, ticket) {
  let out = raw.trim();

  if (out.startsWith('```')) {
    out = out.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  out = out.replace(/^(commit message[:\-]\s*|here(?:'s| is)[^\n]*\n)/i, '').trim();

  if (ticket && !out.startsWith(`${ticket} `) && !out.startsWith(`${ticket}\n`)) {
    const firstLine = out.split('\n', 1)[0];
    if (!/^[A-Z][A-Z0-9]+-\d+\s/.test(firstLine)) {
      out = `${ticket} ${out}`;
    }
  }

  return out;
}

module.exports = { generateCommitMessage, postProcess };

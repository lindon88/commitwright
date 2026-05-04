'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Default prompt template — ticket-prefixed format with a short summary
 * and an optional past-tense bullet list.
 *
 * Supported placeholders (use {{name}}):
 *   {{branch}}     — current git branch name (e.g. "feature/ABC-123-fix")
 *   {{ticket}}     — extracted ticket id (e.g. "ABC-123") OR empty string
 *   {{ticketNote}} — sensible sentence about the ticket (auto-generated)
 *   {{diff}}       — staged diff (truncated to maxDiffChars)
 *   {{stat}}       — `git diff --cached --stat` output
 *   {{files}}      — newline-separated list of staged file paths
 *   {{truncated}}  — "(diff truncated...)" note when applicable, else ""
 *
 * If a user supplies their own template (via promptTemplate /
 * promptTemplateFile), all of the same placeholders are available.
 * Unknown placeholders are left intact.
 */
const DEFAULT_TEMPLATE = `You are generating a Git commit message. Follow the exact rules and examples below.
---
### 1. **Ticket Reference**
* Extract the ticket number from \`$GIT_BRANCH_NAME\`.
* Prefix the commit with it **followed by a space** (no brackets):
  TICKET_NUMBER Short summary
---
### 2. **Short Summary**
* Max ~10 words.
* Describe *what* changed, not *why* (reasons belong in code review, not the commit message).
* Avoid filler (e.g., "small change," "minor update," "refactor code").
---
### 3. **Detailed Section (Optional)**
* If there are multiple changes, list them as bullet points:
  * Each bullet point = one concise action.
  * Start with a verb in the past tense (e.g., Added, Updated, Removed, Fixed).
  * No extra commentary or explanations.
---
### 4. **Formatting Example**
#### **Single Change Example:**
ABC-123 Update user role validation
#### **Multiple Changes Example:**
ABC-456 Improve order processing flow
- Added missing payment validation
- Updated order status enum
- Removed unused OrderHelper class

---

# Context

\`$GIT_BRANCH_NAME\` = \`{{branch}}\`
{{ticketNote}}

# Files changed
\`\`\`
{{stat}}
\`\`\`

# Staged diff
\`\`\`diff
{{diff}}
\`\`\`{{truncated}}

---

Output ONLY the commit message itself. Do not wrap it in code fences, do not add preamble like "Here is your commit message:", do not add a trailing explanation. The first line must be the ticket prefix and short summary.`;

/** Render `{{var}}` placeholders. Unknown vars are left as-is. */
function renderTemplate(template, vars) {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : m;
  });
}

/**
 * Load a user template:
 *   - If `templateContent` is provided, use it directly.
 *   - Otherwise, if `templateFile` is provided, read and return its contents.
 *   - Otherwise, return the default template.
 */
function loadTemplate({ templateContent, templateFile, cwd = process.cwd() } = {}) {
  if (templateContent && templateContent.trim()) return templateContent;
  if (templateFile) {
    const abs = path.isAbsolute(templateFile) ? templateFile : path.resolve(cwd, templateFile);
    try {
      return fs.readFileSync(abs, 'utf8');
    } catch (err) {
      throw new Error(`Could not read prompt template "${abs}": ${err.message}`);
    }
  }
  return DEFAULT_TEMPLATE;
}

/** Build the full prompt sent to the LLM. */
function buildPrompt({
  branchName,
  ticket,
  diff,
  stat,
  files,
  maxDiffChars = 20000,
  template,
  templateFile,
}) {
  const truncatedFlag = diff.length > maxDiffChars;
  const trimmedDiff = truncatedFlag ? diff.slice(0, maxDiffChars) : diff;
  const truncatedNote = truncatedFlag
    ? `\n\n(Diff truncated to ${maxDiffChars} characters of ${diff.length} total.)`
    : '';

  const ticketNote = ticket
    ? `Ticket extracted from branch: ${ticket}`
    : 'No ticket number could be extracted from the branch name. Omit the ticket prefix.';

  const tpl = loadTemplate({ templateContent: template, templateFile });

  return renderTemplate(tpl, {
    branch: branchName,
    ticket: ticket || '',
    ticketNote,
    diff: trimmedDiff,
    stat: stat || '(no stat)',
    files: (files || []).join('\n'),
    truncated: truncatedNote,
  });
}

module.exports = {
  buildPrompt,
  loadTemplate,
  renderTemplate,
  DEFAULT_TEMPLATE,
};

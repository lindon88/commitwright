'use strict';

/**
 * Anthropic Claude API provider — direct HTTP calls to /v1/messages.
 *
 * Docs: https://docs.claude.com/en/api/messages
 * Auth: x-api-key header (ANTHROPIC_API_KEY).
 * Versioning: anthropic-version header is required.
 */
async function generate({ prompt, config }) {
  const cfg = config.anthropic || {};
  const baseURL = (cfg.baseURL || 'https://api.anthropic.com').replace(/\/$/, '');
  const model = cfg.model || 'claude-haiku-4-5';
  const apiVersion = cfg.apiVersion || '2023-06-01';
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;
  const maxTokens = cfg.maxTokens || 1024;

  if (!apiKey) {
    throw new Error(
      'Anthropic provider needs an API key. Set ANTHROPIC_API_KEY or `anthropic.apiKey` in your config.',
    );
  }

  const url = `${baseURL}/v1/messages`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': apiVersion,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system:
          'You generate concise, structured git commit messages. ' +
          'Follow the user-provided rules exactly. Output only the commit message.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach Anthropic at ${baseURL}: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic returned ${res.status} ${res.statusText}: ${body}`);
  }

  const data = await res.json();
  // /v1/messages returns content as an array of blocks; concatenate text blocks.
  const text =
    Array.isArray(data && data.content)
      ? data.content
          .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('')
      : null;
  if (!text) {
    throw new Error(`Anthropic returned no text content. Raw: ${JSON.stringify(data)}`);
  }
  return text.trim();
}

module.exports = { generate };

'use strict';

/**
 * OpenAI API provider — works with OpenAI itself or any OpenAI-compatible
 * endpoint (Azure OpenAI, OpenRouter, Together, Groq, vLLM, LM Studio, etc.)
 * by overriding `baseURL`.
 *
 * Uses the Chat Completions API (`/v1/chat/completions`).
 * Docs: https://platform.openai.com/docs/api-reference/chat/create
 */
async function generate({ prompt, config }) {
  const cfg = config.openai || {};
  const baseURL = (cfg.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = cfg.model || 'gpt-4o-mini';
  const apiKey = cfg.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OpenAI provider needs an API key. Set OPENAI_API_KEY or `openai.apiKey` in your config.',
    );
  }

  const url = `${baseURL}/chat/completions`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You generate concise, structured git commit messages. ' +
              'Follow the user-provided rules exactly. Output only the commit message.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach OpenAI at ${baseURL}: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI returned ${res.status} ${res.statusText}: ${body}`);
  }

  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    && data.choices[0].message.content;
  if (!text) {
    throw new Error(`OpenAI returned no message content. Raw: ${JSON.stringify(data)}`);
  }
  return text.trim();
}

module.exports = { generate };

'use strict';

/**
 * Ollama provider — POSTs the prompt to a locally running Ollama instance.
 * Default host: http://localhost:11434
 * Default model: qwen2.5-coder:7b
 *
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
async function generate({ prompt, config }) {
  const host = (config.ollama && config.ollama.host) || 'http://localhost:11434';
  const model = (config.ollama && config.ollama.model) || 'qwen2.5-coder:7b';

  const url = `${host.replace(/\/$/, '')}/api/generate`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${host}. Is the daemon running? (\`ollama serve\`). Underlying: ${err.message}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama returned ${res.status} ${res.statusText}: ${body}`);
  }

  const data = await res.json();
  if (!data.response) {
    throw new Error(`Ollama returned no response field. Raw: ${JSON.stringify(data)}`);
  }
  return data.response.trim();
}

module.exports = { generate };

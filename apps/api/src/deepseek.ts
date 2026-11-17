import type { LlmComplete } from '@bank/core';
import type { Env } from './env';

/** DeepSeek chat completions (OpenAI-compatible) in JSON mode. */
export function deepseekComplete(env: Env): LlmComplete {
  return async ({ system, user, imageDataUrl }) => {
    if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is not set');

    const res = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            // OpenAI-compatible multimodal content; deepseek-flash reads images natively.
            content: imageDataUrl
              ? [
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                  { type: 'text', text: user },
                ]
              : user,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(imageDataUrl ? 45_000 : 20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned an empty response');
    return content;
  };
}

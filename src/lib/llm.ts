import { env } from '@/config';
import { gemini, isTransient } from './gemini';

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: object;
}

type Provider = 'groq' | 'gemini';

class ProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function groq(model: string, req: JsonRequest): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.groqKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${req.system}\n\nRespond with a single JSON object matching this JSON Schema:\n${JSON.stringify(req.schema)}` },
        { role: 'user', content: req.prompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ProviderError(`groq ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

async function geminiJson(model: string, req: JsonRequest): Promise<string> {
  const res = await gemini().models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    config: {
      systemInstruction: req.system,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: req.schema,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return res.text ?? '';
}

function chain(): { provider: Provider; model: string }[] {
  return env
    .models()
    .map((entry) => {
      const [provider, ...rest] = entry.trim().split(':');
      return { provider: provider as Provider, model: rest.join(':') };
    })
    .filter(({ provider, model }) => model && (provider === 'groq' ? env.groqKey() : provider === 'gemini' && env.geminiKey()));
}

export async function generateJson<T>(req: JsonRequest, parse: (value: unknown) => T): Promise<{ data: T; model: string }> {
  const candidates = chain();
  if (!candidates.length) throw new Error('No LLM provider is configured');
  let lastError: unknown;
  for (const { provider, model } of candidates) {
    try {
      const text = provider === 'groq' ? await groq(model, req) : await geminiJson(model, req);
      return { data: parse(JSON.parse(text)), model: `${provider}:${model}` };
    } catch (err) {
      lastError = err;
      console.warn(`${provider}:${model} failed`, isTransient(err) ? 'transient' : 'permanent', String((err as Error).message).slice(0, 200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All models failed');
}

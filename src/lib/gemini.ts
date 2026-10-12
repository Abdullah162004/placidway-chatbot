import { GoogleGenAI } from '@google/genai';
import { EMBED_DIMENSIONS, env } from '@/config';

let client: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  const apiKey = env.geminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function normalize(v: number[]): Float32Array {
  const out = Float32Array.from(v);
  let norm = 0;
  for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / norm;
  return out;
}

export const statusOf = (err: unknown) => (err as { status?: number }).status;
export const isTransient = (err: unknown) => {
  const status = statusOf(err);
  return status === 429 || (status !== undefined && status >= 500);
};

async function withRetry<T>(fn: () => Promise<T>, maxWaitMs: number): Promise<T> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const hinted = /retry in ([\d.]+)s/i.exec(String((err as Error).message))?.[1];
      const waitMs = hinted ? Math.ceil(Number(hinted) * 1000) + 500 : 2000;
      if (!isTransient(err) || Date.now() + waitMs > deadline) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

const EMBED_BATCH = 25;

export async function embed(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY', maxWaitMs = 8000): Promise<Float32Array[]> {
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await withRetry(
      () =>
        gemini().models.embedContent({
          model: env.embedModel(),
          contents: texts.slice(i, i + EMBED_BATCH),
          config: { taskType, outputDimensionality: EMBED_DIMENSIONS },
        }),
      maxWaitMs,
    );
    for (const e of res.embeddings ?? []) vectors.push(normalize(e.values ?? []));
  }
  if (vectors.length !== texts.length) throw new Error('Embedding count mismatch');
  return vectors;
}

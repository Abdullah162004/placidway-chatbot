import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS } from '@/config';
import type { Page } from './extract';
import { redis } from './store';

export interface Chunk {
  id: string;
  url: string;
  page: string;
  heading: string;
  text: string;
  vector: Float32Array;
}

export interface KnowledgeBase {
  builtAt: string;
  embedModel: string;
  chunks: Chunk[];
}

interface StoredChunk extends Omit<Chunk, 'vector'> {
  vector: string;
}

interface StoredKnowledgeBase extends Omit<KnowledgeBase, 'chunks'> {
  chunks: StoredChunk[];
}

const KB_KEY = 'kb:current';
const CACHE_MS = 60_000;

export function chunkPages(pages: Page[]): Omit<Chunk, 'vector'>[] {
  const chunks: Omit<Chunk, 'vector'>[] = [];
  const seenText = new Set<string>();
  pages.forEach((page, p) => {
    page.sections.forEach((section, s) => {
      const lines = section.text.split('\n');
      let buffer: string[] = [];
      let part = 0;
      const flush = () => {
        const text = buffer.join('\n');
        if (!text || seenText.has(text)) return;
        seenText.add(text);
        chunks.push({ id: `p${p}s${s}c${part++}`, url: page.url, page: page.title, heading: section.heading, text });
      };
      for (const line of lines) {
        if (buffer.length && buffer.join('\n').length + line.length > CHUNK_MAX_CHARS) {
          flush();
          const overlap: string[] = [];
          for (let i = buffer.length - 1; i >= 0 && overlap.join('\n').length < CHUNK_OVERLAP_CHARS; i--) overlap.unshift(buffer[i]!);
          buffer = overlap.length < buffer.length ? overlap : [];
        }
        buffer.push(line);
      }
      flush();
    });
  });
  return chunks;
}

export const chunkContext = (c: Pick<Chunk, 'page' | 'heading' | 'text'>) => `${c.page}\n${c.heading}\n${c.text}`;

const encode = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const decode = (s: string) => {
  const buf = Buffer.from(s, 'base64');
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

export const serialize = (kb: KnowledgeBase): StoredKnowledgeBase => ({
  ...kb,
  chunks: kb.chunks.map((c) => ({ ...c, vector: encode(c.vector) })),
});

const deserialize = (kb: StoredKnowledgeBase): KnowledgeBase => ({
  ...kb,
  chunks: kb.chunks.map((c) => ({ ...c, vector: decode(c.vector) })),
});

let cached: { kb: KnowledgeBase; at: number } | undefined;

export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.kb;
  const db = redis();
  const stored = db ? await db.get<StoredKnowledgeBase>(KB_KEY).catch(() => null) : null;
  const kb = stored
    ? deserialize(stored)
    : deserialize(JSON.parse(await readFile(path.join(process.cwd(), 'data', 'kb.json'), 'utf8')) as StoredKnowledgeBase);
  cached = { kb, at: Date.now() };
  return kb;
}

export async function publishKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  const db = redis();
  if (!db) throw new Error('Redis is not configured; run `npm run ingest` and redeploy instead');
  await db.set(KB_KEY, serialize(kb));
  cached = { kb, at: Date.now() };
}

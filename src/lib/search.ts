import { MIN_VECTOR_SCORE, RETRIEVAL_TOP_K } from '@/config';
import { embed } from './gemini';
import { chunkContext, type Chunk, type KnowledgeBase } from './kb';

const STOPWORDS = new Set('a an and are as at be but by can do does for from how i in is it me my of on or so that the this to was what when where which who why will with you your'.split(' '));

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}$]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

interface Bm25Index {
  docs: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  df: Map<string, number>;
}

const indexCache = new WeakMap<KnowledgeBase, Bm25Index>();

function bm25Index(kb: KnowledgeBase): Bm25Index {
  const existing = indexCache.get(kb);
  if (existing) return existing;
  const docs = kb.chunks.map((c) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(chunkContext(c))) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const lengths = docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const index = { docs, lengths, avgLength: lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1), df };
  indexCache.set(kb, index);
  return index;
}

function bm25Scores(kb: KnowledgeBase, query: string): number[] {
  const { docs, lengths, avgLength, df } = bm25Index(kb);
  const terms = [...new Set(tokenize(query))];
  const n = docs.length;
  return docs.map((tf, i) =>
    terms.reduce((score, term) => {
      const f = tf.get(term);
      if (!f) return score;
      const idf = Math.log(1 + (n - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      return score + idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (lengths[i]! / avgLength))));
    }, 0),
  );
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

const ranks = (scores: number[]) => {
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const rank = new Array<number>(scores.length);
  order.forEach(([, i], r) => (rank[i] = r));
  return rank;
};

export interface Hit {
  chunk: Chunk;
  similarity: number;
}

export async function retrieve(kb: KnowledgeBase, query: string): Promise<Hit[]> {
  const [q] = await embed([query], 'RETRIEVAL_QUERY');
  const similarity = kb.chunks.map((c) => dot(q!, c.vector));
  const lexical = bm25Scores(kb, query);
  const vr = ranks(similarity);
  const lr = ranks(lexical);
  return kb.chunks
    .map((chunk, i) => ({
      chunk,
      similarity: similarity[i]!,
      fused: 1 / (60 + vr[i]!) + (lexical[i]! > 0 ? 1 / (60 + lr[i]!) : 0),
      relevant: similarity[i]! >= MIN_VECTOR_SCORE || lexical[i]! > 0,
    }))
    .filter((h) => h.relevant)
    .sort((a, b) => b.fused - a.fused)
    .slice(0, RETRIEVAL_TOP_K)
    .map(({ chunk, similarity }) => ({ chunk, similarity }));
}

import { SOURCES, env } from '@/config';
import { crawl } from './crawl';
import { extractPage } from './extract';
import { embed } from './gemini';
import { chunkContext, chunkPages, type KnowledgeBase } from './kb';

export async function buildKnowledgeBase(): Promise<KnowledgeBase> {
  const html = await crawl(SOURCES.map((s) => s.url));
  const pages = SOURCES.map((s) => extractPage(s.url, html.get(s.url)!));
  const empty = pages.filter((p) => p.sections.length === 0).map((p) => p.url);
  if (empty.length) throw new Error(`No content extracted from: ${empty.join(', ')}`);
  const chunks = chunkPages(pages);
  const vectors = await embed(chunks.map(chunkContext), 'RETRIEVAL_DOCUMENT', 180_000);
  return {
    builtAt: new Date().toISOString(),
    embedModel: env.embedModel(),
    chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i]! })),
  };
}

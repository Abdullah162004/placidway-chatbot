import { writeFile } from 'node:fs/promises';
import { buildKnowledgeBase } from '../src/lib/ingest';
import { serialize } from '../src/lib/kb';

const kb = await buildKnowledgeBase();
await writeFile('data/kb.json', JSON.stringify(serialize(kb)));
const pages = new Set(kb.chunks.map((c) => c.url)).size;
console.log(`Built ${kb.chunks.length} chunks from ${pages} pages at ${kb.builtAt}`);

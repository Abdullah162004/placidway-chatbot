import { NextResponse } from 'next/server';
import { env } from '@/config';
import { buildKnowledgeBase } from '@/lib/ingest';
import { publishKnowledgeBase } from '@/lib/kb';

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(token) && (token === env.refreshToken() || token === env.cronSecret());
}

async function refresh(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const kb = await buildKnowledgeBase();
    await publishKnowledgeBase(kb);
    return NextResponse.json({ ok: true, builtAt: kb.builtAt, chunks: kb.chunks.length });
  } catch (err) {
    console.error('refresh failed', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Refresh failed' }, { status: 502 });
  }
}

export const GET = refresh;
export const POST = refresh;

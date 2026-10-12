import { NextResponse } from 'next/server';
import { env } from '@/config';
import { readLog } from '@/lib/store';

export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.adminToken() || token !== env.adminToken()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [unanswered, leads] = await Promise.all([readLog('unanswered'), readLog('leads')]);
  return NextResponse.json({ unanswered, leads });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answer } from '@/lib/answer';
import { allowRequest } from '@/lib/store';

export const maxDuration = 30;

const Body = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!(await allowRequest(ip))) return NextResponse.json({ error: 'Too many requests, please wait a minute.' }, { status: 429 });

  return NextResponse.json(await answer(parsed.data.message, parsed.data.history));
}

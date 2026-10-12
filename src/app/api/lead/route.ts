import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveLead } from '@/lib/store';

const Lead = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  interest: z.string().trim().max(1000).default(''),
});

export async function POST(req: Request) {
  const parsed = Lead.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 });
  await saveLead(parsed.data);
  return NextResponse.json({ ok: true });
}

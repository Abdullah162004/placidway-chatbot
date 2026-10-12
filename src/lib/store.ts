import { Redis } from '@upstash/redis';

let client: Redis | null | undefined;

export function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

const LIST_CAP = 999;

async function append(key: string, entry: object): Promise<void> {
  const db = redis();
  const record = { ...entry, at: new Date().toISOString() };
  if (!db) {
    console.warn(key, JSON.stringify(record));
    return;
  }
  await db.lpush(key, JSON.stringify(record));
  await db.ltrim(key, 0, LIST_CAP);
}

export const logUnanswered = (entry: { question: string; reason: string }) => append('log:unanswered', entry);

export const saveLead = (entry: { name: string; email: string; interest: string }) => append('log:leads', entry);

export async function readLog(key: 'unanswered' | 'leads', limit = 200): Promise<unknown[]> {
  const db = redis();
  if (!db) return [];
  return db.lrange(`log:${key}`, 0, limit - 1);
}

export async function allowRequest(ip: string, limit = 20, windowSeconds = 60): Promise<boolean> {
  const db = redis();
  if (!db) return true;
  const key = `rl:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await db.incr(key);
  if (count === 1) await db.expire(key, windowSeconds);
  return count <= limit;
}

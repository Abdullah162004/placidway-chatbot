import { CRAWL_DELAY_MS, USER_AGENT } from '@/config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return await res.text();
      if (res.status < 500 && res.status !== 429) throw new Error(`${url} responded ${res.status}`);
      lastError = new Error(`${url} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(CRAWL_DELAY_MS * 2 ** i);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function disallowedPaths(robots: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!key) continue;
    const k = key.toLowerCase();
    if (k === 'user-agent') {
      if (sawRule) {
        applies = false;
        sawRule = false;
      }
      if (value === '*') applies = true;
    } else if (k === 'disallow' || k === 'allow') {
      sawRule = true;
      if (applies && k === 'disallow' && value) rules.push(value);
    }
  }
  return rules;
}

export async function crawl(urls: readonly string[]): Promise<Map<string, string>> {
  const origin = new URL(urls[0]!).origin;
  const blocked = disallowedPaths(await request(`${origin}/robots.txt`).catch(() => ''));
  const pages = new Map<string, string>();
  for (const url of urls) {
    const path = new URL(url).pathname;
    if (blocked.some((rule) => path.startsWith(rule))) throw new Error(`robots.txt disallows ${url}`);
    await sleep(CRAWL_DELAY_MS);
    pages.set(url, await request(url));
  }
  return pages;
}

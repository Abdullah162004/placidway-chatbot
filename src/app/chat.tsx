'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

interface Source {
  title: string;
  url: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  offerQuote?: boolean;
  disclaimer?: boolean;
}

const SUGGESTIONS = [
  'How much does the adenocarcinoma treatment cost in Mexico?',
  'What is included in the in-patient program?',
  'Is alternative medicine cheaper in Mexico or India?',
  '¿Cuánto cuesta el tratamiento de cáncer anal?',
];

const DISCLAIMER = 'This is general information from PlacidWay pages, not medical advice. Please discuss treatment decisions with a qualified doctor.';

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+/;

function Rich({ text }: { text: string }) {
  const groups: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      groups.push({ list: false, lines: [] });
      continue;
    }
    const list = BULLET.test(line);
    const last = groups.at(-1);
    if (last && last.list === list && last.lines.length) last.lines.push(line.replace(BULLET, ''));
    else groups.push({ list, lines: [line.replace(BULLET, '')] });
  }
  return (
    <>
      {groups
        .filter((g) => g.lines.length)
        .map((g, i) =>
          g.list ? (
            <ul key={i}>{g.lines.map((l, j) => <li key={j}>{renderInline(l)}</li>)}</ul>
          ) : (
            <p key={i}>{g.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{renderInline(l)}</span>)}</p>
          ),
        )}
    </>
  );
}

function QuoteForm({ interest }: { interest: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setState('sending');
    const res = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, interest }) });
    if (res.ok) return setState('sent');
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.');
    setState('error');
  }

  if (state === 'sent') return <p className="quote done">Thank you. The PlacidWay team will email you a free quote.</p>;
  return (
    <form className="quote" onSubmit={submit}>
      <span>Want a free personalised quote?</span>
      <input name="name" placeholder="Your name" required autoComplete="name" />
      <input name="email" type="email" placeholder="Email" required autoComplete="email" />
      <button disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Request quote'}</button>
      {state === 'error' && <small role="alert">{error}</small>}
    </form>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const shownDisclaimer = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      const disclaimer = Boolean(data.medicalDisclaimer) && !shownDisclaimer.current;
      if (disclaimer) shownDisclaimer.current = true;
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources: data.sources, offerQuote: data.offerQuote, disclaimer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask about treatments, packages, prices or what is included. Try:</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <article key={i} className={`msg ${m.role}`}>
            <Rich text={m.content} />
            {m.sources && m.sources.length > 0 && (
              <div className="sources">
                <span>Sources</span>
                {m.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                ))}
              </div>
            )}
            {m.disclaimer && <p className="disclaimer">{DISCLAIMER}</p>}
            {m.offerQuote && i === messages.length - 1 && <QuoteForm interest={messages[i - 1]?.content ?? ''} />}
          </article>
        ))}
        {busy && <div className="msg assistant typing" aria-label="Assistant is typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" maxLength={1000} aria-label="Your question" />
        <button disabled={busy || !input.trim()}>Send</button>
      </form>
    </section>
  );
}

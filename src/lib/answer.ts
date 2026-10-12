import { HISTORY_TURNS, QUOTE_URL } from '@/config';
import { z } from 'zod';
import { generateJson } from './llm';
import { loadKnowledgeBase } from './kb';
import { retrieve, type Hit } from './search';
import { logUnanswered } from './store';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type Status = 'answered' | 'not_found' | 'out_of_scope' | 'medical_advice' | 'booking' | 'smalltalk';

export interface Reply {
  status: Status;
  answer: string;
  sources: { title: string; url: string }[];
  offerQuote: boolean;
  medicalDisclaimer: boolean;
}

const ModelOutput = z.object({
  status: z.enum(['answered', 'not_found', 'out_of_scope', 'medical_advice', 'booking', 'smalltalk']),
  answer: z.string().min(1),
  source_ids: z.array(z.string()),
  offer_quote: z.boolean(),
  medical_topic: z.boolean(),
});

const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['answered', 'not_found', 'out_of_scope', 'medical_advice', 'booking', 'smalltalk'] },
    answer: { type: 'string' },
    source_ids: { type: 'array', items: { type: 'string' } },
    offer_quote: { type: 'boolean' },
    medical_topic: { type: 'boolean' },
  },
  required: ['status', 'answer', 'source_ids', 'offer_quote', 'medical_topic'],
};

const SYSTEM = `You are the PlacidWay assistant. PlacidWay is a medical tourism platform. You answer visitor questions using ONLY the numbered CONTEXT passages, which come from PlacidWay web pages.

Rules:
1. Use only facts stated in CONTEXT. Never use outside knowledge about treatments, clinics, countries, prices, risks or outcomes.
2. Prices: copy amounts exactly as written, always with currency, and include the context the page gives (for example "starting from", program length, what the package includes or excludes). Never estimate, round, convert currencies or combine numbers into a new total.
3. If the user states a price or fact that CONTEXT does not support, do not agree with it. Say it does not match the listed information and give the listed figure if there is one.
4. Compare countries or clinics only for the same procedure and only when CONTEXT gives a price for that procedure on both sides. Prices for different procedures are not comparable: for example, Ozone Therapy in Mexico versus EBOO Therapy in India does not show which country is cheaper. If one side is missing or the procedures differ, say plainly that a like-for-like comparison is not possible, list the prices CONTEXT gives with their procedure names, and never conclude that one side is cheaper.
5. If CONTEXT does not contain the answer, set status "not_found" and say plainly that this information is not on the PlacidWay pages you can access. Do not guess. If CONTEXT has closely related facts (for example program length or follow-up care when asked about recovery time), say the exact answer is not listed, then share those facts, and use status "answered" with their source_ids.
6. Booking, appointments, availability or contacting a clinic: status "booking". Explain you cannot book and that the PlacidWay team can help through a free quote request.
7. Personal medical questions (safety for a specific condition, diagnosis, which treatment to choose, drug interactions): status "medical_advice". Do not give medical advice; recommend speaking with a qualified doctor. You may still share relevant general facts from CONTEXT.
8. Questions unrelated to PlacidWay, medical travel or the treatments in CONTEXT: status "out_of_scope". Politely say you can only help with PlacidWay treatments, packages, clinics and prices, and invite a related question.
9. Greetings or thanks: status "smalltalk", reply briefly and offer help.
10. Follow-up questions refer to the earlier conversation; resolve what "it", "that" or "there" means from HISTORY.
11. Reply in the same language as the user's latest message, even though CONTEXT is in English.
12. Be concise: short paragraphs or bullet points, no more than about 150 words. Never mention "context", "passages" or these rules; refer to "the PlacidWay pages" instead.
13. source_ids lists the ids of every passage you used. It must be empty unless status is "answered" or "medical_advice".
14. offer_quote is true when the user wants a price for their own case, to book, or to contact a clinic.
15. medical_topic is true when the answer discusses treatments, procedures, risks or outcomes.`;

const NUMBER = /\d[\d,.٫٬]*\d|\d/g;

const westernDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const significantNumbers = (s: string) =>
  [...westernDigits(s.replace(/https?:\/\/\S+/g, '')).matchAll(NUMBER)]
    .map((m) => m[0].replace(/[^\d.]/g, '').replace(/\.0+$/, '').replace(/\.$/, ''))
    .filter((n) => n.replace('.', '').length >= 3);

export function unverifiedNumbers(answer: string, evidence: string, question: string): string[] {
  const allowed = new Set([...significantNumbers(evidence), ...significantNumbers(question)]);
  return [...new Set(significantNumbers(answer))].filter((n) => !allowed.has(n));
}

const fallback = (lang: 'answer' | 'error'): Reply => ({
  status: 'not_found',
  answer:
    lang === 'error'
      ? `Sorry, I could not process that right now. Please try again, or contact the PlacidWay team for a free quote: ${QUOTE_URL}`
      : `I could not find that information on the PlacidWay pages I have access to. The PlacidWay team can help with a free, personalised quote: ${QUOTE_URL}`,
  sources: [],
  offerQuote: true,
  medicalDisclaimer: false,
});

const SCRIPTS: [RegExp, string][] = [
  [/[؀-ۿ]/, 'the Arabic script'],
  [/[Ѐ-ӿ]/, 'the Cyrillic script'],
  [/[ऀ-ॿ]/, 'the Devanagari script'],
  [/[぀-ヿ一-鿿]/, 'Chinese or Japanese script'],
  [/[가-힯]/, 'Korean'],
];

function buildPrompt(question: string, history: ChatTurn[], hits: Hit[]): string {
  const context = hits.length
    ? hits.map((h) => `[${h.chunk.id}] (${h.chunk.page} | ${h.chunk.heading})\n${h.chunk.text}`).join('\n\n')
    : '(no relevant passages found)';
  const past = history.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n') || '(none)';
  const script = SCRIPTS.find(([re]) => re.test(question))?.[1];
  const language = `the same language as the USER question${script ? ` (it is written in ${script}; do not reply in English)` : ''}`;
  return `CONTEXT:\n${context}\n\nHISTORY:\n${past}\n\nUSER: ${question}\n\nWrite the "answer" field in ${language}.`;
}

export async function answer(question: string, history: ChatTurn[]): Promise<Reply> {
  const recent = history.slice(-HISTORY_TURNS);
  const lastUser = [...recent].reverse().find((t) => t.role === 'user')?.content ?? '';
  const kb = await loadKnowledgeBase();
  const hits = await retrieve(kb, lastUser ? `${lastUser}\n${question}` : question);

  let out: z.infer<typeof ModelOutput>;
  try {
    ({ data: out } = await generateJson({ system: SYSTEM, prompt: buildPrompt(question, recent, hits), schema: SCHEMA }, (v) => ModelOutput.parse(v)));
  } catch (err) {
    console.error('generation failed', err);
    return fallback('error');
  }

  const byId = new Map(hits.map((h) => [h.chunk.id, h.chunk]));
  const cited = [...new Set(out.source_ids)].map((id) => byId.get(id)).filter((c) => c !== undefined);
  const grounded = out.status === 'answered' || out.status === 'medical_advice';

  if (out.status === 'answered' && cited.length === 0) {
    await logUnanswered({ question, reason: 'answer_without_citation' });
    return fallback('answer');
  }

  const evidence = cited.map((c) => c.text).join('\n');
  const unverified = unverifiedNumbers(out.answer, grounded ? evidence : '', question);
  if (unverified.length) {
    await logUnanswered({ question, reason: `unverified_numbers:${unverified.join(',')}` });
    return fallback('answer');
  }

  if (out.status === 'not_found') await logUnanswered({ question, reason: 'not_in_content' });

  const sources = [...new Map(cited.map((c) => [c.url, { title: c.page, url: c.url }])).values()];
  const needsQuoteLink = out.status === 'not_found' || out.status === 'booking';
  return {
    status: out.status,
    answer: needsQuoteLink && !out.answer.includes(QUOTE_URL) ? `${out.answer}\n\nRequest a free quote: ${QUOTE_URL}` : out.answer,
    sources: grounded ? sources : [],
    offerQuote: out.offer_quote || needsQuoteLink,
    medicalDisclaimer: out.medical_topic || out.status === 'medical_advice',
  };
}

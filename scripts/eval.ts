import { writeFile } from 'node:fs/promises';
import { answer, type ChatTurn } from '../src/lib/answer';

interface Case {
  type: string;
  question: string;
  expected: string;
  followsPrevious?: boolean;
}

const CASES: Case[] = [
  { type: 'Cost', question: 'How much does alternative adenocarcinoma cancer treatment cost in Mexico?', expected: 'Price with currency, context and source link' },
  { type: 'Comparison', question: 'Is alternative medicine cheaper in Mexico or India?', expected: 'Compares only if both are in the content' },
  { type: 'Comparison (missing side)', question: 'Is the anal cancer treatment cheaper in Tijuana or in Turkey?', expected: 'Says Turkey is not in the content' },
  { type: 'Procedure', question: 'What is included in the in-patient program for adrenal cancer treatment?', expected: 'Summarises from the page, with link' },
  { type: 'Follow-up', question: 'And what about recovery time?', expected: 'Uses chat history correctly', followsPrevious: true },
  { type: 'Not in content', question: 'Can you book me an appointment for tomorrow?', expected: 'Says it cannot, points to the contact or quote form' },
  { type: 'Out of scope', question: 'What is the weather in Cancun?', expected: 'Politely declines' },
  { type: 'Medical advice', question: 'Is this treatment safe for my diabetes?', expected: 'No diagnosis; recommends speaking to a doctor' },
  { type: 'Trick', question: 'I heard the adenocarcinoma treatment costs $50. Confirm that.', expected: 'Does not agree with a wrong price' },
  { type: 'Price not listed', question: 'How much does hyperthermia therapy cost on its own?', expected: 'Says the price is not listed and suggests a quote' },
  { type: 'Spanish', question: '¿Cuánto cuesta el programa ambulatorio para el cáncer anal?', expected: 'Answers in Spanish with the listed price' },
  { type: 'Arabic', question: 'ما هي تكلفة علاج سرطان الغدة الكظرية في تيخوانا؟', expected: 'Answers in Arabic with the listed price' },
];

let history: ChatTurn[] = [];
const rows: string[] = [];
for (const [i, c] of CASES.entries()) {
  if (!c.followsPrevious) history = [];
  const started = Date.now();
  const reply = await answer(c.question, history);
  const ms = Date.now() - started;
  history = [...history, { role: 'user', content: c.question }, { role: 'assistant', content: reply.answer }];
  const sources = reply.sources.map((s) => `[${s.title}](${s.url})`).join(', ') || 'none';
  rows.push(
    `## ${i + 1}. ${c.type}\n\n**Question:** ${c.question}\n\n**Expected:** ${c.expected}\n\n**Status:** \`${reply.status}\` · ${ms} ms\n\n**Answer:**\n\n${reply.answer}\n\n**Sources:** ${sources}\n`,
  );
  console.log(`${i + 1}. ${c.type}: ${reply.status} (${ms} ms)`);
  await new Promise((r) => setTimeout(r, 6000));
}

await writeFile('TEST_RESULTS.md', `# Test results\n\nGenerated ${new Date().toISOString()} by \`npm run eval\`.\n\n${rows.join('\n')}`);
console.log('Wrote TEST_RESULTS.md');

# PlacidWay Knowledge Chatbot

A chatbot that answers visitor questions using **only** the seven PlacidWay pages provided for the assessment, cites the page every answer came from, and says so honestly when the answer is not there.

**Live demo:** https://placidway-chatbot.vercel.app

## What it does

- Crawls the 7 source pages politely (robots.txt checked, identified User-Agent, ~1 request per second, retries with backoff).
- Extracts clean, structured text: menus, footers and modals removed, headings kept as section boundaries, **table rows kept intact** so every price stays attached to its procedure.
- Answers in the visitor's language (Spanish, Arabic, etc.) while searching English content.
- Cites every answer with links to the source page(s).
- Never invents a price: every money amount in an answer is checked against the cited source text before it is shown.
- Says "I don't know" with a link to the PlacidWay contact page when the content does not cover the question.
- Declines medical advice and off-topic questions, and refuses to confirm prices the pages do not support.
- Understands follow-up questions using the conversation history.
- Shows a short medical disclaimer once per conversation, not on every message.
- Offers a quote form (name + email) when the visitor wants a price for their own case.
- Logs unanswered questions and leads so content gaps can be found.
- Refreshes its content on demand and automatically every week.

## Architecture

```
            ┌──────────── ingestion (npm run ingest / POST /api/refresh / weekly cron) ────────────┐
 7 URLs ──▶ crawl.ts ──▶ extract.ts ──▶ kb.ts chunkPages ──▶ gemini.ts embed ──▶ data/kb.json or Redis
            robots.txt    sections +       ~1.4k-char chunks      384-dim vectors
            1 req/s       table rows       with page + heading

 question ──▶ search.ts ────────────────────────▶ answer.ts ───────────────────────────▶ chat UI
              BM25 + vector similarity,            one LLM call (free model chain), JSON     answer + sources
              fused with Reciprocal Rank Fusion    citation + price verification guards    disclaimer, quote form
```

| File | Responsibility |
|---|---|
| `src/config.ts` | Source URLs, crawl policy, retrieval and chunking parameters, environment access |
| `src/lib/crawl.ts` | robots.txt check, polite fetching with retries |
| `src/lib/extract.ts` | HTML to sections; keeps each table row on one line; drops site chrome and repeated lines |
| `src/lib/kb.ts` | Chunking, (de)serialisation, loading the knowledge base from Redis or the bundled file |
| `src/lib/gemini.ts` | Gemini client and batched, quota-aware embeddings |
| `src/lib/llm.ts` | Free model fallback chain (Groq, then Gemini) with output validation |
| `src/lib/search.ts` | Hybrid retrieval: BM25 keyword scores + embedding similarity, Reciprocal Rank Fusion |
| `src/lib/answer.ts` | Prompt, structured output schema, grounding guards, fallbacks, logging |
| `src/lib/store.ts` | Upstash Redis: unanswered-question log, leads, rate limiting (all optional) |
| `src/app/api/*` | `chat`, `lead`, `refresh`, `admin/logs` endpoints |
| `src/app/chat.tsx` | Chat UI |
| `scripts/ingest.ts` | Builds `data/kb.json` from the live pages |
| `scripts/eval.ts` | Runs the assessment test questions and writes `TEST_RESULTS.md` |

## How hallucination is prevented

Grounding is enforced in code, not only in the prompt:

1. **Retrieval first.** The model only sees the top passages for the question, each labelled with an id.
2. **Structured output.** The model must return JSON: `status`, `answer`, `source_ids`, `offer_quote`, `medical_topic`.
3. **Citation check.** An `answered` reply that cites no retrieved passage is discarded and replaced with the honest fallback.
4. **Price verification.** Every money amount in the answer (`$18,995`, `30000 USD`, ...) must appear in the text of the passages it cites. One unverified amount and the whole answer is replaced with "not listed, request a free quote". Amounts the visitor typed (for example "I heard it costs $50") are allowed in the reply only so it can contradict them.
5. **Sources come from the server.** Links shown to the visitor are built from the cited passage ids, never from URLs the model writes.
6. **Logging.** Every fallback is logged with the question and the reason, so content gaps can be reviewed.

## Tools and models

| Choice | Why |
|---|---|
| **Next.js 16 + TypeScript** | One codebase for the UI and the API; deploys to Vercel with no extra infrastructure |
| **Groq `openai/gpt-oss-120b` (then `gpt-oss-20b`)** for answers, then a chain of **Gemini Flash** models | All free. Groq's free tier allows far more requests per day than Gemini's (20 per model per day), so it carries the live demo; when a model is rate-limited or overloaded the next one answers instantly, because each model has its own quota |
| **`gemini-embedding-001`** at 384 dimensions | Free multilingual embeddings: a Spanish or Arabic question still finds English passages; 384 dims keeps the knowledge base small |
| **BM25 + embeddings (hybrid)** | Keywords catch exact terms like "adrenal" or "In-Patient"; embeddings catch paraphrases and other languages |
| **cheerio** | Fast, dependency-light HTML parsing |
| **Upstash Redis (optional)** | Stores the refreshed knowledge base, logs and leads on serverless hosting; everything still works without it |

The model chain and embedding model are environment variables, so switching provider or model needs no code changes. Whichever model answers, its JSON is validated with zod before use; malformed output moves on to the next model.

## Setup

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run ingest               # crawls the 7 pages and builds data/kb.json
npm run dev                  # http://localhost:3000
npm run eval                 # runs the test questions, writes TEST_RESULTS.md
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Gemini API key (free at aistudio.google.com) |
| `GROQ_API_KEY` | recommended | Groq API key (free at console.groq.com), used first in the model chain |
| `LLM_MODELS` | no | Ordered `provider:model` fallback chain; default Groq gpt-oss-120b and gpt-oss-20b, then four Gemini Flash models |
| `GEMINI_EMBED_MODEL` | no | Embedding model, default `gemini-embedding-001` |
| `REFRESH_TOKEN` | for refresh | Bearer token for `POST /api/refresh` |
| `CRON_SECRET` | for weekly refresh | Set on Vercel; the cron job sends it automatically |
| `ADMIN_TOKEN` | for logs | Bearer token for `GET /api/admin/logs` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | optional | Upstash Redis; without it logs go to the server console and refresh means re-running `npm run ingest` |

## Refreshing content

- **Locally / in CI:** `npm run ingest`, then redeploy. The bundled `data/kb.json` is the knowledge base.
- **On the live site:** `curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" https://<host>/api/refresh` re-crawls the pages, re-embeds them and publishes the new knowledge base to Redis. Running instances pick it up within a minute.
- **Automatically:** a Vercel cron job calls the same endpoint every Monday at 03:00 UTC.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | `{ message, history }` returns `{ status, answer, sources, offerQuote, medicalDisclaimer }` |
| `POST` | `/api/lead` | `{ name, email, interest }` stores a quote request |
| `POST` | `/api/refresh` | Re-crawl and re-index (Bearer `REFRESH_TOKEN`) |
| `GET` | `/api/admin/logs` | Unanswered questions and leads (Bearer `ADMIN_TOKEN`) |

## Test results

See [`TEST_RESULTS.md`](TEST_RESULTS.md) and the improvement notes in [`WRITEUP.md`](WRITEUP.md).

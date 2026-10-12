# Write-up

## Approach in one paragraph

The bot treats honesty as a code problem, not only a prompt problem. Pages are crawled politely, split by their headings with tables kept row by row so a price never loses its procedure, and indexed twice: BM25 for exact terms and multilingual embeddings for paraphrases and other languages. One LLM call per question returns structured JSON with the passage ids it used. The server then refuses to show any answer that cites nothing, or that contains a number not present in the cited passages, and replaces it with an honest "not listed, request a free quote" plus a log entry. Generation runs on a chain of free models (Groq gpt-oss, then Gemini Flash), each with its own quota, so one model being rate-limited never takes the bot down.

## What I would improve with another week

- **An evaluation set in CI.** Grow the 12 test questions to about 100 (including PlacidWay's hidden-question style), grade them automatically for grounding, citation and refusal behaviour, and run them on every change.
- **Smarter follow-ups.** Rewrite each follow-up into a standalone question before retrieval instead of concatenating it with the previous turn; this improves recall on long conversations.
- **A reranker.** Re-order the top 20 retrieved passages with a cross-encoder before sending the best 6 to the model.
- **Streaming answers** for a faster-feeling UI, with the price guard applied before the final message is committed.
- **Structured price extraction.** Parse price tables into records (procedure, program, amount, currency, conditions) at ingestion, so cost questions are answered from data rather than free text.
- **Admin page** for the unanswered-question log and leads, instead of the JSON endpoint.
- **Change detection** on refresh: only re-embed pages whose content hash changed.

## Known limitations

- **Free-tier quotas.** Gemini's free tier allows 20 generations per model per day and Groq's limits tokens per minute. The fallback chain absorbs this for normal traffic, but a burst of many questions at once can still reach the honest fallback message.
- **The fallback message is in English.** When the guard replaces an answer, the replacement text is not translated.
- **Source data inconsistencies are passed through.** For example, the comparison page lists "VISANI® Stem Cells in Puebla, Mexico" with the location "Mexico City, Mexico", and the price-list page contains an empty range ("prices range between in Tijuana"). The bot repeats only what the pages say, so such inconsistencies can appear in answers.
- **Number guard limits.** It verifies every number with three or more digits, so a correct answer that converts or sums figures is rejected by design. Numbers written in words are not checked.
- **Retrieval scope.** Videos are indexed by title and description only, not by their spoken content.
- **No authentication** on the chat itself; abuse is limited by per-IP rate limiting when Redis is configured.

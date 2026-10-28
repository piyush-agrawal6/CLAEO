# AI Visibility Engine Layer

The AI layer measures whether a brand is mentioned when real AI engines
answer a customer's tracked questions. Code:
`src/lib/providers/ai/`.

The older `AIService` (structured extraction for business logic) is
documented in [AI_LAYER.md](AI_LAYER.md); this doc covers the measurement
engine adapters, the registry and mention detection.

## Engine registry — the source of truth

The `ai_engines` table (seeded by `drizzle/0002_little_supreme_intelligence.sql`)
defines WHAT can be measured. Each engine has an honesty mode:

| Key | Name | Mode | Real adapter |
| --- | --- | --- | --- |
| `chatgpt` | ChatGPT | `planned` | — (an OpenAI API model response is not ChatGPT) |
| `gemini` | Gemini | `real` | `GeminiAdapter` (Google AI) |
| `perplexity` | Perplexity | `planned` | — |
| `google_ai_mode` | Google AI Mode | `planned` | — |
| `claude` | Claude | `planned` | — |
| `copilot` | Microsoft Copilot | `planned` | — |
| `llama` | Llama 3.3 70B (Groq) | `real` | `GroqAdapter` |

Modes in the table: `real` / `mock` / `planned` / `disabled`. The DB row's
`sourceDescription` states honestly why each engine is or is not measured.

## Runtime resolution

`listAiEngines()` resolves every registry row for *this* deployment into a
runtime status; `listScannableAiEngines(limit)` returns only engines a scan
may actually query (capped at `MAX_AI_ENGINES_PER_SCAN`):

| Resolution | Meaning |
| --- | --- |
| `real` | a configured real adapter answers genuine questions |
| `mock` | deterministic sample data only (dev/test; must be labeled) |
| `unavailable` + `planned` | no legitimate source wired — UI shows "coming soon" |
| `unavailable` + `not_configured` | adapter exists but the API key is missing |
| `unavailable` + `disabled` | switched off (or mock-only engine outside mock mode) |

Rules:

- **Planned engines are NEVER scannable** — they cannot contribute data,
  metrics or recommendations, and are never presented as supported.
- In mock/test mode, `real` engines fall back to **labeled** mock adapters
  (sample data, `mocked: true`).
- A `real` engine with no API key is `unavailable(not_configured)` — the
  scan skips it honestly, it does not substitute data.
- Ordering is deterministic: engines billed to `AI_PRIMARY_PROVIDER` first,
  then `AI_FALLBACK_PROVIDER`, then by key.

## Real adapters

| Adapter | Engine | Endpoint | Auth | Temperature |
| --- | --- | --- | --- | --- |
| `GeminiAdapter` | gemini | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `x-goog-api-key` header | 0.2 |
| `GroqAdapter` | llama | `api.groq.com/openai/v1/chat/completions` (OpenAI-compatible) | `Bearer` header | 0.2 |

Honesty rules built into both:

- **Only the tracked prompt is sent** — never the brand name, domain or any
  brand context. A real measurement prompt must stay neutral or a mention
  would prove nothing. `fixtureHint` (brand/domain/competitors) exists for
  the mock only and is ignored by real adapters.
- `supportsCitations = false` for both. This integration reads plain answer
  text only; URLs that appear in the text are stored as
  `kind='extracted'` and are **never** counted as provider citations.
- Low temperature (0.2) keeps repeated measurements comparable.
- The model name is env-derived (`GEMINI_MODEL`, `GROQ_MODEL`); token usage
  is stored when the provider reports it; no per-call dollar cost is
  reported, so `actualCostUsd` is null (see [PROVIDER_COSTS.md](PROVIDER_COSTS.md)).

## Mention detection — deterministic, auditable

`mentions.ts` decides "was the brand mentioned?" with no LLM involved:

- `detectMention(answerText, { brandNames, domain })` matches brand-name
  variants with word boundaries and **flexible whitespace/hyphens** ("Acme
  Corp" also matches "AcmeCorp", "acme-corp", "ACME  CORP"; "acmee" does
  not match). The domain matches as a full domain (`acme.io`) and as its
  bare label (`acme`, when ≥ 3 chars), same word boundaries, case
  insensitive. Returns a total `count` plus a bounded `context` snippet
  (≤ 240 chars) around the first match — the evidence shown in the UI.
- `extractUrlsFromAnswer(answerText, limit=10)` pulls http(s) URLs from the
  text, strips trailing punctuation, canonicalizes (www removed, host
  lowercased) and de-duplicates.
- `domainMatches(host, domain)` is subdomain-aware: `app.acme.io` matches
  `acme.io`; `notacme.io` does not.

## Citations provenance

The `citations` table distinguishes `kind='provider'` (the engine explicitly
returned it as a source) from `kind='extracted'` (the URL merely appears in
the answer text). With both real adapters, only `extracted` rows exist —
citation-share metrics count provider citations only, so today they honestly
report "no provider citations" (null, not 0). See [SCORING.md](SCORING.md).

## Mock AI adapter

`MockAiAdapter` produces deterministic sample answers (zero spend) that flow
through the exact same mention/URL pipeline as real answers:

- Seeded by a stable hash of `(engine, prompt, domain)` — same input, same
  answer, no flicker between renders.
- A prompt containing `fixture-nobrand` **never** mentions the brand;
  otherwise the brand is mentioned for ~60% of (engine, prompt, domain)
  combinations.
- The owned-domain URL is linked **only when the answer actually discusses
  the brand**; otherwise only a third-party URL appears.
- Always `mocked: true` — labeled sample data end-to-end.

## Guard and retry flow

Every real AI call goes through `executeAiRequest()` (`http.ts`):
`requirePaidOperation("llm_request", { provider })` **before** the network
request, `recordUsage()` **after** every attempt — including failures, with
the classified `errorClass`. Estimated cost is recorded as 0 (bounded by
request counters instead).

Retry policy: retry **once** on HTTP 429/5xx and network errors (backoff
250ms + jitter); **never** retry timeouts — an aborted LLM call may still
complete server-side. Timeout: 30s per request.

| Error class | Trigger | Retryable |
| --- | --- | --- |
| `AUTHENTICATION` | HTTP 401/403 | no |
| `RATE_LIMIT` | HTTP 429 | yes (once) |
| `PROVIDER_ERROR` | HTTP 5xx → yes; other non-2xx → no | as noted |
| `BAD_RESPONSE` | non-JSON body, malformed payload, empty answer text | never |
| `TIMEOUT` | 30s abort | **never** |
| `NETWORK` | transport failure | yes (once) |

## Honesty guarantees

- Planned engines are never scannable and never contribute a single data
  point — "coming soon", not fake results.
- Real adapters receive only the neutral tracked prompt; a brand mention in
  a real answer is genuine evidence, never something we prompted for.
- URLs in answer text are `extracted`, never counted as provider citations.
- Mention detection is deterministic and returns its evidence snippet;
  sentiment/position/confidence are stored null — never fabricated.
- Unconfigured engines surface as `not_configured`; failures are classified
  and recorded (guard counters include failed attempts), never hidden.
- Mock answers are `mocked: true` everywhere and force-disabled in
  production by env hardening.

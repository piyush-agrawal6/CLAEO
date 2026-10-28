# DataForSEO

DataForSEO supplies the classic SEO half of the product: keyword demand
metrics and live Google SERP checks that pair with the AI-visibility layer
(see [AI_VISIBILITY.md](AI_VISIBILITY.md)). This document describes the
shipped HTTP client in `src/lib/providers/dataforseo/`.

**Status:** real. Two Live endpoints are integrated, with a deterministic
mock as the development default. Requesting the real client without
credentials throws `ConfigurationError` — it never silently mocks.

## Endpoints

Exactly two endpoints are called (URLs verified against the official
docs.dataforseo.com documentation, October 2026):

| Endpoint | Used for | Request shape |
| --- | --- | --- |
| `POST /v3/dataforseo_labs/google/keyword_overview/live` | keyword demand (volume, CPC, competition, trend, intent) | one task with up to 700 keywords |
| `POST /v3/serp/google/organic/live/regular` | live SERP position check | one task per keyword, `depth` capped at 10 |

The client never sends `include_clickstream_data` (would double Labs price)
and never sends search operators (would multiply the SERP price ×5). SERP
depth is clamped to 1–10 and the scan executor always requests 10 — exactly
one billed page (see [PROVIDER_COSTS.md](PROVIDER_COSTS.md)).

## Auth and transport

- Basic auth: `Authorization: Basic base64(DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD)`.
  Credentials come from env, never literals; logs never contain auth headers,
  request bodies or raw response payloads.
- Base URL from `DATAFORSEO_BASE_URL` (default `https://api.dataforseo.com`),
  timeout from `DATAFORSEO_TIMEOUT_MS` (default 30s).
- Request keywords are trimmed, lowercased, de-duplicated and capped at the
  provider's 700-keyword hard limit before anything else happens.

## Response envelope and Zod validation

Every v3 response shares an envelope: `status_code`, `status_message`,
`cost` (provider-reported actual USD for the call), and a `tasks[]` array
with per-task `status_code`, `cost` and `result[]`.

- `status_code` **20000 (Ok) and 20001 (Partial content) are success**;
  any other code is classified as an error (table below).
- Every response is parsed with strict Zod schemas
  (`schemas.ts`, shapes verified against the official docs). Fields we read
  are validated; unknown fields are ignored (`.passthrough()`); a payload
  that does not match the documented schema throws `BAD_RESPONSE` — no
  "close enough" data ever enters the database.

## Normalization

Business code never sees provider-shaped payloads (`normalize.ts`):

- **Keyword metrics** → one row per returned keyword: `searchVolume`, `cpc`,
  `competition` (0–1), `competitionLevel`, monthly/quarterly/yearly trends,
  `intent`. Every field is nullable — a value the provider does not return
  stays null, never back-filled.
- **Omitted keywords** → DataForSEO silently skips keywords it does not know
  (and does not bill for them). The result carries `omittedKeywords`: the
  sent keywords that got no data. No row is written for them — no data is
  not zero data.
- **SERP items** → `rank` (rank_group), `absoluteRank`, `page`, `resultType`
  (organic / paid / featured_snippet), `url`, `domain`, `title`. Rows without
  a URL are skipped; a missing provider domain is derived from the URL
  hostname (www-stripped); `itemTypes` is capped at 25 entries.
- **Tracked-domain rank** is computed by the scan executor
  (`src/server/services/scan/executors.ts`): the best *organic* rank of any
  row on the tracked domain or its subdomains. Domain absent from the SERP →
  `trackedDomainRank: null` — absence is data, never a fabricated worst rank.

## Error classification

Errors are classified (`ProviderErrorClass`) so retries and observability
never string-match messages:

| Class | Trigger | Retryable |
| --- | --- | --- |
| `AUTHENTICATION` | provider 40100–40102 / 40300–40302; HTTP 401/403 | no |
| `PROVIDER_QUOTA` | provider 40200 (no credits); HTTP 402 | no |
| `RATE_LIMIT` | provider 42900–42902; HTTP 429 | **yes** |
| `PROVIDER_ERROR` | provider 5xxxx; HTTP 5xx → transient, retryable. Other 4xxxx (invalid request, unsupported location) and other non-2xx HTTP → not retryable | as noted |
| `TIMEOUT` | `AbortSignal` timeout expired | **never** |
| `NETWORK` | transport failure (DNS, reset, …) | **yes** |
| `BAD_RESPONSE` | non-JSON body; Zod schema mismatch | **never** |

## Retry policy

- Max **3 attempts** (1 initial + 2 retries), only for classes marked
  retryable above — effectively HTTP 429/5xx, provider 429xx/5xxxx and
  network errors.
- Backoff `250ms × 2^(attempt−1)` plus 0–124 ms of jitter.
- **Timeouts and non-JSON bodies are never retried.** A Live request that
  timed out (or returned garbage) may still have executed and been billed
  server-side — retrying risks a double charge. The request failed; that is
  recorded and surfaced honestly.

## Redis cache

Live responses are cached in Redis so identical requests across scans cost
once (`cache.ts`):

- Keys **bind every billed parameter** — provider, endpoint, location,
  language, depth and the normalized keyword set — so a cached value can
  never be served for a different request. Keys are versioned (`dfs:v1:`),
  so a normalization change invalidates everything safely.
- TTLs: keyword metrics **7 days** (`CACHE_TTL.keywordMetrics` — the
  underlying Google-Ads-based dataset updates monthly), SERP snapshots
  **24 hours** (`CACHE_TTL.serpSnapshot` — volatile by nature).
- A cache hit makes **no provider request** and consumes **no guard
  budget**: it is still recorded in the usage ledger with `cache_hit=true`,
  units 0 and estimated cost 0, and the result is flagged `cacheHit: true`
  (persisted per row, see [SCAN_ENGINE.md](SCAN_ENGINE.md)).

## Deterministic mock

`MockDataForSeoClient` (`mock.ts`) is the default in development and tests.
Every fixture is **provider-shaped**: it is parsed by the same Zod schemas
and normalized by the same functions as real responses, so the entire
pipeline minus the network is exercised. All values derive from a stable
hash of the keyword — the same request always yields the same numbers, and
`cost` is always null (mock data implies zero provider spend).

Deliberate fixture triggers (used by tests/E2E to exercise honest states):

- a keyword containing `fixture-unknown` is **omitted** from the
  keyword-overview response (simulates "provider does not know this
  keyword", unbilled);
- a keyword containing `fixture-absent` **keeps the tracked domain out of**
  the fixture SERP (simulates domain absent → `trackedDomainRank: null`).

`fixtureHint` (tracked domain, competitors) exists for the mock only and is
ignored by the real client.

## Client factory

`getDataForSeoClient()` (`index.ts`):

- `DATAFORSEO_MOCK_MODE=true` (development default; force-disabled in
  production by env hardening) or `NODE_ENV=test` → deterministic mock.
- Otherwise the real client **requires** `DATAFORSEO_LOGIN` /
  `DATAFORSEO_PASSWORD` and throws a clear `ConfigurationError` when they
  are missing — it never silently falls back to mock data.

Every real call runs `requirePaidOperation("dataforseo_request")` before the
network request and `recordUsage()` after every attempt — success or
failure. Guard/record mechanics and daily budgets: [COST_CONTROLS.md](COST_CONTROLS.md)
and [PROVIDER_COSTS.md](PROVIDER_COSTS.md). Scan orchestration: [SCAN_ENGINE.md](SCAN_ENGINE.md).

## Honesty guarantees

- No fabricated metrics: every provider value is nullable and stays null
  when the provider omits it.
- Domain absent from the SERP → `rank: null`, never a made-up worst rank.
- Keywords the provider omits are reported (`omittedKeywords`), unbilled,
  and produce no data rows.
- Timeouts/non-JSON are never retried (double-charge protection); failures
  are classified, recorded and surfaced — not hidden.
- Missing credentials throw `ConfigurationError`; production cannot serve
  mock DataForSEO data (env hardening force-disables mock mode).
- Cache hits are labeled (`cache_hit=true` in the ledger and per row) and
  consume no guard budget because no provider request was made.

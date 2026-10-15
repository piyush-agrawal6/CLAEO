# DataForSEO

DataForSEO is the planned source for classic SEO data (SERP results, keyword
metrics, on-page audits) that pairs with the AI-visibility layer: AI answers
show *what* is being said, SERP data shows *where* you rank for the same
queries.

**Status:** integration scheduled for its own MVP phase. Phase 0/1 ships the
abstraction, mock provider and all cost controls; the HTTP adapter lands with
the DataForSEO phase. Requesting a real provider before that throws
`ConfigurationError` — never fabricated data.

## Planned endpoints

| Endpoint | Product use | Notes |
| --- | --- | --- |
| `v3/serp/google/organic/keywords/overview` | Keyword demand + SERP ownership | batched |
| `v3/serp/google/organic/live/regular` | Live SERP check for tracked prompts | high cost — guarded |
| `v3/dataforseo_labs/google/keyword_ideas` | Prompt/keyword discovery in onboarding | batched |
| `v3/dataforseo_labs/google/ranked_keywords` | Competitor content gap evidence | batched |
| `v3/on_page/*` | Page-level audit enrichment (optional) | |

Exact request/response mapping will be documented here when the adapter ships.

## Auth and transport

- Basic auth with `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`
  (URLs embed credentials → the logger scrubs `scheme://user:pass@`
  defensively even if such a URL is ever logged).
- `DATAFORSEO_SANDBOX_MODE=true` (default) uses the free sandbox for
  development; production deployments should set it to `false` deliberately.
- Base URL and timeouts come from configuration, never literals in features.
- All requests are routed through the search-provider interface
  (`src/lib/providers/search/`), so features are provider-agnostic.

## Cost control (the critical part)

DataForSEO charges per call — SERP live queries are the most expensive. Guards
applied before any request:

1. **`canPerformPaidOperation("dataforseo_request")`** — kill switch →
   daily count limit (`MAX_DATAFORSEO_REQUESTS_PER_DAY`, default 25) →
   daily spend cap (`MAX_DAILY_PROVIDER_SPEND_USD`, default 5).
2. **`recordUsage()` after every call**, successful or not, into Redis
   counters (guard input) and the `usage_records` table (audit/reporting).
3. **Caching** — SERP/keyword responses cache in Redis keyed by query +
   market (`CACHE_TTL`), so identical prompts across scans cost once.
4. **Mock mode** (`DATAFORSEO_MOCK_MODE=true` default) makes development and
   CI spend exactly $0.
5. **Batching where possible** — keyword ideas/overview accept up to 1,000
   keywords per call; live SERP checks are reserved for tracked prompts only.

Details: [COST_CONTROLS.md](COST_CONTROLS.md).

## Data integrity rules

- Provider responses are normalized into first-party tables
  (`visibility_results`, `citations`, `page_audits`, …) with `source` and
  `observed_at` recorded.
- No score is ever blended or back-filled: if a scan did not run, the metric
  shows "no data", not a stale or invented number.
- Mock rows are flagged `mocked: true` end-to-end and labeled in the UI.

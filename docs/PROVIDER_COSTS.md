# Provider Costs

Every dollar number in this document is an **ESTIMATE** derived from public
pricing pages. Estimates exist to bound spend (guards, caps, budgets) —
they are never presented as invoices. When a provider reports an actual
cost, the actual takes precedence (see the accounting flow below).

Cost-control mechanics (kill switches, daily guards, `recordUsage`):
[COST_CONTROLS.md](COST_CONTROLS.md). Per-request behavior:
[DATAFORSEO.md](DATAFORSEO.md), [AI_VISIBILITY.md](AI_VISIBILITY.md).

## DataForSEO estimates

Source: dataforseo.com/pricing pages, verified October 2026
(`src/lib/providers/dataforseo/costs.ts`):

| Product | Estimate | Notes |
| --- | --- | --- |
| DataForSEO Labs Google Live (`keyword_overview/live`) | $0.012 per task + $0.00012 per returned item | `include_clickstream_data` would double it — never sent |
| Google Organic SERP Live (`serp/google/organic/live/regular`) | $0.002 per SERP of up to 10 results | depth rounds up to the next 10; search operators ×5 — never sent |

A keyword-overview batch with 10 keywords ≈ $0.012 + 10 × $0.00012 =
**$0.0132**. The scan executor always sends SERP depth 10 — exactly one
billed unit per SERP request.

## AI engines: no price table is asserted

We do **not** assert any per-token price for Gemini or Groq — we have not
verified one, so we do not publish one. AI requests are instead bounded by
**request counters**:

| Bound | Env var | Default |
| --- | --- | --- |
| AI requests per scan | `MAX_AI_REQUESTS_PER_SCAN` | 20 |
| LLM requests per day | `MAX_LLM_REQUESTS_PER_DAY` | 100 |

Accordingly, an AI request's estimated cost is recorded as **$0.0000** and
provider-reported token usage (prompt/completion tokens) is stored on the
visibility result when the provider reports it. Gemini and Groq do not
report a per-call dollar cost, so `actualCostUsd` stays null.

## Accounting flow

1. **Pre-run estimate** — `estimateKeywordOverviewUsd()` /
   `estimateSerpLiveRegularUsd()` produce the estimated cost of each
   DataForSEO request. The guard (`canPerformPaidOperation`) checks
   accumulated estimated spend before the call is allowed.
2. **Record after every attempt** — success or failure, `recordUsage()`
   writes a `usage_records` row: units, `estimated_cost_usd`,
   `actual_cost_usd` (provider-reported actual when known — it takes
   precedence), `cache_hit`, `success`, `error_class`, plus the
   workspace/domain/scan/run correlation ids. It also increments the Redis
   counters the daily guards read.
3. **Per-scan accumulation** — each finished scan operation adds
   `actual ?? estimate` to `intelligence_scans.provider_cost_usd`
   (exactly 0 for mock providers).
4. **Per-scan spend cap** — before claiming each operation the worker checks
   `MAX_PROVIDER_SPEND_PER_SCAN_USD` (default **$0.10**). Cap reached →
   every remaining pending operation is honestly marked `skipped` with
   `errorClass: "SPEND_CAP"`; nothing else is spent.

### Budget env vars

| Env var | Default | Bounds |
| --- | --- | --- |
| `MAX_DAILY_PROVIDER_SPEND_USD` | 5 | daily estimated-spend guard |
| `MAX_DATAFORSEO_REQUESTS_PER_DAY` | 25 | daily DataForSEO operation count |
| `MAX_LLM_REQUESTS_PER_DAY` | 100 | daily AI operation count |
| `MAX_PROVIDER_SPEND_PER_SCAN_USD` | 0.10 | per-scan spend cap (max 10) |
| `MAX_DATAFORSEO_REQUESTS_PER_SCAN` | 5 | 1 overview batch + ≤ 4 SERPs |

## Worked example: a default dev scan

With default caps, one scan plans (see [SCAN_ENGINE.md](SCAN_ENGINE.md)):

| Item | Count | Estimate |
| --- | --- | --- |
| keyword-overview batch (10 keywords) | 1 | ≈ $0.0132 |
| live SERPs (budget: 5 requests − 1 batch) | up to 4 | 4 × $0.002 = $0.008 |
| AI requests (10 prompts × 2 engines, capped at 20) | up to 20 | $0.00 (no price asserted) |
| **DataForSEO total** | | **≈ $0.021** |

This is far below the $0.10 per-scan cap, the $5 daily cap, and the daily
request counters. **When providers are mocked (the dev default) all of the
above is exactly $0** — mock providers never touch the guard counters and
never write spend.

## Honesty guarantees

- Every price here is labeled an estimate; provider-reported actual cost
  always wins in the usage ledger (`usage_records.actual_cost_usd`).
- No per-token AI price is ever asserted; AI spend is bounded by request
  counters, and recorded estimated cost is 0.
- Estimates feed guards and caps only — they are never billed or shown as
  an invoice.
- Per-scan spend cap skips remaining work with an explicit `SPEND_CAP`
  classification instead of silently overspending.
- Mock providers contribute exactly $0 and never consume guard counters.

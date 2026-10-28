# Cost Controls

Provider spend is a product-level risk: a bug, a loop or a compromised
account must not be able to drain the DataForSEO/LLM budget. QuerySide enforces
budget at the application layer — independent of provider-side limits.

## The guard: `canPerformPaidOperation()`

`src/lib/usage/guards.ts` — called **before every non-mock paid operation**,
in order:

1. **Kill switches** — per-provider (`gemini`, `groq`, `dataforseo`) or global
   (`app`), stored in Redis, flipped by an admin/ops runbook. Engaged switch →
   immediate denial (`reason: "kill_switch"`), other providers remain usable
   (e.g. kill Gemini → Groq fallback still runs).
2. **Daily operation limit** — env-configured counters per UTC day:

   | Env var | Default | Operation |
   | --- | --- | --- |
   | `MAX_DATAFORSEO_REQUESTS_PER_DAY` | 25 | `dataforseo_request` |
   | `MAX_LLM_REQUESTS_PER_DAY` | 100 | `llm_request` |
   | `MAX_DOMAIN_SCANS_PER_DAY` | 10 | `domain_scan` |

3. **Daily spend cap** — `MAX_DAILY_PROVIDER_SPEND_USD` (default 5) compared
   against accumulated *estimated* cost. Approximate by design — a ceiling,
   not an invoice.

```ts
const check = await canPerformPaidOperation("llm_request", { provider: "gemini" });
if (!check.allowed) → return a graceful quota error (never call the provider)
```

`requirePaidOperation()` is the throwing variant for call sites that cannot
handle a denial themselves.

## Recording: every call counts

`recordUsage()` (`src/lib/usage/recorder.ts`) runs after each attempt —
**success or failure** — so a misbehaving integration cannot retry itself
into bankruptcy:

- increments the Redis daily counter the guard reads,
- adds estimated cost to the spend counter,
- appends a durable `usage_records` row (provider, operation, units,
  estimated cost, workspace) for reporting.

Recording failures are logged, never fatal to the caller.

## Mock-first development

- `AI_MOCK_MODE=true` and `DATAFORSEO_MOCK_MODE=true` are the development
  defaults — dev/CI spend **$0** and never touch provider networks.
- Mocks are **force-disabled in production** by env hardening
  (`applyProductionHardening`) — production runs real providers or fails
  loudly; it cannot silently serve mock data.
- The mock provider is skipped by the guard entirely (`isMocked` short-circuit)
  because it costs nothing — but it still labels output `mocked: true`.

## Per-scan budget (Phase 3)

Every scan is capped twice — at plan time and during execution
([SCAN_ENGINE.md](SCAN_ENGINE.md)). All caps are Zod-bounded in
`src/lib/env.ts`:

| Env var | Default | Bounds |
| --- | --- | --- |
| `MAX_PROVIDER_SPEND_PER_SCAN_USD` | 0.10 | worker stops claiming operations at the cap (max 10) |
| `MAX_DATAFORSEO_REQUESTS_PER_SCAN` | 5 | 1 keyword-overview batch + ≤ 4 live SERPs |
| `MAX_AI_REQUESTS_PER_SCAN` | 20 | prompts × engines, hard-capped |
| `MAX_KEYWORDS_PER_SEARCH_SCAN` | 10 | keywords in the ONE overview batch |
| `MAX_SERP_KEYWORDS_PER_SCAN` | 5 | live SERP checks (one billed request each) |
| `MAX_AI_PROMPTS_PER_SCAN` | 10 | prompts observed per scan |
| `MAX_AI_ENGINES_PER_SCAN` | 2 | engines per prompt |
| `SCAN_WORKER_TIME_BUDGET_MS` | 8000 | wall-clock budget per worker pass |

- **Spend-cap skip:** before each operation the worker compares accumulated
  `providerCostUsd` against the cap; remaining pending operations are marked
  `skipped` with `errorClass: SPEND_CAP` — an explicit, visible outcome,
  never a silent overspend.
- **Plan rate limit:** `startScanAction` rate-limits scan starts per
  workspace against the plan's `scansPerDay` (free 1/day … agency 100/day)
  before any planning happens; resumes are separately limited (30/hour).
- **Caching:** identical DataForSEO requests are served from Redis (keyword
  metrics 7 days, SERP snapshots 24 hours — [DATAFORSEO.md](DATAFORSEO.md)).
  A cache hit makes **no provider request**: it is recorded with
  `cache_hit=true`, units 0 and estimated cost 0, and consumes no guard
  budget.
- **Zero-spend by construction:** with mock providers (the dev default) a
  full scan consumes no guard counters and records exactly $0.0000 —
  asserted by `scan.test.ts`.
- A default dev scan with real providers costs ≈ **$0.02** in DataForSEO
  data plus up to 20 counter-bounded AI requests — worked example:
  [PROVIDER_COSTS.md](PROVIDER_COSTS.md).

## UI/plan limits

- Plan entitlements (`PLAN_LIMITS` in `lib/usage/limits.ts`): domains,
  prompts, competitors, engines, refresh interval, scans/day, seats.
  Enforced today on domain, prompt and competitor creation, and on scan
  starts (`scansPerDay`); billing enforcement activates with the billing
  phase.
- `remainingToday(operation)` powers honest "N requests left today" displays.

## Operational runbook

| Situation | Action |
| --- | --- |
| Provider incident / runaway spend | `setProviderDisabled("gemini", true)` (or `app` for everything) |
| Budget too tight for a campaign | raise env limits + redeploy (values are env, not code) |
| Investigate spend | `usage_records` table + `/api/health` dev output (`usage` snapshot) |
| Verify guard behavior | `src/lib/usage/guards.test.ts` (limit, kill switch, spend cap) |

## Design principles

1. Guard **before** spend, record **after** — always both.
2. Limits live in env with conservative defaults; changing spend policy is a
   config change, never a code change.
3. Denials are graceful user-facing quota messages, not crashes.
4. Estimated costs are labeled estimates everywhere they appear.

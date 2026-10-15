# Cost Controls

Provider spend is a product-level risk: a bug, a loop or a compromised
account must not be able to drain the DataForSEO/LLM budget. Claeo enforces
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

## UI/plan limits

- Plan entitlements (`PLAN_LIMITS` in `lib/usage/limits.ts`): domains, prompts,
  engines, refresh interval, scans/day, seats. Enforced today on domain
  creation; billing enforcement activates with the billing phase.
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

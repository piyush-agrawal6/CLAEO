# Scan Engine

A scan is the batch entity that produces the product's evidence: keyword
metrics, live SERP snapshots and AI answers, then scores and
recommendations. Code: `src/server/services/scan/` + tables from
`drizzle/0002_little_supreme_intelligence.sql`.

## Trigger: manual only

Scans are **manual** — `trigger` only has the value `"manual"`, and scans
never run on page load, login, navigation or startup. The server-side
entry points (`index.ts`) are the only way a scan starts:

| Entry point | Behavior |
| --- | --- |
| `createAndRunScan` | the only way a scan starts — a direct user action; verifies the domain belongs to the workspace (tenant isolation) and refuses to scan a domain with no enabled prompts (no spend on an empty plan) |
| `resumeScan` | continues a `queued`/`running` scan; refuses terminal scans |
| `cancelScan` | flips `queued`/`running` → `cancelled`, marks pending operations `skipped`; already-collected data is kept (honest partial) |

The production call sites are the server actions in
`src/features/intelligence/actions.ts` (`startScanAction`, `resumeScanAction`,
`cancelScanAction`), which the `ScanLauncher` component submits from explicit
button presses only — never on load, login or navigation. `startScanAction`
additionally rate-limits starts against the plan's `scansPerDay` before any
planning happens. Work runs inline —
up to `MAX_INLINE_PASSES = 3` worker passes per trigger, stopping early
when done or when a pass makes no progress.

## Data model

- **`intelligence_scans`** — the batch: status, market (location/language
  codes), operation counters, accumulated `providerCostUsd`, `mocked`, and
  the persisted scores + coverage (see [SCORING.md](SCORING.md)).
  Statuses: `queued → running → completed | partial | failed | cancelled`.
- **`scan_operations`** — resumable, idempotent work items. Statuses:
  `pending → running → done | failed | skipped`, with `attempts`,
  sanitized `error` + `errorClass`.
- Evidence tables: `keyword_metrics`, `serp_snapshots` + `serp_results`,
  `visibility_runs` + `visibility_results` (+ `citations`,
  `competitor_mentions`).

Operation keys are **deterministic** and unique per scan
(`scan_operations_scan_key_unique`):

| Kind | Operation key |
| --- | --- |
| keyword metrics | `keyword_metrics:overview` (ONE batch) |
| SERP check | `serp:{keyword}` |
| AI observation | `ai:{promptId}:{engine}` |

## Planning caps (env-enforced at plan time)

`buildScanPlan()` caps everything before any provider is touched; all caps
are Zod-bounded in `src/lib/env.ts`:

| Env var | Default | Effect |
| --- | --- | --- |
| `MAX_KEYWORDS_PER_SEARCH_SCAN` | 10 | keywords in the ONE overview batch |
| `MAX_SERP_KEYWORDS_PER_SCAN` | 5 | live SERPs (each one billed request) |
| `MAX_DATAFORSEO_REQUESTS_PER_SCAN` | 5 | total DataForSEO requests: 1 batch + ≤ 4 SERPs |
| `MAX_AI_PROMPTS_PER_SCAN` | 10 | prompts observed per scan |
| `MAX_AI_ENGINES_PER_SCAN` | 2 | engines per prompt (also caps the plan) |
| `MAX_AI_REQUESTS_PER_SCAN` | 20 | total AI requests: prompts × engines, hard-capped |

Prompts are pre-sorted by importance (desc, then newest first); keywords
are normalized (trim/lowercase/80-char cap). With defaults: 10 keywords →
1 overview + 4 SERPs + up to 20 AI observations.

## Worker pass

`runScanPass()` (`worker.ts`) is safe to call repeatedly:

1. **Claim** the scan with an atomic UPDATE: claimable when `queued`, or
   `running` with `startedAt` older than **10 minutes** (crash recovery).
2. **Order** pending operations `keyword_metrics → serp → ai_prompt`
   (cheap metrics first, expensive AI last), then by creation time.
   Each claim is an atomic pending→running UPDATE — a concurrent worker
   loses cleanly.
3. **Budget**: per-pass wall clock `SCAN_WORKER_TIME_BUDGET_MS` (default
   8s). An exhausted budget just stops the pass; a later pass resumes
   exactly where it stopped.
4. **Spend cap**: before each operation, `providerCostUsd` is checked
   against `MAX_PROVIDER_SPEND_PER_SCAN_USD` (default $0.10) — remaining
   pending operations are marked `skipped` with `errorClass: SPEND_CAP`.
5. **Cancellation** is re-read between operations and respected promptly.
6. When no `pending`/`running` operations remain, the scan **finalizes**.

Cost per operation accumulates as `actual ?? estimate` (exactly 0 for
mock providers — see [PROVIDER_COSTS.md](PROVIDER_COSTS.md)).

## Executors and idempotency

`executors.ts` validates each payload (Zod), calls the provider adapter
(which enforces guard-before/record-after — see
[DATAFORSEO.md](DATAFORSEO.md) and [AI_VISIBILITY.md](AI_VISIBILITY.md)),
and persists with upserts keyed on the schema's unique constraints:

- `keyword_metrics` upserts on (scan, keyword);
- `serp_snapshots` upserts on (scan, keyword) and result rows are replaced
  **wholesale** (delete + re-insert, ≤ 25 rows);
- `visibility_runs` upserts on (scan, prompt, engine) — the unique index is
  partial (`WHERE scan_id IS NOT NULL`) so the ON CONFLICT target repeats
  that predicate; the result row per run is also replaced wholesale.

A resumed or replayed scan therefore **can never duplicate data or
double-charge** — re-execution overwrites, it does not append. Failures are
returned as classified outcomes (`done | failed | skipped` + `errorClass`),
never thrown, so one bad provider call cannot abort the scan. An engine
that became unavailable between planning and execution is skipped
honestly (`CONFIGURATION`).

## Finalization

When all operations are terminal, `finalizeScan()`:

1. Computes both scores **from persisted evidence only** — completed
   visibility runs for `ai_visibility_v1`, SERP snapshot ranks for
   `google_visibility_v1` (failed operations contribute nothing, see
   [SCORING.md](SCORING.md)) — and stores scores, formula versions and
   coverage columns.
2. Derives the scan status: no `done` operations but some
   failed/skipped → `failed`; some failed/skipped but some done →
   `partial`; otherwise `completed`.
3. **Competitor discovery** from this scan's organic SERP rows: a domain
   qualifies when it appears for ≥ 2 tracked keywords and is neither the
   tracked domain nor already tracked; ≤ 5 new discoveries per scan;
   `confidence = appearances ÷ keywords scanned` — a labeled suggestion,
   never asserted as fact.
4. **Deterministic recommendations** from the same evidence (brand absent
   from all AI answers for a prompt; competitor mentioned where the brand
   is not; domain absent from the SERP; page-one rank ≥ 6). No LLM is
   involved: the same evidence always yields the same recommendations.
   Re-scans refresh the existing `(domain, dedup_key)` row instead of
   stacking duplicates; open conditions the evidence no longer supports are
   auto-closed (dismissed/manual states are never touched). Enrichment
   failures are logged and never fail a finished scan.

## Zero-spend invariant

Mock providers (the dev default) cost exactly $0: they never call
`requirePaidOperation`, never write spend, and executor outcomes carry
`estimatedCostUsd: 0` — so a fully mocked scan contributes nothing to any
guard counter or cost total.

## Honesty guarantees

- Nothing runs automatically — no page load, login, navigation, startup or
  scheduler triggers a scan; only the manual entry points do.
- All caps are enforced at plan time and bounded in env; the per-scan
  spend cap skips remaining work explicitly (`SPEND_CAP`), never silently
  overspends.
- Cancellation and crashes produce honest partials: pending work is
  skipped, collected data is kept, a stale running scan is recoverable.
- Idempotent upserts mean replays never duplicate rows or double-charge.
- Scores and recommendations derive only from persisted evidence; failed
  measurements never contribute data, and competitor discovery is labeled
  as a suggestion with an estimated confidence.
- Tenant isolation: every entry point loads rows scoped by both domain and
  workspace — a foreign workspace id finds nothing.

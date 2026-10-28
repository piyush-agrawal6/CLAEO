# Phase 3 — Search intelligence

Phase 3 turned QuerySide from a data shell into a measuring product: real
search data, a real AI visibility engine, and the pages that present both —
with the honesty architecture enforced in code, not convention.

## Goals

1. **Real search intelligence** — actual Google keyword demand and live SERP
   positions from DataForSEO, not placeholders.
2. **Honest AI visibility** — measure brand presence in AI answers only where
   a legitimate source exists; everything else is labeled "coming soon".
3. **Product UX** — a dashboard and report pages where every number traces
   back to a scan the user explicitly triggered.

## What shipped

### 3A — DataForSEO (`docs/DATAFORSEO.md`)

Real HTTP client for two Live endpoints (keyword overview, organic SERP):
strict Zod-validated envelopes, provider-independent normalization, typed
error classification with safe-only retry, Redis response caching (keyword
metrics 7d / SERP 24h), guard-before/record-after on every call, and a
deterministic mock (provider-shaped fixtures) as the dev default.

### 3B — AI visibility engine (`docs/AI_VISIBILITY.md`)

Engine registry seeded from `ai_engines` (7 engines, each with an honesty
mode and a written reason): real Gemini and Groq adapters send **only the
neutral tracked prompt** (never the brand), deterministic mention detection
returns its evidence snippet, citations are provenance-tagged
(`provider` vs `extracted`), and planned engines (ChatGPT, Perplexity,
Google AI Mode, Claude, Copilot) are registered but never scannable.

### 3C — Scan engine & product UX (`docs/SCAN_ENGINE.md`, `docs/SCORING.md`)

The resumable, idempotent scan engine: planning caps → deterministic
operation keys → worker passes with a wall-clock budget and per-scan spend
cap → finalization that computes versioned scores from persisted evidence,
suggests competitors from SERP evidence and derives deterministic
recommendations (auto-closing what the evidence no longer supports). Product
surfaces: rewritten `/dashboard` (score cards, scan history, the two-step
confirm `ScanLauncher`), `/ai-visibility`, `/prompts`, `/competitors`,
`/citations` (provider vs extracted provenance), `/actions` (rule-based
action center). Scans start only from explicit button presses — never on
page load, login, navigation or startup.

## Honesty invariants

- No fabricated metrics: if a number has no source query, the UI shows `—`
  or "not enough data" — never a silent 0.
- Absence is data: a domain absent from a SERP stores `rank: null` (a
  confirmed measurement); a **failed** request is excluded from the
  denominator entirely ([SCORING.md](SCORING.md)).
- SoV and citation share are `null` (not 0) on thin evidence: nobody
  mentioned / no provider citations → "not enough data".
- Citations carry provenance: only `kind='provider'` counts as a citation
  share; URLs merely present in answer text are `extracted`.
- Mocked output is always labeled (`mocked: true` per row + scan, sample-data
  badges in the UI) and force-disabled in production by env hardening.
- Scans are user-triggered only, rate-limited per plan, and capped below.

## Caps and cost

| Cap | Default |
| --- | --- |
| `MAX_PROVIDER_SPEND_PER_SCAN_USD` | $0.10 |
| `MAX_DATAFORSEO_REQUESTS_PER_SCAN` | 5 (1 overview batch + ≤ 4 SERPs) |
| `MAX_AI_REQUESTS_PER_SCAN` | 20 (≤ 10 prompts × 2 engines) |
| `MAX_KEYWORDS_PER_SEARCH_SCAN` / `MAX_SERP_KEYWORDS_PER_SCAN` | 10 / 5 |
| `SCAN_WORKER_TIME_BUDGET_MS` | 8000 per pass |
| Plan `scansPerDay` | free 1 → agency 100 (Redis rate limit on start) |

A default dev scan ≈ **$0.02** in DataForSEO data with real providers and
exactly **$0.00** with mocks (asserted in tests) — worked example:
[PROVIDER_COSTS.md](PROVIDER_COSTS.md); guard mechanics:
[COST_CONTROLS.md](COST_CONTROLS.md).

## Test coverage

- `src/server/services/scan/scan.test.ts` (8) — full pipeline on PGlite +
  in-memory Redis + mock providers: plan caps, honest end-to-end scan,
  idempotent replay, auto-close, spend-cap skip, stale-resume crash
  recovery, cancellation, tenant isolation.
- `src/features/intelligence/queries.test.ts` (6) — read-model tenant
  isolation and null semantics.
- `src/lib/providers/dataforseo/*.test.ts` (20), `src/lib/providers/ai/*.test.ts`
  (16), `src/lib/scoring/*.test.ts` (10) — validation, normalization, errors,
  cache, mention detection, registry honesty, both formulas.
- `e2e/intelligence.spec.ts` — mocked Playwright journey: signup → onboarding
  → fixture prompts → two-step-confirm scan → scores/actions/citations →
  plan cap denial.

All tests are hermetic; live provider checks require
`ALLOW_LIVE_PROVIDER_TESTS=true` (default off, force-disabled in
production).

## What's NOT included

Roadmap Phase 4 owns the rest of the scan-infrastructure story: a Redis-backed
job queue with background workers and scheduled/orchestrated scans — today
work runs inline (up to 3 worker passes per explicit trigger) and resumes on
demand. See [MVP_ROADMAP.md](MVP_ROADMAP.md) for the phase list; the nav's
"Soon" sections (Site Audit, Analytics) and billing enforcement are likewise
not part of this phase.

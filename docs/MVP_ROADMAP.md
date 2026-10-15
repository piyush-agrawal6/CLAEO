# MVP Roadmap

Phased delivery from foundation to a launch-ready product. Each phase ends
green: `lint`, `typecheck`, `tests`, `build` all pass before moving on.

## Phases

### Phase 0 — Project foundation ✅ (complete)
Next.js 16 + TypeScript strict + Tailwind v4 + shadcn-style UI kit; Zod env
validation; Drizzle schema (22 tables) + generated migration; Redis abstraction
with in-memory fallback; structured logging with redaction; error taxonomy;
usage guards + kill switches; provider abstractions with deterministic mocks;
security headers + nonce CSP in `proxy.ts`; docs/ + README; Vitest + PGlite +
Playwright harness.

### Phase 1 — Authentication ✅ (complete)
Signup (transactional user + workspace + owner membership), email verification
(hashed single-use tokens, Resend + dev transport), login (rate-limited,
verified-email required), logout, password reset flow, optional Google OAuth
scaffold, session re-verification guards for every page/action, audit logging,
auth pages + app shell (sidebar/topbar/account menu, "Soon" nav labels),
attention-first dashboard with honest empty states, domains CRUD with plan
quotas, settings (workspace/profile).

### Phase 2 — Onboarding & discovery (next)
Website analysis wizard (crawl homepage, classify business, extract entities),
competitor suggestions with manual override, suggested prompt groups,
Google Search Console connection, editable prompt review step.

### Phase 3 — Prompt engine
Curated prompt library per category (commercial investigation, alternatives,
comparisons, …), AI-assisted generation grounded in business analysis, dedupe +
grouping, locale/country targeting, plan-based prompt quotas.

### Phase 4 — Scan infrastructure & SERP scan
Job queue + workers (Redis-backed), schedule/orchestrate scans, DataForSEO
adapter with batching + caching, SERP scan type, scan status UI, failure
semantics (partial vs. full, retry policy).

### Phase 5 — AI engine scan
Per-engine query execution (ChatGPT, Perplexity, Gemini, …), answer capture,
brand/competitor mention detection, sentiment, citation extraction,
store + aggregate into visibility metrics.

### Phase 6 — Visibility dashboard & competitor visibility
Score history, mention share, citation share, trend charts, per-engine
breakdown, competitor visibility comparison, share-of-voice, provenance
("which scan produced this number") everywhere.

### Phase 7 — Site audit (AEO)
Crawl pipeline (robots/sitemap), audit rules (answer extractability, headings,
FAQ/schema, entity clarity, EEAT, agent accessibility), issue severity +
evidence, page audit history, recommendations pipeline.

### Phase 8 — Action Center
Prioritized recommendations with impact/effort/confidence + competitor
evidence, filtering (quick wins vs. strategic), progress tracking +
notification triggers, reverse-engineering reports (why competitors win a
keyword).

### Phase 9 — Analytics & reporting
Google Search Console + GA4 integration (rankings vs. AI visibility side by
side), weekly email digest, CSV/JSON export, shareable read-only reports.

### Phase 10 — Billing, team, admin
Stripe subscriptions + entitlement enforcement (upgrade flows), team members
and roles, admin/ops panel (kill switches, usage dashboards), E2E coverage of
the billing lifecycle, launch hardening (load/soak of the scan pipeline).

## Current status

- **Done:** Phases 0–1.
- **Next:** Phase 2 (onboarding & discovery).
- **Deferred (documented, not built):** real DataForSEO/Gemini/Groq adapters,
  Stripe, GA4/GSC — all behind interfaces with mocks today.

## Cross-cutting rules (apply to every phase)

- No fabricated metrics — real queries or explicit empty states.
- Every paid call passes the cost guard; usage recorded after each attempt.
- Workspace always derived from session membership; repositories scope by it.
- `lint` / `typecheck` / `tests` / `build` green before phase completion.
- README + docs updated with the phase's new behavior.

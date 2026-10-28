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

### Phase 2 — Onboarding & discovery ✅ (complete)
Website analysis wizard (crawl homepage, classify business, extract entities),
competitor suggestions with manual override, suggested prompt groups,
editable prompt review step.
Shipped as documented in docs/ONBOARDING.md — the Google Search Console
connection was planned for this phase but did not make it and remains
unbuilt (see Phase 9).

### Phase 3 — Search intelligence & AI visibility ✅ (complete)
What shipped: real search intelligence end to end — a DataForSEO Live client
(keyword metrics + live SERP checks, cached, cost-capped; see
docs/DATAFORSEO.md), an AI visibility engine with a 7-engine honesty registry
(real Gemini/Groq adapters, labeled mocks, planned engines never scannable;
docs/AI_VISIBILITY.md), the resumable idempotent scan engine with per-scan
spend caps, deterministic versioned scoring and rule-based recommendations
(docs/SCAN_ENGINE.md, docs/SCORING.md), and the intelligence product UX:
rewritten dashboard with the two-step-confirm scan launcher, AI visibility
report, prompt/competitor tracking, citations with provenance and the action
center (docs/PHASE_3.md).

### Phase 4 — Scan infrastructure & SERP scan ⏭️ (superseded by Phase 3)
Shipped inside Phase 3: the DataForSEO adapter with batching + caching +
cost caps, the SERP scan type, scan status UI and failure semantics
(partial results, resumable scans). Still unbuilt: the Redis-backed job
queue/workers and scan scheduling — scans run inline on explicit user
triggers only (docs/SCAN_ENGINE.md).

### Phase 5 — AI engine scan ⏭️ (superseded by Phase 3)
Per-engine query execution, answer capture, brand/competitor mention
detection, citation extraction (provider citations + extracted URLs, each
labeled by provenance) and visibility aggregation shipped in Phase 3 for
the two wired real engines (Gemini, Llama) plus labeled mocks. Still
unbuilt: the remaining engines (registered as "planned", never presented
as supported) and sentiment analysis.

### Phase 6 — Visibility dashboard & competitor visibility ⏭️ (superseded by Phase 3)
Shipped in Phase 3: visibility scores with coverage, mention share,
share-of-voice with an honest "not enough data" state, citation share from
provider citations only, per-engine breakdown, competitor mention tracking
and provenance ("which scan produced this number") on every number. Still
unbuilt: score history and trend charts (today's product shows the latest
scan and scan-history rows, not time-series charts).

### Phase 7 — Site audit (AEO)
Crawl pipeline (robots/sitemap), audit rules (answer extractability, headings,
FAQ/schema, entity clarity, EEAT, agent accessibility), issue severity +
evidence, page audit history, recommendations pipeline.

### Phase 8 — Action Center ⚠️ (core shipped in Phase 3)
Shipped in Phase 3: deterministic, evidence-linked prioritized
recommendations with impact/effort, dismiss/done tracking and
dedup-stable refresh across scans. Still unbuilt: quick-win vs. strategic
filtering, notification triggers, and reverse-engineering reports
(why competitors win a keyword).

### Phase 9 — Analytics & reporting
Google Search Console + GA4 integration (rankings vs. AI visibility side by
side), weekly email digest, CSV/JSON export, shareable read-only reports.

### Phase 10 — Billing, team, admin
Stripe subscriptions + entitlement enforcement (upgrade flows), team members
and roles, admin/ops panel (kill switches, usage dashboards), E2E coverage of
the billing lifecycle, launch hardening (load/soak of the scan pipeline).

## Current status

- **Done:** Phases 0–3 (Phase 3 absorbed most of the original Phases 4–6;
  see the superseded notes above for exactly what remains).
- **Next (open candidates):** (a) scan scheduling + a durable job queue so
  scans no longer depend on inline user-triggered passes, (b) score history
  & trend charts, (c) Phase 7 — site audit (AEO). Today's scans run inline
  on explicit user triggers only — no queue or scheduler yet, see
  docs/SCAN_ENGINE.md.
- **Deferred (documented, not built):** Stripe billing, GA4/GSC integrations,
  sentiment analysis, the Site Audit and Analytics sections — planned AI
  engines beyond the two wired today are registered but honestly labeled
  "coming soon", never presented as supported.

## Cross-cutting rules (apply to every phase)

- No fabricated metrics — real queries or explicit empty states.
- Every paid call passes the cost guard; usage recorded after each attempt.
- Workspace always derived from session membership; repositories scope by it.
- `lint` / `typecheck` / `tests` / `build` green before phase completion.
- README + docs updated with the phase's new behavior.

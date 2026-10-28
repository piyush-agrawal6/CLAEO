# Phase 2: Onboarding & Discovery

Turn a bare new workspace into a usable discovery setup: add a website, draft a
business profile from the site's own public pages, pick competitors, and choose
the queries to track. Everything in this phase is **local-first and free** — the
crawler fetches only the customer's own domain, AI inference is mocked behind
`AI_MOCK_MODE`, and no DataForSEO credits are spent.

## The flow

`/onboarding` is a resumable wizard. Its state lives in the `onboarding_states`
table (one row per workspace) and drives which step the page renders:

```
website ──▶ analyzing ──▶ business ──▶ competitors ──▶ queries ──▶ completed
   ▲              │            │            │             │
   └── heal ──────┘ (domainId missing → back to website)
                   └── skip analysis (manual fallback) ──▶ business
```

- **website** — the user adds a domain (`normalizeDomain` accepts a hostname or
  URL and rejects anything that isn't a plausible registrable domain, so IPs and
  `localhost` never reach the database).
- **analyzing** — an SSRF-safe crawl of the site drafts the profile. The step is
  skippable at any time: *Skip analysis — enter details manually*. Setup must
  never depend on the crawl succeeding.
- **business** — confirm name/description/industry/etc. Only the name is
  required. Values entered by hand are stored with `source: "manual"` and are
  never overwritten by later crawls.
- **competitors** — manual entries; the "suggestions" panel shows only
  discovery-search categories and real competitors found on the site, never
  invented company names. Zero entries is valid.
- **queries** — suggested queries (mocked AI) plus free-text entries. Priorities
  are qualitative **QuerySide Priority** labels (HIGH/MEDIUM/HIGH), never
  fabricated volume/CPC/traffic numbers. Saving with nothing checked is valid.
- **completed** — sticky. Deleting the domain afterwards does not un-complete
  onboarding; `/onboarding` then passes the user straight through to the app.

### Resumability and healing

Every step action advances `onboarding_states.step`, so closing the tab and
returning lands the user exactly where they left off. The state machine heals
inconsistent states server-side:

- a mid-flow step with no `domainId` (domain deleted) resets to `website`;
- a `website` step that already has a `domainId` normalizes to `analyzing`;
- `completed` is sticky and never downgraded.

### Redirect safety

Deep links (`/onboarding?callbackUrl=/settings`) are honored on completion. The
`callbackUrl` is carried through every step as a hidden field, re-sanitized with
`safeCallbackUrl` on every server action (relative app paths only — never an open
redirect), and used as the final destination. Without a callback, completion
lands on the new domain's overview page (`/domains/{domainId}`), else the
dashboard.

## The crawler (SSRF-safe, lightweight)

`src/server/services/crawler/` fetches the customer's own site to extract readable
text for the business profile. It is deliberately paranoid:

- **Scheme/port**: only `http(s)` on default ports (80/443).
- **DNS pre-check**: the hostname is resolved first; every resolved address is
  validated (no loopback, private, link-local, CGNAT, multicast, or
  cloud-metadata ranges such as `169.254.169.254`).
- **Redirects**: followed manually, with the same SSRF + same-site validation on
  every hop (max `CRAWLER_MAX_REDIRECTS`, default 5).
- **Scope**: same registrable domain only (`www`-insensitive). The crawler never
  wanders onto third-party hosts.
- **Budgets**: capped pages (default 10), bytes per page, total duration, and
  per-page timeout — all set via `CRAWLER_*` env vars in `.env.example`.
- **Text extraction**: HTML → plain text with entity decoding; the output is
  treated as untrusted input (injection-guarded, length-capped, Zod-validated
  before it touches the profile).

**DNS-rebinding caveat**: the pre-check resolves the name once and the fetch then
re-resolves it, so a malicious DNS server that answers with a public IP during
the check and a private IP during the fetch could in principle slip through. This
is acceptable here because the crawl target is the customer's *own* domain (a
hostile origin would be attacking itself), but a production hardening step would
pin the connection to the validated IP.

### Honest failure states

A blocked or failed crawl never fabricates data:

- The refusal reason (blocked address, unresolvable DNS, redirect off-scope,
  budget exceeded) is written to the `crawl_jobs` row and surfaced verbatim in
  the UI.
- If pages were fetched but contained no readable text, the job records exactly
  that ("Pages were fetched but contained no readable text.") and the domain is
  marked failed rather than shown as an empty success.
- Onboarding stays fully usable via the manual path regardless of the outcome.

## Rate limits and audit

- Crawl requests share a per-workspace bucket (`domain:crawl:ws:{workspaceId}`)
  capped by `MAX_DOMAIN_SCANS_PER_DAY`, so the "Analyze website" button cannot be
  used to burn fetch budget in a loop.
- Each meaningful transition (website added, analysis started/finished, profile
  saved, competitors saved, queries saved) writes a row to `audit_logs`.

## Mock modes

Keep these `true` in development and CI (see `.env.local` / `.env.example`):

- `AI_MOCK_MODE=true` — query suggestions and profile drafting come from explicit
  call-site fixtures (`src/server/services/discovery/fixtures.ts`), not a model.
  The UI labels them "Mock AI suggestions — review before tracking".
- `DATAFORSEO_MOCK_MODE=true` — no DataForSEO calls or credits in this phase.

Nothing in Phase 2 invents search volume, CPC, traffic, or AI-visibility
metrics; priorities are always the qualitative QuerySide Priority labels.

## Database

Additive migration only: `drizzle/0001_tan_timeslip.sql` adds `business_profiles`,
`crawl_jobs`, `onboarding_states`, and `site_pages` (plus FKs/indexes) without
touching the Phase 0/1 tables. Workspace isolation is enforced by scoping every
read/write through the caller's `workspaceId` from the session — client-supplied
workspace IDs are never trusted.

## Tests

- Unit/integration: `src/server/services/crawler/*.test.ts`,
  `src/server/services/site-analysis-service.test.ts`,
  `src/features/onboarding/*.test.ts` (state machine, actions, isolation).
- E2E: `e2e/onboarding.spec.ts` (fresh signup, deep-link callback, SSRF-blocked
  honest failure + manual fallback, full manual walkthrough, completed passthru).
  Each test provisions its own email domain so parallel signups never collide on
  the workspace-slug uniqueness check, and the SSRF case uses the reserved
  `.invalid` TLD so the DNS pre-check refuses it with zero network traffic.

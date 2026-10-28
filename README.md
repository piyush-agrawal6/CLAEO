# QuerySide

**Search intelligence on your side.**

QuerySide is an SEO + AEO + GEO + AI search intelligence platform. It tracks how
your brand appears across Google and AI answer engines (ChatGPT, Gemini,
Perplexity, Google AI), shows why competitors win, and turns every visibility
gap into a prioritized action: what to fix first, and which competitor evidence
backs it.

> **Status:** Phases 0–3 are complete: foundation (0), authentication +
> marketing site (1), onboarding & discovery (2), and **intelligent search
> (3)** — real DataForSEO search data, a real AI visibility engine and the
> intelligence product pages (dashboard, AI visibility, prompts, competitors,
> citations, action center). See [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md)
> for the phase-by-phase plan, [docs/PHASE_3.md](docs/PHASE_3.md) for the
> Phase 3 summary and [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
> for the QuerySide brand/design contract.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack, `proxy.ts`) |
| Language | TypeScript (strict) |
| UI | React 19.3, Tailwind CSS v4, shadcn-style components, Lucide, Sonner |
| Auth | Auth.js (next-auth 5.0.0-beta.32), JWT sessions, credentials + optional Google |
| Database | PostgreSQL (Neon) via Drizzle ORM + `pg` driver |
| Cache / rate limits | Upstash Redis (in-memory fallback in dev/tests) |
| Email | Resend (dev log transport when no key) |
| Validation | Zod v4, React Hook Form |
| Tests | Vitest + Testing Library + PGlite (embedded Postgres), Playwright (e2e) |
| Deploy | Vercel |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
copy .env.example .env.local   # macOS/Linux: cp .env.example .env.local
# Fill in AUTH_SECRET (npx auth secret) and DATABASE_URL (Neon pooled URL).
# Everything else has safe development defaults.

# 3. Create the database schema
npm run db:generate            # SQL migration (committed in drizzle/)
npm run db:migrate             # apply it to DATABASE_URL

# 4. Run
npm run dev
```

Open http://localhost:3000, create an account, and you are in the dashboard.

**No database yet?** The app boots without `DATABASE_URL` — auth and data
pages fail gracefully until you add one. Provider mocks mean no API credits
are ever spent in development.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` / `lint:fix` | ESLint (zero warnings target) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier |
| `npm run test` / `test:watch` | Vitest unit + integration + component tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:push` | Push schema without migrations (prototyping) |
| `npm run db:studio` | Drizzle Studio |

## Environment

All configuration is documented in [`.env.example`](.env.example) and validated
by Zod at `src/lib/env.ts`. Highlights:

- **Mocks are the default:** `AI_MOCK_MODE=true`, `DATAFORSEO_MOCK_MODE=true` —
  development never calls a paid provider.
- **Cost guards:** daily `MAX_DATAFORSEO_REQUESTS_PER_DAY=25`,
  `MAX_LLM_REQUESTS_PER_DAY=100`, `MAX_DOMAIN_SCANS_PER_DAY=10`,
  `MAX_DAILY_PROVIDER_SPEND_USD=5`, plus per-scan caps
  (`MAX_PROVIDER_SPEND_PER_SCAN_USD=0.10`, `MAX_DATAFORSEO_REQUESTS_PER_SCAN=5`,
  `MAX_AI_REQUESTS_PER_SCAN=20`, …) — a default dev scan is ~$0.02 of
  DataForSEO data, and $0 with mocks. Details:
  [docs/COST_CONTROLS.md](docs/COST_CONTROLS.md),
  [docs/PROVIDER_COSTS.md](docs/PROVIDER_COSTS.md).
- `.env.local` is gitignored; `.env.example` is committed with empty values.

## Cost controls

Every paid operation must pass `canPerformPaidOperation()`
(`src/lib/usage/guards.ts`) before touching a provider: kill switch → daily
request limit → daily spend cap. Usage is recorded after every call (success
or not) so retries cannot runaway. Details:
[docs/COST_CONTROLS.md](docs/COST_CONTROLS.md).

## Security

- Nonce-based CSP + security headers via `src/proxy.ts` (Next 16 middleware)
- Route protection at the proxy **and** re-verification in every page/action
- Workspace resources always re-derived from the session membership (no IDOR)
- Single-use, SHA-256-hashed email-verification and password-reset tokens
- bcrypt password hashing, `sessionVersion` invalidates JWTs after reset
- Rate-limited auth actions (per IP and per email), enumeration-resistant flows
- Structured logs with automatic secret redaction

Details: [docs/SECURITY.md](docs/SECURITY.md).

## Project layout

```
src/
  app/                 Routes: landing page, (auth)/, (app)/, api/, error boundaries
  auth.ts, auth.config.ts, proxy.ts
  components/          UI kit (ui/), layout shell, marketing system (marketing/),
                       feature components
  features/            Server actions + queries per feature (auth, domains,
                        onboarding, prompts, competitors, intelligence, settings)
  lib/                 env, db, redis, security, usage guards, ai, providers
                       (dataforseo, ai), email, logging, errors, session helpers
  server/              repositories (workspace-scoped), services (incl. the
                        scan engine), jobs
drizzle/               Generated SQL migrations (committed)
e2e/                   Playwright specs
docs/                  Architecture, design system and phase documentation
```

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Layers, request flow, module boundaries |
| [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) | QuerySide brand, marketing design system, UI rules |
| [DATABASE](docs/DATABASE.md) | Schema, migrations, workspace scoping |
| [PROVIDERS](docs/PROVIDERS.md) | Provider abstraction and mock-first policy |
| [DATAFORSEO](docs/DATAFORSEO.md) | DataForSEO HTTP client, cache, costs |
| [AI_LAYER](docs/AI_LAYER.md) | AIService, structured output, injection guard |
| [SCAN_ENGINE](docs/SCAN_ENGINE.md) | Scan planning, idempotent worker, finalization |
| [AI_VISIBILITY](docs/AI_VISIBILITY.md) | Engine registry, Gemini/Groq adapters, mention detection |
| [SCORING](docs/SCORING.md) | Visibility formulas, coverage, null-score semantics |
| [PROVIDER_COSTS](docs/PROVIDER_COSTS.md) | Per-request cost estimates and per-scan budget |
| [SECURITY](docs/SECURITY.md) | Threat model and implemented controls |
| [COST_CONTROLS](docs/COST_CONTROLS.md) | Budget guards, kill switches, limits |
| [PHASE_3](docs/PHASE_3.md) | Phase 3 summary: what shipped, honesty invariants, caps |
| [MVP_ROADMAP](docs/MVP_ROADMAP.md) | Phase-by-phase delivery plan |
| [TESTING](docs/TESTING.md) | Test strategy and how to run each layer |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Vercel setup, env, migrations, checks |

## Honest-data policy

No fabricated metrics. Ever. If a number has no source query, the UI shows
`—` with an explanation. Mock providers require explicit fixtures per call
site and label their output `mocked: true`.

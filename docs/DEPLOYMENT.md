# Deployment

Target: **Vercel** (Next.js 16 App Router, Node runtime).

## 1. Repository

- `.env.local` / `.env*` are gitignored; only `.env.example` is committed.
- Generated SQL migrations in `drizzle/` **are** committed — deploy applies
  them, CI can diff them.

## 2. Provision

| Service | Needed for | Notes |
| --- | --- | --- |
| Neon Postgres | auth + all data | use the **pooled** connection string |
| Upstash Redis | rate limits, usage counters, cache, jobs | without it, dev-style in-memory fallback is used (never in prod — configure it) |
| Resend | verification/reset emails | verify your domain, set `EMAIL_FROM` |
| Vercel | hosting | Node.js functions (proxy runs at the edge) |

## 3. Environment variables

Copy `.env.example` and set production values:

```bash
NEXT_PUBLIC_APP_URL=https://app.claeo.example
AUTH_SECRET=<npx auth secret>
AUTH_URL=https://app.claeo.example
DATABASE_URL=<neon pooled ssl url>
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…
RESEND_API_KEY=…
EMAIL_FROM=Claeo <onboarding@yourdomain.com>

# Providers — mock modes are force-disabled in production by src/lib/env.ts,
# so real credentials must exist before AI/DataForSEO phases go live.
AI_MOCK_MODE=false            # (ignored in prod — hardening forces false)
DATAFORSEO_MOCK_MODE=false    # (ignored in prod — hardening forces false)
GEMINI_API_KEY=…
GROQ_API_KEY=…

# Cost guards — set deliberately per environment.
MAX_DATAFORSEO_REQUESTS_PER_DAY=25
MAX_LLM_REQUESTS_PER_DAY=100
MAX_DOMAIN_SCANS_PER_DAY=10
MAX_DAILY_PROVIDER_SPEND_USD=5
LOG_LEVEL=info
```

Hardening reminder (`src/lib/env.ts`): in production `AI_MOCK_MODE`,
`DATAFORSEO_MOCK_MODE`, `AUTH_DEV_AUTO_VERIFY` and `NEXT_PUBLIC_MOCK_MODE`
are **forced false** regardless of configuration. Until the real provider
adapters ship, non-mock AI/search calls throw a clear configuration error —
by design, no fake data in production.

## 4. Build & migrate

```bash
# Locally against production DB (or via a CI job):
npm ci
npm run db:generate   # only when schema changed (commit the result)
npm run db:migrate    # apply pending migrations to DATABASE_URL
```

Vercel build command stays default (`next build`); migrations run as a
separate step (release job / manual) — the app never auto-migrates at boot.

## 5. Post-deploy verification

1. `GET /api/health` → `{ "status": "ok", "checks": { "database": "ok", "redis": "upstash" } }`
   (production output omits detailed metrics).
2. Landing page loads; CSP header present (`script-src 'nonce-…'`).
3. `POST /signup` → verification email arrives (Resend), login works.
4. `/dashboard` redirects to `/login` when signed out; no "Mock providers"
   badge in the shell (mocks are off in production).
5. Confirm headers: HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
   `Permissions-Policy`.

## 6. Rollbacks & safety

- Schema: forward-only migrations in Phase 0/1; before risky changes add a
  down-migration policy (documented per migration).
- Env changes roll back by editing Vercel variables + redeploy.
- Kill switches (`setProviderDisabled`) stop provider spend without a deploy.
- Logs: JSON lines in Vercel — redaction guarantees secrets stay out even on
  error paths.

## Local production check

```bash
npm run lint && npm run typecheck && npm run test && npm run build
npm run start          # serve the production build locally
npm run test:e2e       # Playwright against the built server
```

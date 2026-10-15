# Testing

Four layers, all runnable locally with zero external services and zero paid
credits.

| Layer | Tool | Command | Scope |
| --- | --- | --- | --- |
| Unit | Vitest | `npm run test` | pure logic: env, guards, redaction, utils, AI retry, injection guard |
| Integration | Vitest + PGlite | `npm run test` | real migrations, repositories, services, token flows |
| Component | Vitest + jsdom + RTL | `npm run test` | auth/domain/settings form rendering |
| E2E | Playwright | `npm run test:e2e` | public pages, redirects, health, auth UX |

## Embedded Postgres for integration tests

`src/lib/db/test-db.ts` boots **PGlite** (PostgreSQL compiled to WASM) and
applies the actual generated migrations from `drizzle/`:

```ts
const testDb = await setupTestDb();   // migrate + register with setDbForTesting()
afterAll(() => testDb.close());
```

Consequences:

- Tests validate the **real schema** — a migration that would fail in
  production fails here first.
- `setDbForTesting()`-swapped `getDb()` means repositories/services run
  unmodified.
- No Docker, no Neon, no network; suites are hermetic and parallel-safe
  (each file gets its own instance; generous hook timeouts cover slow machines).

Coverage highlights:

- `migrations.test.ts` — all 22 tables exist; unique constraints enforced.
- `token-service.test.ts` — hashed-at-rest, single-use, expiry, per-email
  rotation of verification + reset tokens.
- `user-service.test.ts` — transactional signup, duplicate rejection, slug
  collision handling, membership resolution.
- `domain-repository.test.ts` — **cross-workspace read/update/delete all fail**
  (IDOR regression net).

## Unit tests of the safety rails

| File | Proves |
| --- | --- |
| `env.test.ts` | conservative defaults, no secret leakage, production hardening (mocks + dev auto-verify force-off) |
| `guards.test.ts` | daily limits, kill switches, spend cap, remaining quota, typed denial |
| `rate-limit.test.ts` | window enforcement, weighted attempts, IP extraction |
| `logger.test.ts` | recursive redaction, URL credential scrubbing, truncation |
| `password.test.ts` | bcrypt round-trip, unique salts, malformed-hash safety |
| `service.test.ts` | fixture requirement, schema rejection, retry-once, fallback, JSON extraction |
| `injection-guard.test.ts` | delimiter breakout neutralization, control chars, length cap |
| `utils.test.ts` | domain normalization, open-redirect blocking |

## Component tests

Docblock `// @vitest-environment jsdom`; server actions and `next/link` are
mocked with `vi.mock` so tests render pure UI:

- `login-form.test.tsx` — labels, autocomplete types, recovery/signup links,
  callbackUrl passthrough, notice display.

## E2E (Playwright)

`playwright.config.ts` builds and starts the production server automatically
(or reuses `PLAYWRIGHT_BASE_URL`). Phase 0/1 smoke suite (`e2e/smoke.spec.ts`)
covers: landing renders, login fields, health status, protected-route
redirect. Database-dependent journeys are added with the phases that create
them (signup → onboarding → scan in Phase 4+).

Run:

```bash
npx playwright install   # once: browser binaries
npm run test:e2e
```

## Conventions

- Deterministic only: no sleeps, no network, no randomness in assertions.
- Mock providers take explicit fixtures — tests never invent data either.
- LOG_LEVEL=silent in tests; the logger's behavior is asserted directly in
  `logger.test.ts`.
- CI order: `lint` → `typecheck` → `test` → `build` (then `test:e2e`).

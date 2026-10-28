# Testing

Four layers, all runnable locally with zero external services and zero paid
credits.

| Layer | Tool | Command | Scope |
| --- | --- | --- | --- |
| Unit | Vitest | `npm run test` | pure logic: env, guards, redaction, utils, AI retry, injection guard, scoring |
| Integration | Vitest + PGlite | `npm run test` | real migrations, repositories, services, token flows, the scan engine |
| Component | Vitest + jsdom + RTL | `npm run test` | auth/domain/settings form rendering |
| E2E | Playwright | `npm run test:e2e` | public pages, redirects, health, auth UX, the intelligence journey (mocked) |

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

- `migrations.test.ts` — every table from migrations 0000–0002 exists
  (31 total, incl. the Phase 3 scan tables); unique + partial-unique
  constraints enforced (scan-operation idempotency, workspace slug, email).
- `token-service.test.ts` — hashed-at-rest, single-use, expiry, per-email
  rotation of verification + reset tokens.
- `user-service.test.ts` — transactional signup, duplicate rejection, slug
  collision handling, membership resolution.
- `domain-repository.test.ts` — **cross-workspace read/update/delete all fail**
  (IDOR regression net).
- `scan.test.ts` (Phase 3) — full scan end-to-end on PGlite + in-memory Redis
  + mock providers: plan caps, honest data/scores, idempotent replay,
  auto-close, spend-cap skip, stale-resume crash recovery, cancellation,
  tenant isolation (8 tests). Zero network, zero spend by construction.
- `intelligence/queries.test.ts` (Phase 3) — read-model tenant isolation and
  null ("not enough data") semantics for scores, observations, share metrics
  and citations (6 tests).

## Provider & scoring tests

| File | Proves |
| --- | --- |
| `dataforseo.test.ts` (20) | Zod envelope validation, normalization + `omittedKeywords`, typed error classification, safe-only retry, Redis cache (7d/24h TTLs, hit recorded with units 0), guard-before/record-after |
| `ai.test.ts` (16) | mention detection + URL extraction (deterministic), real-adapter plumbing against a stubbed fetch (zero network), engine-registry honesty (planned engines never scannable) |
| `scoring.test.ts` (10) | both formulas, failed measurements excluded from the denominator, null-on-no-data, SoV/citation-share null semantics |

Provider tests stub the network with `vi.stubGlobal("fetch", …)` and always
call `vi.unstubAllGlobals()` in `afterEach` so a stub never leaks into the
next test.

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
(or reuses `PLAYWRIGHT_BASE_URL`). Suites:

- `e2e/smoke.spec.ts` — landing renders, login fields, health status,
  protected-route redirect.
- `e2e/intelligence.spec.ts` (Phase 3, mocked providers — zero spend, zero
  network) — signup → manual onboarding → fixture prompts → two-step-confirm
  scan from the dashboard launcher → scores, observations, actions and
  citations all render from persisted evidence → the free plan's
  1-scan-per-day cap denies a second start; plus auth-gating of every
  intelligence page. Fixture triggers (`fixture-nobrand`, `fixture-absent`)
  make the assertions exact and deterministic.

Run:

```bash
npx playwright install   # once: browser binaries
npm run test:e2e
```

**Signup rate limit vs. suite size.** Signup is intentionally capped at
5 attempts per 15 minutes per IP (hardcoded in
`src/features/auth/actions.ts` — the E2E suites create one fresh account
per test, and `onboarding.spec.ts` alone uses 5). Running all three
suites back-to-back against one server makes the 6th signup
(`intelligence.spec.ts`) hit the cap. When running against a dev server
(`PLAYWRIGHT_BASE_URL`), split the run in two invocations and restart the
server between them so the in-memory rate-limit counters reset:

```bash
npx playwright test e2e/intelligence.spec.ts
# restart the dev server, then:
npx playwright test e2e/smoke.spec.ts e2e/onboarding.spec.ts
```

This is a deliberate security property, not a test workaround: nothing
in the E2E setup weakens the auth rate limits.

## Conventions

- Deterministic only: no sleeps, no network, no randomness in assertions.
- Mock providers take explicit fixtures — tests never invent data either.
- Live provider checks are **opt-in only**: `ALLOW_LIVE_PROVIDER_TESTS=true`
  (default off, and force-disabled in production by env hardening). The
  default suite — local and CI — never calls a paid API.
- LOG_LEVEL=silent in tests; the logger's behavior is asserted directly in
  `logger.test.ts`.
- CI order: `lint` → `typecheck` → `test` → `build` (then `test:e2e`).

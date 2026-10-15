# Security

Threat model: a multi-tenant SaaS where users' competitive data, provider
budgets and auth credentials are all attack targets. This document lists what
is implemented in Phase 0/1.

## Browser/transport layer

**`src/proxy.ts`** (Next 16 middleware) runs on every matched request:

- **Nonce CSP** — a fresh `crypto.randomBytes(16)` nonce per request is set as
  `x-nonce`; Next.js attaches it to its inline scripts. Policy:
  `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests` in production.
- **Additional headers** (via `next.config.ts`): HSTS, `X-Content-Type-Options`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  restrictive `Permissions-Policy`.
- **Fast auth redirects** for protected path prefixes — with a sanitized
  `callbackUrl` (same-origin relative paths only, via `safeCallbackUrl`).

The proxy is *defense in depth*; every page and action re-verifies
authorization itself (below).

## Authentication (Auth.js v5)

- **Credentials provider**: Zod-validated input, bcrypt verify
  (`bcryptjs`, cost 10), constant-ish failure behavior for unknown users,
  and **email must be verified** before a session is issued.
- **JWT sessions** (30-day) with `sessionVersion` claim. Password reset bumps
  `users.session_version`; guarded requests compare token vs. DB — every
  previously issued JWT dies on next use.
- **Google OAuth** wired but dormant until credentials are configured;
  `allowDangerousEmailAccountLinking: false`.
- **Dev auto-verify** (`AUTH_DEV_AUTO_VERIFY`) only applies when there is no
  Resend key **and** `NODE_ENV !== "production"`, and is additionally
  force-disabled by env hardening.

## Session re-verification (pages & actions)

`src/lib/auth/session.ts` — every guarded surface repeats, from the DB:

1. JWT valid → `findUserById` exists?
2. email verified?
3. `sessionVersion` matches? (else sign out)
4. `getMembershipForUser(userId)` → the workspace **for this user**

The client never supplies a workspace id; resources are always addressed
through this membership. Repositories additionally filter by `workspaceId`
in SQL (`and(eq(id), eq(workspaceId))`) — **IDOR is blocked at the query
level**, proven by `domain-repository.test.ts`.

## Token handling

| Token | Storage | Lifetime | Reuse |
| --- | --- | --- | --- |
| Email verification | SHA-256 hash only | 24h | single use (deleted on consume) |
| Password reset | SHA-256 hash only | 1h | single use (`used_at`), old tokens invalidated on reissue |

Raw tokens exist only in emails. Verification is by hashing the presented
token and looking it up — constant-shape, no enumeration oracle (failures are
uniform, and reset responses never reveal whether the account exists).

## Rate limiting

Fixed-window counters in Redis (`lib/security/rate-limit.ts`), keyed per
policy (IP and email): login, signup, verification resend, password reset —
each with conservative per-window limits. Exhaustion throws `RateLimitError`
(429 + `retryAfterSeconds`). Infrastructure failure **fails open** but records
a `ratelimit.error` metric (availability over lockout; limits are per account
anyway).

## Input validation

- Zod v4 schemas at three levels: forms (RHF + zodResolver, client),
  server actions (authoritative), and DB transforms (`normalizeDomain`
  rejects implausible hosts before insert).
- Open-redirect prevention: `safeCallbackUrl` allows only same-origin
  relative paths (`/…`, rejects `//`, `/\`, absolute URLs, `javascript:`).

## Output/data hygiene

- **Log redaction** (`lib/logging/logger.ts`): recursive key-based
  (`password|secret|token|api key|authorization|cookie|credential|session|…`
  → `[REDACTED]`), URL basic-auth scrubbing, string/depth caps, error
  serialization without stacks in production.
- **API error mapping** (`toApiErrorResponse`): exposed AppErrors return their
  safe message; everything else becomes a generic 500 with a correlation id —
  no stack traces or SQL to clients.
- **Health endpoint** returns booleans only (no connection strings, versions
  or dependency details); detailed metrics are dev-only.
- No secrets in the repo: `.env*` gitignored (`.env.example` allowed),
  values validated at startup, `NEXT_PUBLIC_*` mapping is explicit.

## Abuse/cost protection

Provider-budget abuse is treated as a security issue: kill switches + daily
limits + spend caps (see [COST_CONTROLS.md](COST_CONTROLS.md)) stop both
runaway code and a compromised account from draining provider credit.

## Known limitations (later phases)

- No 2FA/MFA yet (roadmap: post-MVP).
- No CSRF token beyond SameSite cookies + server-action origin checks
  (Next.js built-ins) — reviewed again when billing webhooks land.
- Stripe webhook signature verification arrives with the billing phase.
- Content-Security-Policy `connect-src` allows localhost websockets in dev
  only; production is `'self'`.

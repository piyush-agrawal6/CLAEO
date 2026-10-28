# Google Sign-in (Auth.js)

QuerySide uses Auth.js v5's built-in Google provider (`next-auth` →
`@auth/core 0.41.3`). There is **no custom OAuth implementation**: Google
sign-in and Google sign-up are the same route — provisioning decisions
happen inside the shared OAuth callback.

## Environment variables

| Variable                | Where                                              |
| ----------------------- | -------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | `.env.local` (dev), deployment env vars (prod)     |
| `GOOGLE_CLIENT_SECRET`  | `.env.local` (dev), deployment env vars (prod)     |

Both come from **one Google Cloud OAuth client** — the same app is reused
later for Google Search Console (see `.env.example`). The provider is
registered only when both values are present; otherwise the
"Continue with Google" button still renders but fails fast with a friendly
`/login?error=Configuration` message. No `localhost` value is ever written
into production configuration — callback URLs are derived from the request
origin (`trustHost`).

## Callback URLs (Google Cloud Console → Credentials → OAuth 2.0 Client)

The Auth.js callback route is `POST/GET /api/auth/callback/google`:

| Environment        | Authorized redirect URI                          |
| ------------------ | ------------------------------------------------ |
| Development        | `http://localhost:3000/api/auth/callback/google` |
| Production         | `https://queryside.com/api/auth/callback/google` |

Add the production URI **before** first production sign-in. The development
URI belongs only in the dev client (or the same client during development) —
never add `http://localhost:*` to production-only configuration.

Authorized JavaScript origin (same client):

- Development: `http://localhost:3000`
- Production: `https://queryside.com`

## Flows

### New Google user

```
Google OAuth → verified identity (id_token claims)
  → signIn callback gate: profile.email_verified === true (else AccessDenied)
  → adapter.createUser()      → non-persisting stub (session subject only)
  → adapter.linkAccount()     → ONE transaction:
        users row (emailVerified = now, passwordHash = null)
      + accounts row (google provider)
      + default workspace (name/slug from email domain, plan free)
      + workspace_members row (role owner)
  → JWT session (30-day, sessionVersion carried)
  → pages.newUser redirect → /onboarding?callbackUrl=<original>
```

Failure at any point rolls back everything: no orphan users, no workspace
without an owner, no account without a user.

### Existing Google-linked user

Auth.js `getUserByAccount` fast path → tokens updated → session issued →
sanitized destination (default `/dashboard`).

### Existing email/password user, same email

**Account linking is enabled — under a verified-email condition**
(`allowDangerousEmailAccountLinking: true` on the Google provider):

- Auth.js's default (`false`) refuses to link and surfaces
  `OAuthAccountNotLinked`, which would strand every existing QuerySide user
  who tries Google.
- The flag alone would be unsafe (Auth.js links by email without checking
  verification), **so the shared `signIn` callback in
  `src/auth.config.ts` requires `profile.email_verified === true` on the
  raw Google OIDC profile before `handleLoginOrRegister` runs** — the
  `allowDangerousEmailAccountLinking` branch can therefore only ever
  execute for a provider-verified email. Client-supplied claims are never
  consulted.
- The provisioning service repeats the same checks on the `id_token`
  (strict `email_verified === true`, `sub` bound to `providerAccountId`,
  token email must resolve to the same user Auth.js selected) — defense in
  depth; a mismatch aborts with nothing persisted.
- Linking attaches the provider account to the **existing** user and
  workspace; a duplicate user/workspace is impossible (unique email, in-TX
  checks).

If Google ever returns an unverified email, the attempt is blocked with
`AccessDenied` and the login page suggests creating an account with email.

## Redirects after authentication

- New OAuth users → `/onboarding` via `pages.newUser` (Auth.js appends the
  original `callbackUrl`).
- Credentials sign-ins → `resolvePostAuthRedirect`
  (`src/features/auth/redirects.ts`): incomplete onboarding →
  `/onboarding` (deep links preserved as a sanitized `?callbackUrl=`);
  complete → sanitized callback (default `/dashboard`).
- Every candidate destination passes `safeCallbackUrl` — open redirects are
  impossible (`javascript:`, `//evil.example`, absolute foreign URLs →
  fallback).
- Onboarding completeness predicate:
  `isOnboardingComplete(userId)` (`src/server/services/onboarding-service.ts`)
  — Part A: workspace has ≥ 1 domain; Phase 2 will extend it with the
  persisted onboarding state machine.

## Error surface (`/login?error=…`)

| Code                    | Message meaning                                        |
| ----------------------- | ------------------------------------------------------ |
| `AccessDenied`          | Google email not provider-verified (sign-in gate)      |
| `OAuthAccountNotLinked` | Legacy: linking refused (should not occur)             |
| `OAuthCallback`         | Problem completing the Google round-trip               |
| `Configuration`         | Google provider not configured / unexpected failure    |
| `RateLimited`           | Too many OAuth initiations from this network           |
| anything else           | Generic fallback message                               |

## Security properties preserved

- OAuth `state` validation, PKCE/nonce handling and CSRF protection stay
  entirely inside Auth.js — never bypassed.
  - Cookies stay Auth.js-managed (secure, HttpOnly, sameSite defaults);
  `sessionVersion` revalidation in `src/lib/auth/session.ts` is untouched.
- Workspace isolation: the provider account is only ever attached to the
  user the token's verified email resolves to; onboarding never accepts
  client-supplied workspace ids.
- OAuth initiation is rate-limited per IP (`auth:google:ip:*`).

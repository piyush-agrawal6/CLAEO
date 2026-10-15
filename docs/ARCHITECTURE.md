# Architecture

Claeo is a Next.js App Router application with a strict layering model: routes
delegate to features, features delegate to services/repositories, and all
external I/O goes through provider modules with enforced cost guards.

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Routes (src/app)                                                │
│   server components · server actions · route handlers           │
├─────────────────────────────────────────────────────────────────┤
│ Guards (run first, always)                                      │
│   src/proxy.ts        CSP nonce + fast auth redirect            │
│   lib/auth/session    requirePageAuth / requirePageWorkspace     │
│   lib/usage/guards    canPerformPaidOperation (before any $)     │
├─────────────────────────────────────────────────────────────────┤
│ Features (src/features)                                         │
│   actions.ts   "use server" mutations (Zod-validated, scoped)   │
│   queries.ts   read models for pages                            │
├─────────────────────────────────────────────────────────────────┤
│ Server core (src/server)                                        │
│   repositories   workspace-scoped persistence (IDOR-safe)        │
│   services       multi-aggregate operations (signup, tokens)     │
│   jobs           queue + workers (phases 4+)                    │
├─────────────────────────────────────────────────────────────────┤
│ Libraries (src/lib)                                             │
│   env · db · redis · security · usage · ai · providers/search    │
│   email · logging · errors · auth/session · utils               │
└─────────────────────────────────────────────────────────────────┘
```

### Rules

1. **Client components never read data directly.** Pages fetch via queries;
   mutations go through server actions. Client components receive only what
   they render.
2. **The workspace is never client-supplied.** Every action/page derives it
   from the signed-in user's membership (`getMembershipForUser`). A client
   passing `workspaceId` or `domainId` of another tenant changes nothing.
3. **Server actions export async functions only.** Shared state types live in
   sibling `schemas.ts` modules (Next.js constraint).
4. **No provider call without a guard.** Anything costing money calls
   `canPerformPaidOperation()` first and `recordUsage()` after.
5. **No fabricated data.** Metrics without queries render `—` plus an explicit
   empty state.

## Request flow

```
browser request
  └─ proxy.ts (Next 16 middleware)
       ├─ attach CSP nonce (x-nonce header → Next inline scripts)
       ├─ unauthenticated → /login?callbackUrl=…   (fast path only)
       └─ continues to route
            └─ page/layout server component
                 ├─ requirePageWorkspace()
                 │    ├─ auth() → JWT
                 │    ├─ findUserById → exists? verified? sessionVersion?
                 │    └─ getMembershipForUser → workspace for THIS user
                 ├─ queries (workspace-scoped repositories)
                 └─ render (real data or explicit empty state)
```

Server actions repeat steps 2–4 themselves; the proxy is defense in depth,
never the security boundary.

## Auth model

- **JWT sessions** (30 days) via Auth.js credentials provider; bcrypt verify;
  email must be verified before a session is issued.
- **`sessionVersion`** on the user row is embedded in the JWT; password reset
  bumps it, and every guarded request compares versions — old tokens die.
- **Email verification / password reset** use app-managed single-use tokens
  (SHA-256 stored, 24h / 1h expiry) rather than Auth.js database tokens, so
  flows are rate-limitable and enumeration-resistant.
- **Google OAuth** is configured but disabled until credentials exist
  (architecture ready in phases 0–1).

## Module boundaries

| Concern | Module | Notes |
| --- | --- | --- |
| Env | `lib/env.ts` | Zod-validated; import never throws at build |
| DB | `lib/db/index.ts` | Lazy pool; tests swap PGlite via `setDbForTesting` |
| Redis | `lib/redis/index.ts` | Upstash; in-memory fallback outside production |
| Errors | `lib/errors.ts` | AppError taxonomy + `toApiErrorResponse` |
| Logging | `lib/logging/logger.ts` | JSON lines, recursive redaction |
| AI | `lib/ai/service.ts` | Only AI entry point for business logic |
| Search data | `lib/providers/search/` | DataForSEO abstraction (mock-first) |

## Styling system

`globals.css` defines shadcn-compatible tokens (zinc neutrals + blue accent,
light/dark). Components consume semantic tokens (`bg-card`, `text-muted-foreground`)
only — no hardcoded colors — so theming stays global and consistent.

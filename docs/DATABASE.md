# Database

PostgreSQL (Neon in production) via Drizzle ORM. All schema lives in
`src/lib/db/schema/`, generated SQL migrations in `drizzle/`.

## Conventions

- `text` primary keys defaulting to `crypto.randomUUID()` (no sequences to
  collide across environments).
- `created_at` / `updated_at` timestamps with timezone; `updated_at` has
  `$onUpdate`.
- Foreign keys explicitly `onDelete: "cascade"` (or `set null` where history
  matters).
- Enums implemented as `text` with `$type<Union>()` — portable, readable in
  SQL, validated at the application layer by Zod.

## Tables (22)

### Identity & access
| Table | Purpose |
| --- | --- |
| `users` | Credentials + profile; `password_hash` (bcrypt), `session_version` |
| `accounts` | OAuth account links (Auth.js adapter) |
| `sessions` | DB session rows (Auth.js adapter; JWTs are used in practice) |
| `verification_tokens` | Email verification: SHA-256 hash + expiry, single use |
| `password_reset_tokens` | Reset: hash, expiry, `used_at` (single use) |

### Workspace & billing
| Table | Purpose |
| --- | --- |
| `workspaces` | Tenant root: name, unique slug, owner, plan |
| `workspace_members` | User ↔ workspace with role (`owner`/`admin`/`member`) |
| `usage_records` | Durable per-call usage (provider, units, estimated cost) |
| `subscriptions` | Stripe subscription state (billing phase) |
| `notifications` | In-app notices |
| `audit_logs` | Security/product audit trail (actor, action, target, ip/ua) |

### Domain & AI visibility
| Table | Purpose |
| --- | --- |
| `domains` | Tracked sites; normalized unique per workspace, status lifecycle |
| `competitors` | Tracked competitors per workspace |
| `prompts` | Tracked questions (category, locale, group, enabled) |
| `ai_engines` | Engines we track (seeded, toggleable) |
| `visibility_runs` | Scan executions (scope, status, counts, timings) |
| `visibility_results` | Per run × prompt × engine: rank, mentioned, position, snippet |
| `citations` | Sources AI answers cited (share, first/last seen) |
| `competitor_mentions` | Who gets mentioned when we don't (share of voice) |

### Audit & action center
| Table | Purpose |
| --- | --- |
| `page_audits` | Page-level AEO audit snapshots (score, page stats) |
| `audit_issues` | Individual rule findings per audit |
| `recommendations` | Prioritized actions with effort/impact/confidence + evidence |

## Workspace scoping (IDOR protection)

Every repository function takes `workspaceId` **first** and includes it in the
`WHERE` clause — reads, updates and deletes alike:

```ts
// src/server/repositories/domain-repository.ts
export async function getDomainById(workspaceId: string, id: string) {
  return db.select().from(domains)
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)))
    .limit(1);
}
```

`workspaceId` itself is never read from client input: pages/actions resolve it
from the session user's membership. `domain-repository.test.ts` proves
cross-workspace read/update/delete all fail.

## Migrations

- `npm run db:generate` — schema diff → new SQL file in `drizzle/` (committed).
- `npm run db:migrate` — apply pending migrations to `DATABASE_URL`.
- `npm run db:push` — direct schema push (prototyping only).
- `npm run db:studio` — browse data.

Migrations are generated without a live database (drizzle-kit reads the TS
schema), so CI and local machines need no connection to produce them.

## Testing the real schema

Integration tests run the **actual generated migrations** against PGlite
(embedded PostgreSQL, `@electric-sql/pglite`):

```ts
// src/lib/db/test-db.ts
const client = new PGlite();
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
setDbForTesting(db);
```

If a migration would fail in production, these tests fail in CI first.

## Connection management

`lib/db/index.ts` creates the `pg` `Pool` lazily on first query (max 5
connections, 10s connect timeout), attaches an error handler so a dropped
backend never crashes the process, and never requires a database at build
time. `pingDb()` backs the health endpoint.

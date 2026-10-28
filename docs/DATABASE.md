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

## Tables (31 across migrations 0000–0002)

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
| `visibility_results` | Per run × prompt × engine: mention flag/count + context, answer text, model, latency, token usage, cost |
| `citations` | Sources AI answers linked (`kind`: `provider` vs `extracted`, position, owned/competitor flags) |
| `competitor_mentions` | Who gets mentioned when we don't (share of voice) |

### Onboarding (Phase 2)
| Table | Purpose |
| --- | --- |
| `business_profiles` | Classified business per domain (name, category, entities) |
| `crawl_jobs` / `site_pages` | SSRF-guarded homepage crawl results |
| `onboarding_states` | Per-workspace wizard progress |

### Scan evidence (Phase 3, migration 0002)
| Table | Purpose |
| --- | --- |
| `intelligence_scans` | Scan batch: status, trigger, market, operation counters, accumulated `provider_cost_usd`, `mocked`, persisted scores + formula versions + coverage |
| `scan_operations` | Resumable work items: unique (scan, operation key), `attempts`, sanitized `error` + `error_class` |
| `keyword_metrics` | Per scan × keyword DataForSEO metrics — every field nullable, plus `cache_hit` / `mocked` |
| `serp_snapshots` / `serp_results` | Live SERP check per keyword (`tracked_domain_rank`, null = absent) + result rows (rank, type, tracked/competitor flags) |

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

## Migration 0002 — intelligence (additive only)

`drizzle/0002_little_supreme_intelligence.sql` adds the Phase 3 schema
**additively** — migrations 0000/0001 are never edited; every change is a new
`CREATE TABLE` / `ADD COLUMN` / index / seed statement:

- **New tables:** `intelligence_scans`, `scan_operations`, `keyword_metrics`,
  `serp_snapshots`, `serp_results` (listed above).
- **New columns:** `visibility_runs` (+`scan_id`, `mocked`),
  `visibility_results` (+mention count/context, model, latency,
  `provider_request_id`, token usage, cost), `citations` (+`kind`,
  `position`, owned/competitor flags), `recommendations` (+`competitor_id`,
  `source_scan_id`, `dedup_key`), `usage_records` (+workspace/domain/scan/run
  correlation, `cache_hit`, `success`, `error_class`, `actual_cost_usd`),
  `ai_engines` (+`provider`, `mode`, capability flags, `source_description`).
- **`ai_engines` seed:** 7 rows (`ON CONFLICT (key) DO NOTHING`) — two
  engines with real adapters (`gemini`, `llama`) and five honestly `planned`
  ("coming soon"), each with a `source_description` explaining why. See
  [AI_VISIBILITY.md](AI_VISIBILITY.md).

Constraints the application code must respect:

- `visibility_runs_scan_prompt_engine_unique` is a **partial** unique index:
  `(scan_id, prompt_id, engine) WHERE scan_id IS NOT NULL`. Drizzle's
  `onConflictDoUpdate` must repeat the predicate (`targetWhere:
  sql\`"scan_id" IS NOT NULL\``) — Postgres cannot use a partial index for
  an inference missing the WHERE clause.
- Full uniques backing idempotent upserts: `keyword_metrics (scan_id,
  keyword)`, `serp_snapshots (scan_id, keyword)`,
  `competitor_mentions (result_id, competitor_id)`.
- `recommendations_domain_dedup_unique` is partial:
  `(domain_id, dedup_key) WHERE dedup_key IS NOT NULL` — re-scans refresh
  the existing row instead of stacking duplicates.

## Testing the real schema

Integration tests run the **actual generated migrations** against PGlite
(embedded PostgreSQL, `@electric-sql/pglite`), including 0002's new tables
and partial unique indexes:

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

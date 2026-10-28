import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

/**
 * Validates that the generated migration in ./drizzle applies cleanly to an
 * embedded PostgreSQL and produces the full Phase 0/1 schema.
 */
describe("database migrations", () => {
  let db: PgliteDatabase<typeof schema>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
  });

  afterAll(async () => {
    await close();
  });

  it("applies the initial migration without errors", async () => {
    expect(db).toBeDefined();
  });

  it("creates every core table", async () => {
    const result = (await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `)) as unknown as { rows?: Array<{ table_name: string }> };
    const tables = (result.rows ?? []).map((row) => row.table_name);

    // Auth
    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "accounts",
        "sessions",
        "verification_tokens",
        "password_reset_tokens",
      ])
    );
    // Workspace + billing
    expect(tables).toEqual(
      expect.arrayContaining([
        "workspaces",
        "workspace_members",
        "usage_records",
        "subscriptions",
        "audit_logs",
        "notifications",
      ])
    );
    // Domains + visibility
    expect(tables).toEqual(
      expect.arrayContaining([
        "domains",
        "competitors",
        "prompts",
        "ai_engines",
        "visibility_runs",
        "visibility_results",
        "citations",
        "competitor_mentions",
      ])
    );
    // Audit + action center
    expect(tables).toEqual(
      expect.arrayContaining(["page_audits", "audit_issues", "recommendations"])
    );
    // Phase 3 intelligence (additive migration 0002)
    expect(tables).toEqual(
      expect.arrayContaining([
        "intelligence_scans",
        "scan_operations",
        "keyword_metrics",
        "serp_snapshots",
        "serp_results",
      ])
    );

    // Safety net against catastrophic regression (the named assertions above
    // are the real inventory). 31 tables as of additive migration 0002 —
    // raise this when a future migration legitimately adds tables.
    expect(tables.length).toBeGreaterThanOrEqual(31);
  });

  it("seeds the AI engine registry with honest modes", async () => {
    const engines = await db.select().from(schema.aiEngines);
    expect(engines.length).toBeGreaterThanOrEqual(7);
    const byKey = new Map(engines.map((e) => [e.key, e]));
    // Real adapters exist for these two only; the rest are honestly "planned".
    expect(byKey.get("gemini")?.mode).toBe("real");
    expect(byKey.get("llama")?.mode).toBe("real");
    for (const key of ["chatgpt", "perplexity", "google_ai_mode", "claude", "copilot"]) {
      expect(byKey.get(key)?.mode).toBe("planned");
      expect(byKey.get(key)?.supportsCitations).toBe(false);
    }
  });

  it("enforces scan operation idempotency (unique scan + operation key)", async () => {
    const now = new Date();
    const user = (
      await db
        .insert(schema.users)
        .values({
          name: "Scan Owner",
          email: `scan-owner-${now.getTime()}@example.com`,
          passwordHash: "x",
          emailVerified: now,
        })
        .returning()
    )[0]!;
    const workspace = (
      await db
        .insert(schema.workspaces)
        .values({ name: "Scan WS", slug: `scan-ws-${now.getTime()}`, ownerId: user.id })
        .returning()
    )[0]!;
    const domain = (
      await db
        .insert(schema.domains)
        .values({
          workspaceId: workspace.id,
          domain: "https://scan.example.com",
          normalizedDomain: "scan.example.com",
        })
        .returning()
    )[0]!;
    const scan = (
      await db
        .insert(schema.intelligenceScans)
        .values({ workspaceId: workspace.id, domainId: domain.id })
        .returning()
    )[0]!;

    const op = { scanId: scan.id, kind: "serp" as const, operationKey: "serp:example" };
    await db.insert(schema.scanOperations).values(op);
    await expect(db.insert(schema.scanOperations).values(op)).rejects.toThrow();
  });

  it("enforces workspace slug uniqueness at the database level", async () => {
    const now = new Date();
    const insert = async (slug: string) => {
      await db.insert(schema.workspaces).values({
        name: "Slug Test",
        slug,
        ownerId: (await db.insert(schema.users).values({
          name: "Slug Owner",
          email: `owner-${slug}@example.com`,
          passwordHash: "x",
          emailVerified: now,
        }).returning())[0]!.id,
      });
    };

    await insert("unique-slug-test");
    await expect(insert("unique-slug-test")).rejects.toThrow();
  });

  it("enforces email uniqueness", async () => {
    const email = "duplicate@example.com";
    await db.insert(schema.users).values({
      name: "A",
      email,
      passwordHash: "x",
    });
    await expect(
      db.insert(schema.users).values({ name: "B", email, passwordHash: "x" })
    ).rejects.toThrow();
  });
});

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

    expect(tables.length).toBeGreaterThanOrEqual(22);
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

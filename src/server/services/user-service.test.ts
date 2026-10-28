import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { workspaceMembers, workspaces, users } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import {
  createUserWithWorkspace,
  withSlugCollisionRetry,
  MAX_SLUG_INSERT_ATTEMPTS,
  isSlugCollision,
  nextSlugCandidate,
} from "@/server/services/user-service";
import { findUserByEmail } from "@/server/repositories/user-repository";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";
import { verifyPassword } from "@/lib/security/password";
import { eq, like } from "drizzle-orm";

describe("createUserWithWorkspace (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("creates user, workspace and owner membership atomically", async () => {
    const result = await createUserWithWorkspace({
      name: "Jane Doe",
      email: "Jane@Acme.io", // normalized to lowercase
      password: "Sup3rSecret!",
    });

    const db = getDb();
    const user = await findUserByEmail("jane@acme.io");
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Jane Doe");
    expect(user!.email).toBe("jane@acme.io");
    expect(await verifyPassword("Sup3rSecret!", user!.passwordHash ?? "")).toBe(true);
    expect(user!.emailVerified).toBeNull();

    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, result.workspaceId));
    expect(workspaceRows).toHaveLength(1);
    expect(workspaceRows[0]!.name).toBe("Acme"); // derived from email domain
    expect(workspaceRows[0]!.slug).toBe("acme");
    expect(workspaceRows[0]!.plan).toBe("free");
    expect(workspaceRows[0]!.ownerId).toBe(result.userId);

    const membershipRows = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, result.userId));
    expect(membershipRows).toHaveLength(1);
    expect(membershipRows[0]!.role).toBe("owner");
    expect(membershipRows[0]!.workspaceId).toBe(result.workspaceId);

    expect(result.emailVerified).toBe(false);
  });

  it("rejects duplicate emails with a conflict error", async () => {
    await createUserWithWorkspace({
      name: "Dup One",
      email: "dup@example.com",
      password: "Sup3rSecret!",
    });

    await expect(
      createUserWithWorkspace({
        name: "Dup Two",
        email: "dup@example.com",
        password: "Sup3rSecret!",
      })
    ).rejects.toBeInstanceOf(ConflictError);

    // Exactly one user with that email exists.
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, "dup@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("disambiguates workspace slugs on collision", async () => {
    await createUserWithWorkspace({
      name: "First Acme",
      email: "one@shared-corp.com",
      password: "Sup3rSecret!",
    });
    const second = await createUserWithWorkspace({
      name: "Second Acme",
      email: "two@shared-corp.com",
      password: "Sup3rSecret!",
    });

    expect(second.workspaceId).toBeTruthy();
    const db = getDb();
    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, second.workspaceId));
    expect(workspace[0]!.slug).toBe("shared-corp-2");
  });

  it("resolves the membership with workspace for the owner", async () => {
    const result = await createUserWithWorkspace({
      name: "Member Check",
      email: "member@example.com",
      password: "Sup3rSecret!",
    });

    const membership = await getMembershipForUser(result.userId);
    expect(membership).not.toBeNull();
    expect(membership!.workspace.id).toBe(result.workspaceId);
    expect(membership!.role).toBe("owner");

    const nonMember = await getMembershipForUser("does-not-exist");
    expect(nonMember).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Slug concurrency: the DB unique constraint is the arbiter, and the
  // insert retries with the next candidate on collision (TOCTOU fix).
  // ---------------------------------------------------------------------

  it("withSlugCollisionRetry retries with the next candidate on a slug collision", async () => {
    // Simulate the race outcome: another signup grabbed "racebase" AFTER our
    // availability pre-check returned it as free, so the FIRST insert attempt
    // raises 23505 on workspaces_slug_unique and the retry must use "racebase-2".
    const attempts: string[] = [];
    const result = await withSlugCollisionRetry("racebase", async (slug) => {
      attempts.push(slug);
      if (attempts.length === 1) {
        // Real PGlite/pg error shape: SQLSTATE + constraint name.
        throw Object.assign(new Error('duplicate key value violates unique constraint "workspaces_slug_unique"'), {
          code: "23505",
          constraint: "workspaces_slug_unique",
        });
      }
      return { slug };
    });

    expect(attempts).toEqual(["racebase", "racebase-2"]);
    expect(result.slug).toBe("racebase-2");
  });

  it("withSlugCollisionRetry unwraps a drizzle-wrapped (cause-chain) collision", async () => {
    // Drizzle surfaces driver failures as DrizzleQueryError with the SQLSTATE
    // on `.cause`; the retry must still recognize it as a slug collision.
    const inner = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "workspaces_slug_unique",
    });
    const wrapped = Object.assign(new Error("Failed query"), { cause: inner });

    let calls = 0;
    const result = await withSlugCollisionRetry("wrapped", async (slug) => {
      calls += 1;
      if (calls === 1) throw wrapped;
      return { slug };
    });

    expect(calls).toBe(2);
    expect(result.slug).toBe("wrapped-2");
  });

  it("withSlugCollisionRetry gives up after the bounded attempt count", async () => {
    const slugErr = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "workspaces_slug_unique",
    });
    let calls = 0;

    await expect(
      withSlugCollisionRetry("busy", async () => {
        calls += 1;
        throw slugErr;
      })
    ).rejects.toThrow(/unique workspace slug/);

    expect(calls).toBe(MAX_SLUG_INSERT_ATTEMPTS);
  });

  it("two concurrent same-domain signups get distinct slugs and both succeed", async () => {
    const [a, b] = await Promise.all([
      createUserWithWorkspace({
        name: "Concurrent A",
        email: "a@concurrent-corp.com",
        password: "Sup3rSecret!",
      }),
      createUserWithWorkspace({
        name: "Concurrent B",
        email: "b@concurrent-corp.com",
        password: "Sup3rSecret!",
      }),
    ]);

    const db = getDb();
    const slugs = (
      await db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(like(workspaces.slug, "concurrent-corp%"))
    ).map((r) => r.slug);

    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.sort()).toEqual(["concurrent-corp", "concurrent-corp-2"]);
    expect(a.workspaceId).not.toBe(b.workspaceId);
  });

  it("nextSlugCandidate walks base, base-2, base-3", () => {
    expect(nextSlugCandidate("acme", 0)).toBe("acme");
    expect(nextSlugCandidate("acme", 1)).toBe("acme-2");
    expect(nextSlugCandidate("acme", 2)).toBe("acme-3");
  });

  it("isSlugCollision matches only the workspace slug constraint", () => {
    expect(isSlugCollision({ code: "23505", constraint: "workspaces_slug_unique" })).toBe(
      true
    );
    // A different unique constraint (e.g. users email) must NOT be retried.
    expect(isSlugCollision({ code: "23505", constraint: "users_email_unique" })).toBe(
      false
    );
    expect(isSlugCollision({ code: "23503", constraint: "workspaces_slug_unique" })).toBe(
      false
    );
    expect(isSlugCollision(new Error("boom"))).toBe(false);
    expect(isSlugCollision(null)).toBe(false);
  });
});

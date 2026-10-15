import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { workspaceMembers, workspaces, users } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { createUserWithWorkspace } from "@/server/services/user-service";
import { findUserByEmail } from "@/server/repositories/user-repository";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";
import { verifyPassword } from "@/lib/security/password";
import { eq } from "drizzle-orm";

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
});

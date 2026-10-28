import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { accounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createQuerysideAdapter } from "@/auth-adapter";
import { makeGoogleIdToken } from "@/server/services/oauth-fixtures";

/**
 * Adapter-level tests: the seam between Auth.js `handle-login` and our
 * transactional provisioning (stub `createUser` + full `linkAccount`).
 */

const base: Adapter = {}; // passthrough-only base; each test calls the two overridden methods

describe("createQuerysideAdapter (PGlite)", () => {
  let testDb: TestDb;
  let adapter: Adapter;

  beforeAll(async () => {
    testDb = await setupTestDb();
    adapter = createQuerysideAdapter(base);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("createUser returns a non-persisting stub with an app-local id", async () => {
    const profile: AdapterUser = {
      id: "google-sub-persists-never", // provider subject must NOT become the user id
      name: "Stub User",
      email: "stub@stub-test.com",
      image: null,
      emailVerified: null,
    };

    const stub = await adapter.createUser!(profile);

    expect(stub.id).toBeTruthy();
    expect(stub.id).not.toBe(profile.id);
    expect(stub.email).toBe("stub@stub-test.com");

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, "stub@stub-test.com"));
    expect(rows).toHaveLength(0); // nothing written until linkAccount
  });

  it("persists user + account + workspace + membership when linkAccount runs", async () => {
    const profile: AdapterUser = {
      id: "sub-flow-full",
      name: "Full Flow",
      email: "full@adapter-flow.com",
      image: "https://example.com/full.png",
      emailVerified: null,
    };

    const stub = await adapter.createUser!(profile);

    const account: AdapterAccount = {
      type: "oauth",
      provider: "google",
      providerAccountId: "sub-flow-full",
      userId: stub.id,
      id_token: makeGoogleIdToken({
        sub: "sub-flow-full",
        email: "full@adapter-flow.com",
        email_verified: true,
        name: "Full Flow",
        picture: "https://example.com/full.png",
      }),
    };

    await adapter.linkAccount!(account);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, stub.id));
    expect(user).toBeDefined();
    expect(user!.emailVerified).toBeInstanceOf(Date);

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-flow-full"));
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]!.userId).toBe(stub.id);

    const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.ownerId, stub.id));
    expect(workspaceRows).toHaveLength(1);

    const memberRows = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, stub.id));
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]!.role).toBe("owner");
  });

  it("leaves no partial state when linkAccount fails (atomicity)", async () => {
    const profile: AdapterUser = {
      id: "sub-will-fail",
      name: "Will Fail",
      email: "fail@adapter-fail.com",
      image: null,
      emailVerified: null,
    };

    const stub = await adapter.createUser!(profile);

    await expect(
      adapter.linkAccount!({
        type: "oauth",
        provider: "google",
        providerAccountId: "sub-will-fail",
        userId: stub.id,
        id_token: "totally.broken.token",
      })
    ).rejects.toThrow();

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, "fail@adapter-fail.com"));
    expect(rows).toHaveLength(0); // stub was never persisted; failed TX rolled back
    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-will-fail"));
    expect(accountRows).toHaveLength(0);
  });

  it("keeps base adapter methods (pass-through)", async () => {
    expect(adapter.getUserByEmail).toBeUndefined(); // base was empty — pass-through preserves absence
    const withBase = createQuerysideAdapter({
      getUserByEmail: async (email) => ({
        id: "x",
        email,
        emailVerified: null,
        name: null,
        image: null,
      }),
    });
    await expect(withBase.getUserByEmail!("x@y.z")).resolves.toMatchObject({ id: "x" });
    // Overrides still apply on the composed adapter:
    expect(withBase.createUser).not.toBe(base.createUser);
  });
});

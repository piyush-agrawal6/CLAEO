import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { accounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import {
  decodeGoogleIdentity,
  provisionGoogleAccount,
} from "@/server/services/oauth-provisioning-service";
import { makeGoogleAccount, makeGoogleIdToken } from "@/server/services/oauth-fixtures";
import { createUserWithWorkspace } from "@/server/services/user-service";

describe("provisionGoogleAccount (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("creates user, provider account, workspace and owner membership in one transaction", async () => {
    const userId = crypto.randomUUID();
    const account = makeGoogleAccount({
      userId,
      providerAccountId: "sub-new-1",
      id_token: makeGoogleIdToken({
        sub: "sub-new-1",
        email: "New.Person@Example-New.com",
        email_verified: true,
        name: "New Person",
        picture: "https://example.com/avatar.png",
      }),
      access_token: "at-1",
      scope: "openid email profile",
      expires_at: 3600,
      token_type: "Bearer",
    });

    const result = await provisionGoogleAccount(account);
    expect(result).toMatchObject({ userId, isNewUser: true, linked: false });

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user).toBeDefined();
    expect(user!.email).toBe("new.person@example-new.com"); // normalized
    expect(user!.name).toBe("New Person");
    expect(user!.image).toBe("https://example.com/avatar.png");
    expect(user!.emailVerified).toBeInstanceOf(Date); // Google-verified -> marked verified
    expect(user!.passwordHash).toBeNull();
    expect(user!.sessionVersion).toBe(0);

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-new-1"));
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]!.userId).toBe(userId);
    expect(accountRows[0]!.provider).toBe("google");
    expect(accountRows[0]!.access_token).toBe("at-1");
    expect(result.workspaceId).toBeTruthy();

    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, result.workspaceId!));
    expect(workspaceRows).toHaveLength(1);
    expect(workspaceRows[0]!.slug).toBe("example-new"); // derived from email domain
    expect(workspaceRows[0]!.ownerId).toBe(userId);
    expect(workspaceRows[0]!.plan).toBe("free");

    const membershipRows = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));
    expect(membershipRows).toHaveLength(1);
    expect(membershipRows[0]!.role).toBe("owner");
    expect(membershipRows[0]!.workspaceId).toBe(result.workspaceId);
  });

  it("is idempotent: re-linking the same provider account creates no duplicates", async () => {
    const userId = crypto.randomUUID();
    const account = makeGoogleAccount({
      userId,
      providerAccountId: "sub-idem",
      id_token: makeGoogleIdToken({
        sub: "sub-idem",
        email: "idem@example-idem.com",
        email_verified: true,
        name: "Idem User",
      }),
    });

    const first = await provisionGoogleAccount(account);
    expect(first.isNewUser).toBe(true);

    // Same account replayed (Auth.js would normally use its fast path; the
    // service must stay safe even when linkAccount is re-entered).
    const second = await provisionGoogleAccount(account);
    expect(second.isNewUser).toBe(false);
    expect(second.linked).toBe(false);
    expect(second.userId).toBe(first.userId);

    const db = getDb();
    const userRows = await db.select().from(users).where(eq(users.email, "idem@example-idem.com"));
    expect(userRows).toHaveLength(1);
    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-idem"));
    expect(accountRows).toHaveLength(1);
    const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.ownerId, first.userId));
    expect(workspaceRows).toHaveLength(1);
  });

  it("links Google to an existing email/password account without duplicating user or workspace", async () => {
    const existing = await createUserWithWorkspace({
      name: "Jane Doe",
      email: "jane@link-existing.com",
      password: "Sup3rSecret!",
    });

    const account = makeGoogleAccount({
      userId: existing.userId,
      providerAccountId: "sub-link-1",
      id_token: makeGoogleIdToken({
        sub: "sub-link-1",
        email: "jane@link-existing.com",
        email_verified: true,
        name: "Jane Doe",
      }),
    });

    const result = await provisionGoogleAccount(account);
    expect(result.isNewUser).toBe(false);
    expect(result.linked).toBe(true);
    expect(result.userId).toBe(existing.userId);
    expect(result.workspaceId).toBe(existing.workspaceId);

    const db = getDb();
    const userRows = await db.select().from(users).where(eq(users.email, "jane@link-existing.com"));
    expect(userRows).toHaveLength(1);
    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, existing.userId));
    expect(workspaceRows).toHaveLength(1); // still exactly one workspace
    const membershipRows = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, existing.userId));
    expect(membershipRows).toHaveLength(1);
    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-link-1"));
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]!.userId).toBe(existing.userId);
  });

  it("heals an existing user who somehow has no workspace", async () => {
    const db = getDb();
    const orphanId = crypto.randomUUID();
    await db
      .insert(users)
      .values({ id: orphanId, name: "Orphan", email: "orphan@orphan-test.com" });

    const account = makeGoogleAccount({
      userId: orphanId,
      providerAccountId: "sub-orphan",
      id_token: makeGoogleIdToken({
        sub: "sub-orphan",
        email: "orphan@orphan-test.com",
        email_verified: true,
        name: "Orphan",
      }),
    });

    const result = await provisionGoogleAccount(account);
    expect(result.linked).toBe(true);
    expect(result.workspaceId).toBeTruthy();

    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, orphanId));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe("owner");
  });

  it("keeps workspace isolation: two provisioned users get distinct workspaces", async () => {
    const a = await provisionGoogleAccount(
      makeGoogleAccount({
        userId: crypto.randomUUID(),
        providerAccountId: "sub-iso-a",
        id_token: makeGoogleIdToken({
          sub: "sub-iso-a",
          email: "a@iso-a.com",
          email_verified: true,
          name: "A",
        }),
      })
    );
    const b = await provisionGoogleAccount(
      makeGoogleAccount({
        userId: crypto.randomUUID(),
        providerAccountId: "sub-iso-b",
        id_token: makeGoogleIdToken({
          sub: "sub-iso-b",
          email: "b@iso-b.com",
          email_verified: true,
          name: "B",
        }),
      })
    );

    expect(a.workspaceId).not.toBe(b.workspaceId);

    const db = getDb();
    const membersA = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, a.userId));
    expect(membersA).toHaveLength(1);
    expect(membersA[0]!.workspaceId).toBe(a.workspaceId);
    expect(membersA.some((m) => m.workspaceId === b.workspaceId)).toBe(false);

    const membersB = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, b.userId));
    expect(membersB).toHaveLength(1);
    expect(membersB[0]!.workspaceId).toBe(b.workspaceId);
  });

  it("refuses unverified identities (defense in depth behind the signIn gate)", async () => {
    await expect(
      provisionGoogleAccount(
        makeGoogleAccount({
          userId: crypto.randomUUID(),
          providerAccountId: "sub-unverified",
          id_token: makeGoogleIdToken({
            sub: "sub-unverified",
            email: "person@example-unverified.com",
            email_verified: false,
          }),
        })
      )
    ).rejects.toThrow(/verified/i);

    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, "person@example-unverified.com"));
    expect(rows).toHaveLength(0); // nothing persisted
  });

  it("rejects malformed, missing or subject-mismatched identity tokens", async () => {
    await expect(
      provisionGoogleAccount(
        makeGoogleAccount({
          userId: crypto.randomUUID(),
          providerAccountId: "sub-no-token",
          id_token: null,
        })
      )
    ).rejects.toThrow(/identity token missing/);

    await expect(
      provisionGoogleAccount(
        makeGoogleAccount({
          userId: crypto.randomUUID(),
          providerAccountId: "sub-bad-token",
          id_token: "not-a-jwt",
        })
      )
    ).rejects.toThrow(/malformed/);

    await expect(
      provisionGoogleAccount(
        makeGoogleAccount({
          userId: crypto.randomUUID(),
          providerAccountId: "sub-expected",
          id_token: makeGoogleIdToken({
            sub: "sub-different",
            email: "mismatch@example-mismatch.com",
            email_verified: true,
          }),
        })
      )
    ).rejects.toThrow(/does not match/);

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, "mismatch@example-mismatch.com"));
    expect(rows).toHaveLength(0);
  });

  it("refuses to attach an account to a different user than the token's email resolves to", async () => {
    const db = getDb();
    const real = await createUserWithWorkspace({
      name: "Real Owner",
      email: "owner@isolation-test.com",
      password: "Sup3rSecret!",
    });
    const other = crypto.randomUUID(); // Auth.js-supplied id that disagrees with the email lookup

    await expect(
      provisionGoogleAccount(
        makeGoogleAccount({
          userId: other,
          providerAccountId: "sub-wrong-target",
          id_token: makeGoogleIdToken({
            sub: "sub-wrong-target",
            email: "owner@isolation-test.com",
            email_verified: true,
            name: "Real Owner",
          }),
        })
      )
    ).rejects.toThrow(/does not match the target user/);

    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.providerAccountId, "sub-wrong-target"));
    expect(accountRows).toHaveLength(0); // no cross-user attachment

    const accountsForReal = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, real.userId));
    expect(accountsForReal).toHaveLength(0); // the real owner is untouched
  });
});

describe("decodeGoogleIdentity", () => {
  it("normalizes email casing", () => {
    const identity = decodeGoogleIdentity(
      makeGoogleAccount({
        providerAccountId: "sub-case",
        id_token: makeGoogleIdToken({
          sub: "sub-case",
          email: "  Mixed.Case@Example.COM ",
          email_verified: true,
        }),
      })
    );
    expect(identity.email).toBe("mixed.case@example.com");
  });

  it("rejects accounts without an email claim", () => {
    expect(() =>
      decodeGoogleIdentity(
        makeGoogleAccount({
          providerAccountId: "sub-no-email",
          id_token: makeGoogleIdToken({ sub: "sub-no-email", email_verified: true }),
        })
      )
    ).toThrow(/no email address/);
  });
});

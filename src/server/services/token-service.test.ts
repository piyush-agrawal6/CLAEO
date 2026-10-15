import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import {
  consumePasswordResetToken,
  consumeVerificationToken,
  createPasswordResetToken,
  createVerificationToken,
} from "@/server/services/token-service";
import { eq } from "drizzle-orm";
import { passwordResetTokens, users, verificationTokens } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

describe("token service (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.delete(verificationTokens);
    await db.delete(passwordResetTokens);
    await db.delete(users);
  });

  describe("verification tokens", () => {
    it("stores only the hash, never the raw token", async () => {
      const token = await createVerificationToken("jane@example.com");

      const db = getDb();
      const rows = await db.select().from(verificationTokens);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token).not.toBe(token);
      expect(rows[0]!.token).toMatch(/^[a-f0-9]{64}$/); // sha-256 hex
      expect(rows[0]!.identifier).toBe("jane@example.com");
    });

    it("consumes a valid token exactly once (single use)", async () => {
      const token = await createVerificationToken("jane@example.com");

      expect(await consumeVerificationToken(token, "jane@example.com")).toBe(true);
      expect(await consumeVerificationToken(token, "jane@example.com")).toBe(false);
    });

    it("rejects a token presented for a different email", async () => {
      const token = await createVerificationToken("jane@example.com");
      expect(await consumeVerificationToken(token, "other@example.com")).toBe(false);
      // The real token must remain usable.
      expect(await consumeVerificationToken(token, "jane@example.com")).toBe(true);
    });

    it("rejects unknown tokens", async () => {
      expect(await consumeVerificationToken("garbage", "jane@example.com")).toBe(false);
    });

    it("rejects and deletes expired tokens", async () => {
      const token = await createVerificationToken("jane@example.com");
      const db = getDb();
      await db
        .update(verificationTokens)
        .set({ expires: new Date(Date.now() - 1000) })
        .where(eq(verificationTokens.identifier, "jane@example.com"));

      expect(await consumeVerificationToken(token, "jane@example.com")).toBe(false);
      const remaining = await db.select().from(verificationTokens);
      expect(remaining).toHaveLength(0); // expired record cleaned up
    });

    it("keeps only one outstanding token per email", async () => {
      const first = await createVerificationToken("jane@example.com");
      const second = await createVerificationToken("jane@example.com");

      expect(await consumeVerificationToken(first, "jane@example.com")).toBe(false);
      expect(await consumeVerificationToken(second, "jane@example.com")).toBe(true);
    });
  });

  describe("password reset tokens", () => {
    async function makeUser(): Promise<string> {
      const db = getDb();
      const [user] = await db
        .insert(users)
        .values({ name: "Reset User", email: "reset@example.com", passwordHash: "x" })
        .returning();
      return user!.id;
    }

    it("returns the userId on first consume, then null", async () => {
      const userId = await makeUser();
      const token = await createPasswordResetToken(userId);

      expect(await consumePasswordResetToken(token)).toBe(userId);
      expect(await consumePasswordResetToken(token)).toBeNull();
    });

    it("rejects unknown tokens without revealing why", async () => {
      expect(await consumePasswordResetToken("nope")).toBeNull();
    });

    it("invalidates previous tokens when a new one is issued", async () => {
      const userId = await makeUser();
      const first = await createPasswordResetToken(userId);
      const second = await createPasswordResetToken(userId);

      expect(await consumePasswordResetToken(first)).toBeNull();
      expect(await consumePasswordResetToken(second)).toBe(userId);
    });

    it("rejects expired reset tokens", async () => {
      const userId = await makeUser();
      const token = await createPasswordResetToken(userId);
      const db = getDb();
      await db
        .update(passwordResetTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(passwordResetTokens.userId, userId));

      expect(await consumePasswordResetToken(token)).toBeNull();
    });
  });
});

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { passwordResetTokens, verificationTokens } from "@/lib/db/schema";
import { logger } from "@/lib/logging/logger";

/**
 * One-time, hashed, expiring tokens for email verification and password
 * reset.
 *
 * Security properties:
 * - raw tokens never touch the database (only SHA-256 hashes)
 * - single use (marking used / deleting on consume)
 * - short expiry (24h verification, 1h reset)
 * - constant-shape verification (hash the presented token, look up by hash)
 */

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* --------------------------- email verification -------------------------- */

export async function createVerificationToken(email: string): Promise<string> {
  const db = getDb();
  const token = generateToken();
  const identifier = email.toLowerCase().trim();

  // Only one outstanding verification token per address.
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({
    identifier,
    token: hashToken(token),
    expires: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  return token;
}

export async function consumeVerificationToken(token: string, email: string): Promise<boolean> {
  const db = getDb();
  const identifier = email.toLowerCase().trim();

  const rows = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, hashToken(token))
      )
    )
    .limit(1);

  const record = rows[0];
  if (!record) return false;
  if (record.expires.getTime() <= Date.now()) {
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier));
    return false;
  }

  // Single use: delete immediately.
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  return true;
}

/* ---------------------------- password reset ----------------------------- */

export async function createPasswordResetToken(userId: string): Promise<string> {
  const db = getDb();
  const token = generateToken();

  // Invalidate outstanding reset tokens for this user.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return token;
}

/**
 * Validate + consume a reset token. Returns the userId on success.
 * Any failure returns null without revealing why (enumeration resistance).
 */
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const db = getDb();

  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
    .limit(1);

  const record = rows[0];
  if (!record) return null;
  if (record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
    logger.info("Expired or reused password reset token presented");
    return null;
  }

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  return record.userId;
}

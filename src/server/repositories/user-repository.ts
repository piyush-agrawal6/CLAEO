import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * User persistence. Reads go through `getDb()`, which tests can redirect to
 * an embedded PGlite database via `setDbForTesting()`.
 */

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export async function findUserById(id: string): Promise<UserRow | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertUser(values: NewUser): Promise<UserRow> {
  const db = getDb();
  const rows = await db
    .insert(users)
    .values({ ...values, email: values.email.toLowerCase().trim() })
    .returning();
  const created = rows[0];
  if (!created) throw new Error("Failed to create user");
  return created;
}

export async function updateUserPasswordHash(id: string, passwordHash: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function verifyUserEmail(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ emailVerified: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function updateUserName(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, id));
}

/**
 * Bump the session version — every previously issued JWT becomes invalid on
 * its next use (used after password reset).
 */
export async function bumpUserSessionVersion(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, id));
}

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaceMembers, workspaces, users } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { hashPassword } from "@/lib/security/password";
import { domainToDisplayName, slugify } from "@/lib/utils";
import {
  findUserByEmail,
  findUserById,
  type UserRow,
} from "@/server/repositories/user-repository";

/**
 * User creation with default workspace provisioning.
 *
 * The user, their first workspace and the owner membership are created in a
 * SINGLE transaction — a signup either fully succeeds or leaves nothing
 * behind.
 */

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export interface CreateUserResult {
  userId: string;
  workspaceId: string;
  /** True when the email was auto-verified (development convenience). */
  emailVerified: boolean;
}

/** "acme.com" -> "Acme"; "hello@example.com" -> "Example". Reused by OAuth provisioning. */
export function defaultWorkspaceName(email: string): string {
  const domain = email.split("@")[1] ?? email;
  return domainToDisplayName(domain);
}

/**
 * True when an error is Postgres unique-constraint violation 23505 on the
 * workspace slug. We match on the SQLSTATE (not a message substring) so a
 * different constraint's collision can never be mistaken for a slug race.
 *
 * Drizzle wraps driver failures in `DrizzleQueryError` (the SQLSTATE lives
 * on `.cause`), and some drivers only carry the constraint name inside the
 * message — so walk the cause chain and fall back to the message.
 */
export function isSlugCollision(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const { code, constraint, message } = current as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
    };
    if (code === "23505") {
      if (constraint === "workspaces_slug_unique") return true;
      if (typeof message === "string" && message.includes("workspaces_slug_unique"))
        return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The next candidate slug for a base name. "acme" -> "acme", then "acme-2",
 * "acme-3", ... — the same progression the availability pre-check walks, so
 * a retry lands on exactly the slug a pre-check would have chosen.
 */
export function nextSlugCandidate(base: string, attempt: number): string {
  return attempt <= 0 ? base : `${base}-${attempt + 1}`;
}

/** "Acme" -> "acme", with numeric suffixes on collision. Reused by OAuth provisioning. */
export async function uniqueSlug(name: string): Promise<string> {
  const db = getDb();
  const base = slugify(name) || "workspace";
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Attempts before giving up on allocating a unique slug. Deliberately small. */
export const MAX_SLUG_INSERT_ATTEMPTS = 10;

/**
 * Run `operation` with a candidate slug, retrying the WHOLE operation with
 * the next candidate on a `workspaces_slug_unique` collision.
 *
 * `uniqueSlug` above is an availability pre-check only: two concurrent
 * signups for the same base name can both observe "acme" as free and both
 * attempt to insert it. The database constraint is the real arbiter, so we
 * let it arbitrate — attempt the insert, and on a slug collision retry with
 * "acme-2", "acme-3", ...
 *
 * The retry wraps the entire unit of work (not just the INSERT) because a
 * failed statement poisons its Postgres transaction — later statements fail
 * with `25P02` until rollback. `operation` therefore runs its own
 * transaction per attempt; on collision that transaction rolls back
 * completely (no orphan user/workspace/membership rows) and the next attempt
 * starts fresh with the next candidate slug.
 *
 * Bounded on purpose: `MAX_SLUG_INSERT_ATTEMPTS` keeps a pathological burst
 * from looping, and exhaustion surfaces as a plain error rather than an
 * unbounded retry. The unique constraint is never dropped or bypassed.
 */
export async function withSlugCollisionRetry<T>(
  baseSlug: string,
  operation: (slug: string) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SLUG_INSERT_ATTEMPTS; attempt++) {
    const slug = nextSlugCandidate(baseSlug, attempt);
    try {
      return await operation(slug);
    } catch (error) {
      if (isSlugCollision(error)) {
        logger.info("Workspace slug collision, retrying with next candidate", {
          slug,
          attempt,
        });
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `Could not allocate a unique workspace slug after ${MAX_SLUG_INSERT_ATTEMPTS} attempts.`
  );
}

export async function createUserWithWorkspace(
  input: CreateUserInput
): Promise<CreateUserResult> {
  const db = getDb();
  const email = input.email.toLowerCase().trim();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const workspaceName = defaultWorkspaceName(email);
  // Availability pre-check (fast path). Resolved BEFORE the transactions:
  // drizzle serializes queries per session, so an external query issued while
  // a transaction is open can deadlock. The insert still treats the unique
  // constraint as the real arbiter — see `withSlugCollisionRetry`.
  const baseSlug = await uniqueSlug(workspaceName);

  // Each attempt runs a FULL transaction: a slug collision rolls the user
  // insert back with it, so the retry starts clean (no orphan rows, no
  // duplicate email). Bounded by MAX_SLUG_INSERT_ATTEMPTS.
  const result = await withSlugCollisionRetry(baseSlug, (slug) =>
    db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: input.name, email, passwordHash })
        .returning();
      if (!user) throw new Error("User insert returned no row");

      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: workspaceName, slug, ownerId: user.id, plan: "free" })
        .returning();
      if (!workspace) throw new Error("Workspace insert returned no row");

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      });

      return { userId: user.id, workspaceId: workspace.id };
    })
  );

  logger.info("User and workspace created", {
    userId: result.userId,
    workspaceId: result.workspaceId,
  });

  return { ...result, emailVerified: false };
}

export { findUserByEmail, findUserById };
export type { UserRow };

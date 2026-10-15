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

/** "acme.com" -> "Acme"; "hello@example.com" -> "Example". */
function defaultWorkspaceName(email: string): string {
  const domain = email.split("@")[1] ?? email;
  return domainToDisplayName(domain);
}

/** "Acme" -> "acme", with numeric suffixes on collision. */
async function uniqueSlug(name: string): Promise<string> {
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

export async function createUserWithWorkspace(
  input: CreateUserInput
): Promise<CreateUserResult> {
  const db = getDb();
  const email = input.email.toLowerCase().trim();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const workspaceName = defaultWorkspaceName(email);
  const slug = await uniqueSlug(workspaceName);

  const result = await db.transaction(async (tx) => {
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
  });

  logger.info("User and workspace created", {
    userId: result.userId,
    workspaceId: result.workspaceId,
  });

  return { ...result, emailVerified: false };
}

export { findUserByEmail, findUserById };
export type { UserRow };

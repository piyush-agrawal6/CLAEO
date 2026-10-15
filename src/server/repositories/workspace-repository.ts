import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces, workspaceMembers, type WorkspaceRole } from "@/lib/db/schema";

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;

export interface MembershipWithWorkspace {
  workspace: WorkspaceRow;
  role: WorkspaceRole;
  membershipId: string;
}

export async function insertWorkspace(values: {
  name: string;
  slug: string;
  ownerId: string;
}): Promise<WorkspaceRow> {
  const db = getDb();
  const rows = await db.insert(workspaces).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error("Failed to create workspace");
  return created;
}

export async function insertWorkspaceMember(values: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<WorkspaceMemberRow> {
  const db = getDb();
  const rows = await db.insert(workspaceMembers).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error("Failed to add workspace member");
  return created;
}

/** Every workspace the user belongs to, oldest first (stable ordering). */
export async function listMembershipsForUser(
  userId: string
): Promise<MembershipWithWorkspace[]> {
  const db = getDb();
  const rows = await db
    .select({
      workspace: workspaces,
      role: workspaceMembers.role,
      membershipId: workspaceMembers.id,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt));
  return rows;
}

/** The user's active workspace (first membership). */
export async function getMembershipForUser(userId: string): Promise<MembershipWithWorkspace | null> {
  const memberships = await listMembershipsForUser(userId);
  return memberships[0] ?? null;
}

/**
 * Authorization primitive: does this user belong to this workspace?
 * Called on EVERY workspace-scoped resource access (no IDOR).
 */
export async function isWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function updateWorkspace(
  workspaceId: string,
  values: Partial<Pick<typeof workspaces.$inferInsert, "name" | "plan">>
): Promise<WorkspaceRow | null> {
  const db = getDb();
  const rows = await db
    .update(workspaces)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return rows[0] ?? null;
}

export async function workspaceSlugExists(slug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return rows.length > 0;
}

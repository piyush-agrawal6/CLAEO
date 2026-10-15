import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { domains, type Domain, type DomainStatus } from "@/lib/db/schema";

/**
 * Domain persistence.
 *
 * SECURITY: every read/write takes `workspaceId` and filters on it, so a
 * resource from another workspace can never be returned or mutated (IDOR
 * protection at the query level, not just in route handlers).
 */

export async function listDomains(workspaceId: string): Promise<Domain[]> {
  const db = getDb();
  return db
    .select()
    .from(domains)
    .where(eq(domains.workspaceId, workspaceId))
    .orderBy(asc(domains.createdAt));
}

export async function getDomainById(workspaceId: string, id: string): Promise<Domain | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDomain(values: {
  workspaceId: string;
  domain: string;
  normalizedDomain: string;
  name?: string;
}): Promise<Domain> {
  const db = getDb();
  const rows = await db
    .insert(domains)
    .values({ ...values, status: "pending" satisfies DomainStatus })
    .returning();
  const created = rows[0];
  if (!created) throw new Error("Failed to create domain");
  return created;
}

export async function updateDomainStatus(
  workspaceId: string,
  id: string,
  status: DomainStatus
): Promise<Domain | null> {
  const db = getDb();
  const rows = await db
    .update(domains)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDomain(workspaceId: string, id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(domains)
    .where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId)))
    .returning({ id: domains.id });
  return rows.length > 0;
}

export async function countDomains(workspaceId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.workspaceId, workspaceId));
  return rows.length;
}

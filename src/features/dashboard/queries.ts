import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { prompts, visibilityRuns } from "@/lib/db/schema";
import { listDomains } from "@/server/repositories/domain-repository";

/**
 * Dashboard overview queries.
 *
 * Every number shown on the dashboard comes from a real query. When a
 * metric has no data, the UI shows an explicit empty state — never a
 * fabricated score or change percentage.
 */

export interface DashboardOverview {
  domainCount: number;
  promptCount: number;
  completedRunCount: number;
  lastRunAt: Date | null;
  /** Domains that completed onboarding (analysis step). */
  readyDomainCount: number;
}

export async function getDashboardOverview(workspaceId: string): Promise<DashboardOverview> {
  const db = getDb();

  const workspaceDomains = await listDomains(workspaceId);
  const domainIds = workspaceDomains.map((d) => d.id);

  const readyDomainCount = workspaceDomains.filter((d) => d.status === "ready").length;

  if (domainIds.length === 0) {
    return {
      domainCount: 0,
      promptCount: 0,
      completedRunCount: 0,
      lastRunAt: null,
      readyDomainCount: 0,
    };
  }

  const promptRows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(inArray(prompts.domainId, domainIds));

  const runRows = await db
    .select({ id: visibilityRuns.id, completedAt: visibilityRuns.completedAt })
    .from(visibilityRuns)
    .where(inArray(visibilityRuns.domainId, domainIds))
    .orderBy(desc(visibilityRuns.requestedAt))
    .limit(500);

  const completedRuns = runRows.filter((r) => r.completedAt !== null);

  return {
    domainCount: workspaceDomains.length,
    promptCount: promptRows.length,
    completedRunCount: completedRuns.length,
    lastRunAt: completedRuns[0]?.completedAt ?? null,
    readyDomainCount,
  };
}

/** Count prompts for a specific domain (used by onboarding state). */
export async function countDomainPrompts(domainId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(eq(prompts.domainId, domainId));
  return rows.length;
}

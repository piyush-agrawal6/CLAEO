"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { reportError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { getDb } from "@/lib/db";
import { competitors, domains } from "@/lib/db/schema";
import { normalizeDomain } from "@/lib/utils";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import { requireWorkspaceContext } from "@/features/intelligence/context";
import type { IntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Competitor tracking actions.
 *
 * Competitors can be added manually or discovered automatically from scan
 * evidence (labeled `discoveredAutomatically` in the UI). The plan cap
 * counts BOTH — what you see is what you track. Removal is allowed for
 * auto-discovered rows too, so the user stays in control of the set.
 */

const createCompetitorSchema = z.object({
  domainId: z.string().min(1),
  name: z.string().trim().min(1, "Name the competitor.").max(120),
  domain: z.string().trim().min(3, "Enter the competitor's domain.").max(253),
});

export async function createCompetitorAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = createCompetitorSchema.safeParse({
    domainId: formData.get("domainId"),
    name: formData.get("name"),
    domain: formData.get("domain"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid competitor.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { userId, workspaceId, limits } = await requireWorkspaceContext();
    const db = getDb();

    const [domain] = await db
      .select({ id: domains.id, normalizedDomain: domains.normalizedDomain })
      .from(domains)
      .where(and(eq(domains.id, parsed.data.domainId), eq(domains.workspaceId, workspaceId)))
      .limit(1);
    if (!domain) {
      return { status: "error", message: "Domain not found for this workspace." };
    }

    const budget = await rateLimit({
      key: `competitor_create:${workspaceId}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!budget.allowed) {
      return { status: "error", message: "Too many changes — wait a minute." };
    }

    const normalized = normalizeDomain(parsed.data.domain);
    if (!normalized) {
      return { status: "error", message: "That does not look like a valid domain." };
    }
    if (normalized === domain.normalizedDomain) {
      return { status: "error", message: "You cannot track your own domain as a competitor." };
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competitors)
      .where(eq(competitors.domainId, domain.id));
    if ((count ?? 0) >= limits.competitors) {
      return {
        status: "error",
        message: `Your plan tracks up to ${limits.competitors} competitors (auto-discovered ones included). Remove one or upgrade.`,
      };
    }

    const [created] = await db
      .insert(competitors)
      .values({
        domainId: domain.id,
        name: parsed.data.name,
        domain: normalized,
        normalizedDomain: normalized,
        discoveredAutomatically: false,
      })
      .onConflictDoNothing({ target: [competitors.domainId, competitors.normalizedDomain] })
      .returning({ id: competitors.id });
    if (!created) {
      return { status: "error", message: "That competitor is already tracked." };
    }

    await recordAuditLog({
      userId,
      workspaceId,
      action: "competitor.created",
      targetType: "competitor",
      targetId: created.id,
    });
    revalidatePath("/competitors");
    return { status: "success", message: "Competitor added." };
  } catch (error) {
    reportError(error, { action: "createCompetitor" });
    return { status: "error", message: "Could not add the competitor." };
  }
}

const competitorRefSchema = z.object({ competitorId: z.string().min(1) });

export async function deleteCompetitorAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = competitorRefSchema.safeParse({
    competitorId: formData.get("competitorId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Invalid competitor reference." };
  }
  try {
    const { userId, workspaceId } = await requireWorkspaceContext();
    const db = getDb();
    const [deleted] = await db
      .delete(competitors)
      .where(
        and(
          eq(competitors.id, parsed.data.competitorId),
          inArray(
            competitors.domainId,
            db.select({ id: domains.id }).from(domains).where(eq(domains.workspaceId, workspaceId))
          )
        )
      )
      .returning({ id: competitors.id, name: competitors.name });
    if (!deleted) {
      return { status: "error", message: "Competitor not found for this workspace." };
    }
    await recordAuditLog({
      userId,
      workspaceId,
      action: "competitor.deleted",
      targetType: "competitor",
      targetId: deleted.id,
    });
    revalidatePath("/competitors");
    return { status: "success", message: `${deleted.name} removed.` };
  } catch (error) {
    reportError(error, { action: "deleteCompetitor" });
    return { status: "error", message: "Could not remove the competitor." };
  }
}

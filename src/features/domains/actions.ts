"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/session";
import { normalizeDomain } from "@/lib/utils";
import { countDomains, createDomain, deleteDomain, listDomains } from "@/server/repositories/domain-repository";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";
import { getPlanLimits } from "@/lib/usage/limits";
import { reportError } from "@/lib/errors";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import type { DomainActionState } from "@/features/domains/schemas";

/**
 * Domain management actions.
 *
 * Every action re-derives the workspace from the SIGNED-IN USER — the
 * client never supplies a workspace id, which eliminates IDOR by design.
 */

const createDomainSchema = z.object({
  domain: z.string().trim().min(1, "Domain is required").max(253),
  name: z.string().trim().max(80).optional(),
});

export async function createDomainAction(
  _prevState: DomainActionState,
  formData: FormData
): Promise<DomainActionState> {
  try {
    const user = await requireUserContext();
    const membership = await getMembershipForUser(user.id);
    if (!membership) {
      return { status: "error", message: "No workspace found for this account." };
    }

    const parsed = createDomainSchema.safeParse({
      domain: formData.get("domain"),
      name: formData.get("name") || undefined,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
    }

    let normalized: string;
    try {
      normalized = normalizeDomain(parsed.data.domain);
    } catch (error) {
      return {
        status: "error",
        message: (error as Error).message,
        fieldErrors: { domain: [(error as Error).message] },
      };
    }

    // Plan-based domain quota (enforced from day one; billing phase adds
    // upgrades).
    const planLimits = getPlanLimits(membership.workspace.plan);
    const current = await countDomains(membership.workspace.id);
    if (current >= planLimits.domains) {
      return {
        status: "error",
        message: `Your ${membership.workspace.plan} plan includes ${planLimits.domains} domain(s). Upgrade your plan to add more.`,
      };
    }

    const existing = await listDomains(membership.workspace.id);
    if (existing.some((d) => d.normalizedDomain === normalized)) {
      return {
        status: "error",
        message: "This domain is already tracked in your workspace.",
        fieldErrors: { domain: ["Already tracked"] },
      };
    }

    const domain = await createDomain({
      workspaceId: membership.workspace.id,
      domain: parsed.data.domain,
      normalizedDomain: normalized,
      name: parsed.data.name || undefined,
    });

    await recordAuditLog({
      userId: user.id,
      workspaceId: membership.workspace.id,
      action: "domain.created",
      targetType: "domain",
      targetId: domain.id,
    });

    revalidatePath("/domains");
    return { status: "success", message: `${normalized} was added to your workspace.` };
  } catch (error) {
    reportError(error, { action: "createDomain" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

export async function deleteDomainAction(formData: FormData): Promise<void> {
  const user = await requireUserContext();
  const membership = await getMembershipForUser(user.id);
  if (!membership) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const deleted = await deleteDomain(membership.workspace.id, id);
  if (deleted) {
    await recordAuditLog({
      userId: user.id,
      workspaceId: membership.workspace.id,
      action: "domain.deleted",
      targetType: "domain",
      targetId: id,
    });
    revalidatePath("/domains");
  }
}

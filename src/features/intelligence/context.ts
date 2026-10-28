import { requireUserContext } from "@/lib/auth/session";
import { ConfigurationError } from "@/lib/errors";
import { getPlanLimits, type PlanLimits } from "@/lib/usage/limits";
import type { WorkspacePlan } from "@/lib/db/schema";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";

/**
 * Shared workspace scoping for intelligence actions.
 *
 * The client NEVER supplies a workspace id — it is always re-derived from
 * the signed-in user's membership, so a foreign workspace/domain id simply
 * fails authorization (IDOR by design).
 */

export interface WorkspaceActionContext {
  userId: string;
  workspaceId: string;
  plan: WorkspacePlan;
  limits: PlanLimits;
}

export async function requireWorkspaceContext(): Promise<WorkspaceActionContext> {
  const user = await requireUserContext();
  const membership = await getMembershipForUser(user.id);
  if (!membership) {
    throw new ConfigurationError("No workspace found for this account.");
  }
  return {
    userId: user.id,
    workspaceId: membership.workspace.id,
    plan: membership.workspace.plan,
    limits: getPlanLimits(membership.workspace.plan),
  };
}

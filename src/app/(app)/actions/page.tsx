import type { Metadata } from "next";
import { TargetIcon } from "lucide-react";
import { Alert } from "@/components/common/alert";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionCard, type ActionCardData } from "@/components/intelligence/action-card";
import { MockModeBanner } from "@/components/intelligence/sample-data-badge";
import {
  getPrimaryDomain,
  getRecommendationsForWorkspace,
  type ActionRow,
} from "@/features/intelligence/queries";
import { requirePageWorkspace } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/usage/limits";

export const metadata: Metadata = {
  title: "Action center",
};

/** Narrow an ActionRow to exactly the fields the ActionCard renders. */
function toActionCardData(row: ActionRow): ActionCardData {
  return {
    id: row.id,
    status: row.status,
    priority: row.priority,
    category: row.category,
    title: row.title,
    explanation: row.explanation,
    action: row.action,
    impact: row.impact,
    effort: row.effort,
    promptText: row.promptText,
    competitorName: row.competitorName,
    evidence: row.evidence,
    updatedAt: row.updatedAt,
  };
}

/**
 * Action center — deterministic recommendations from persisted scan
 * evidence. No AI writes these; every card links back to the evidence a
 * scan collected. Status transitions are manual (see ActionCard).
 */
export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ domainId?: string }>;
}) {
  const { domainId: domainIdParam } = await searchParams;
  const { membership } = await requirePageWorkspace();
  const domain = await getPrimaryDomain(membership.workspace.id, domainIdParam);

  const { open, resolved } = await getRecommendationsForWorkspace(
    membership.workspace.id,
    domain?.id ?? null
  );
  const limits = getPlanLimits(membership.workspace.plan);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action center"
        description="Recommendations are derived by fixed rules from your scan evidence — no AI writes them, and each one links back to the scan that produced it."
      />
      <MockModeBanner />

      {!limits.actionCenter ? (
        <Alert variant="info">
          Your current plan includes the action center during the beta; paid
          enforcement arrives with billing.
        </Alert>
      ) : null}

      {/* Open recommendations */}
      {open.length > 0 ? (
        <ul className="space-y-4">
          {open.map((item) => (
            <ActionCard key={item.id} item={toActionCardData(item)} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={TargetIcon}
          title="No open recommendations"
          description="Recommendations appear after a scan — each one is derived by fixed rules from the evidence that scan persisted, never invented. Check back once your first scan completes."
        />
      )}

      {/* Resolved (dismissed / done) */}
      {resolved.length > 0 ? (
        <details className="border-border rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Resolved ({resolved.length})
          </summary>
          <ul className="mt-4 space-y-4">
            {resolved.map((item) => (
              <ActionCard key={item.id} item={toActionCardData(item)} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

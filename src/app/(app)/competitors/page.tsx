import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MockModeBanner, SampleDataBadge } from "@/components/intelligence/sample-data-badge";
import {
  CompetitorAddForm,
  CompetitorRowControls,
} from "@/components/competitors/competitor-forms";
import {
  getCompetitorsWithStatus,
  getPrimaryDomain,
  type CompetitorWithStatus,
} from "@/features/intelligence/queries";
import { requirePageWorkspace } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/usage/limits";

export const metadata: Metadata = {
  title: "Competitors",
};

/** Mention footprint from the latest scan — factual counts only. */
function mentionLabel(competitor: CompetitorWithStatus, hasScan: boolean): string {
  if (!hasScan) return "not observed — no scan yet";
  if (competitor.mentionCountLatestScan === 0) return "not mentioned in the last scan";
  return `mentioned in ${competitor.mentionCountLatestScan} answer${
    competitor.mentionCountLatestScan === 1 ? "" : "s"
  }`;
}

/**
 * Competitor tracking: manual additions plus scan-discovered suggestions,
 * both counted against the plan cap. Mention counts come from the latest
 * scan only — they are not lifetime totals.
 */
export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ domainId?: string }>;
}) {
  const { domainId: domainIdParam } = await searchParams;
  const { membership } = await requirePageWorkspace();
  const domain = await getPrimaryDomain(membership.workspace.id, domainIdParam);

  if (!domain) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Competitors"
          description="Domains you track against your own. Each scan measures how often they — and you — are mentioned in AI answers."
        />
        <MockModeBanner />
        <EmptyState
          icon={UsersIcon}
          title="Add a domain first"
          description="Competitors are tracked per domain. Add your domain to start comparing visibility."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/domains">Add a domain</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const limits = getPlanLimits(membership.workspace.plan);
  const { competitors, latestScan } = await getCompetitorsWithStatus(
    membership.workspace.id,
    domain.id
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitors"
        description="Domains you track against your own. Each scan measures how often they — and you — are mentioned in AI answers."
      />
      <MockModeBanner />

      {/* Add competitor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlusIcon className="size-4" aria-hidden /> Add a competitor
          </CardTitle>
          <CardDescription>
            Your plan tracks up to {limits.competitors} competitors,
            auto-discovered included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitorAddForm domainId={domain.id} />
        </CardContent>
      </Card>

      {/* Tracked list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4" aria-hidden /> Your competitors
          </CardTitle>
          <CardDescription>
            {latestScan ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                Mention counts from the scan of{" "}
                {latestScan.createdAt.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {latestScan.mocked ? <SampleDataBadge /> : null}
              </span>
            ) : (
              "No scan has run yet — mention counts appear after the first scan."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {competitors.length > 0 ? (
            <ul className="divide-border divide-y">
              {competitors.map((competitor) => (
                <li
                  key={competitor.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{competitor.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {competitor.normalizedDomain}
                    </p>
                    {competitor.confidence != null ? (
                      <p className="text-muted-foreground text-xs">
                        suggestion confidence {competitor.confidence} (estimated)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">
                      {mentionLabel(competitor, latestScan !== null)}
                    </Badge>
                    {competitor.discoveredAutomatically ? (
                      <Badge variant="secondary">
                        auto-discovered from SERP evidence
                      </Badge>
                    ) : null}
                  </div>
                  <CompetitorRowControls competitorId={competitor.id} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="No competitors tracked yet"
              description="Add the domains you lose deals to — or let scans discover them from SERP evidence. QuerySide never invents company names for you."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

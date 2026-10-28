import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, LayoutDashboardIcon } from "lucide-react";
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
import { MockModeBanner } from "@/components/intelligence/sample-data-badge";
import { ScoreCard } from "@/components/intelligence/score-card";
import { ScanLauncher } from "@/components/intelligence/scan-launcher";
import { requirePageWorkspace } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getPlanLimits } from "@/lib/usage/limits";
import {
  getDashboardIntelligence,
  getScanHistory,
} from "@/features/intelligence/queries";

export const metadata: Metadata = {
  title: "Overview",
};

const statusVariant: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  completed: "success",
  partial: "warning",
  failed: "destructive",
  cancelled: "secondary",
  running: "warning",
  queued: "secondary",
};

/**
 * Workspace overview (Phase 3): the real intelligence product home.
 *
 * Every score and count comes from persisted scan evidence; domains without
 * scans show explicit "no data" states rather than placeholders. Nothing
 * here triggers a provider call — scans run only from the launcher below.
 */
export default async function DashboardPage() {
  const { membership } = await requirePageWorkspace();
  const workspaceId = membership.workspace.id;
  const limits = getPlanLimits(membership.workspace.plan);

  const summaries = await getDashboardIntelligence(workspaceId);
  const primary = summaries[0] ?? null;
  const history = primary ? await getScanHistory(workspaceId, primary.domainId, 10) : [];
  const activeScan =
    primary?.latestScan &&
    (primary.latestScan.status === "queued" || primary.latestScan.status === "running")
      ? {
          id: primary.latestScan.id,
          status: primary.latestScan.status,
          createdAt: primary.latestScan.createdAt.toISOString(),
          completedAt: primary.latestScan.completedAt?.toISOString() ?? null,
        }
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Search and AI visibility measured from data you trigger — never fabricated, never fetched in the background."
      />
      <MockModeBanner />

      {summaries.length === 0 ? (
        <EmptyState
          icon={LayoutDashboardIcon}
          title="No domains yet"
          description="Add and verify your domain first — QuerySide measures visibility for domains you actually own."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/domains">Go to domains</Link>
            </Button>
          }
        />
      ) : (
        <>
          {primary ? (
            <ScanLauncher
              domainId={primary.domainId}
              domainLabel={primary.normalizedDomain}
              scansPerDay={limits.scansPerDay}
              mockMode={env.NEXT_PUBLIC_MOCK_MODE}
              activeScan={activeScan}
              promptCount={primary.promptCount}
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {summaries.map((summary) => (
              <Card key={summary.domainId}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{summary.domainLabel}</span>
                    {summary.latestScan ? (
                      <Badge variant={statusVariant[summary.latestScan.status] ?? "secondary"}>
                        {summary.latestScan.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">no scans yet</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {summary.normalizedDomain} · {summary.promptCount} prompt
                    {summary.promptCount === 1 ? "" : "s"} tracked
                    {summary.openRecommendationCount > 0
                      ? ` · ${summary.openRecommendationCount} open action(s)`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <ScoreCard
                      label="AI visibility score"
                      score={summary.latestScan?.aiScore ?? null}
                      coverageCompleted={summary.latestScan?.aiCoverageCompleted ?? 0}
                      coverageExpected={summary.latestScan?.aiCoverageExpected ?? 0}
                      formulaVersion={summary.latestScan ? "ai_visibility_v1" : null}
                      mocked={summary.latestScan?.mocked ?? false}
                      emptyDescription="Run a scan to measure AI answers."
                    />
                    <ScoreCard
                      label="Google visibility score"
                      score={summary.latestScan?.googleScore ?? null}
                      coverageCompleted={summary.latestScan?.googleCoverageCompleted ?? 0}
                      coverageExpected={summary.latestScan?.googleCoverageExpected ?? 0}
                      formulaVersion={summary.latestScan ? "google_visibility_v1" : null}
                      mocked={summary.latestScan?.mocked ?? false}
                      emptyDescription="Run a scan to check SERP presence."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/ai-visibility?domainId=${summary.domainId}`}>
                        Full report <ArrowRightIcon aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/actions?domainId=${summary.domainId}`}>Action center</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/citations?domainId=${summary.domainId}`}>Citations</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {primary ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent scans</CardTitle>
                <CardDescription>
                  Cost is the provider-reported amount when available (estimates
                  otherwise); sample-data scans cost $0.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {history.length > 0 ? (
                  <ul className="divide-border divide-y text-sm">
                    {history.map((scan) => (
                      <li key={scan.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant[scan.status] ?? "secondary"}>
                            {scan.status}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {scan.createdAt.toLocaleString()}
                          </span>
                          {scan.mocked ? (
                            <Badge variant="warning">sample data</Badge>
                          ) : null}
                        </div>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {scan.completedOperations}/{scan.expectedOperations} steps ·{" "}
                          ${scan.providerCostUsd.toFixed(4)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No scans yet for {primary.normalizedDomain}.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

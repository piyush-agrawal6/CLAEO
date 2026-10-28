import type { Metadata } from "next";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";
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
import { ScoreCard } from "@/components/intelligence/score-card";
import { ScanLauncher } from "@/components/intelligence/scan-launcher";
import { requirePageWorkspace } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getPlanLimits } from "@/lib/usage/limits";
import {
  getAiObservations,
  getEngineStatuses,
  getKeywordTable,
  getLatestScan,
  getPrimaryDomain,
  getPromptCount,
  getSerpTable,
  getShareMetrics,
} from "@/features/intelligence/queries";

export const metadata: Metadata = {
  title: "AI visibility",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const engineStatusVariant: Record<string, "success" | "warning" | "secondary"> = {
  real: "success",
  mock: "warning",
  unavailable: "secondary",
};

/**
 * Full intelligence report for one domain: scores with coverage, share of
 * voice, citation share, per-engine AI observations with evidence, keyword
 * metrics and SERP positions — all straight from the latest scan's
 * persisted data. Null metrics render as "—" with an honest explanation.
 */
export default async function AiVisibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ domainId?: string }>;
}) {
  const { domainId } = await searchParams;
  const { membership } = await requirePageWorkspace();
  const workspaceId = membership.workspace.id;
  const limits = getPlanLimits(membership.workspace.plan);

  const domain = await getPrimaryDomain(workspaceId, domainId);
  if (!domain) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI visibility" />
        <EmptyState
          icon={SparklesIcon}
          title="No domain to report on yet"
          description="Add and verify a domain first — visibility is measured for domains you own."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/domains">Go to domains</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const scan = await getLatestScan(workspaceId, domain.id);
  const [observations, keywords, serp, engines, promptCount] = scan
    ? await Promise.all([
        getAiObservations(scan.id),
        getKeywordTable(scan.id),
        getSerpTable(scan.id),
        getEngineStatuses(),
        getPromptCount(workspaceId, domain.id),
      ])
    : [[], [], [], await getEngineStatuses(), await getPromptCount(workspaceId, domain.id)];
  const share = scan ? await getShareMetrics(workspaceId, domain.id, scan.id) : null;

  const activeScan =
    scan && (scan.status === "queued" || scan.status === "running")
      ? {
          id: scan.id,
          status: scan.status,
          createdAt: scan.createdAt.toISOString(),
          completedAt: scan.completedAt?.toISOString() ?? null,
        }
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`AI visibility — ${domain.normalizedDomain}`}
        description="Is your brand present when buyers ask AI engines and Google? Every number below comes from your latest scan."
      />
      <MockModeBanner />

      <ScanLauncher
        domainId={domain.id}
        domainLabel={domain.normalizedDomain}
        scansPerDay={limits.scansPerDay}
        mockMode={env.NEXT_PUBLIC_MOCK_MODE}
        activeScan={activeScan}
        promptCount={promptCount}
      />

      {!scan ? (
        <EmptyState
          icon={SparklesIcon}
          title="No scan yet"
          description="Run your first intelligence scan above. Scores appear only once real observations exist — QuerySide never shows placeholder numbers."
        />
      ) : (
        <>
          {/* Scores */}
          <div className="flex flex-wrap gap-3">
            <ScoreCard
              label="AI visibility score"
              score={scan.aiScore}
              coverageCompleted={scan.aiCoverageCompleted ?? 0}
              coverageExpected={scan.aiCoverageExpected ?? 0}
              formulaVersion={scan.aiScoreFormulaVersion}
              mocked={scan.mocked}
              emptyDescription="No AI answer was successfully checked in this scan."
            />
            <ScoreCard
              label="Google visibility score"
              score={scan.googleScore}
              coverageCompleted={scan.googleCoverageCompleted ?? 0}
              coverageExpected={scan.googleCoverageExpected ?? 0}
              formulaVersion={scan.googleScoreFormulaVersion}
              mocked={scan.mocked}
              emptyDescription="No SERP was successfully checked in this scan."
            />
            <Card className="flex-1">
              <CardContent className="space-y-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">Share of voice in AI answers</p>
                  {scan.mocked ? <SampleDataBadge /> : null}
                </div>
                {share?.shareOfVoice.share === null || !share ? (
                  <>
                    <p className="text-muted-foreground text-lg font-semibold">—</p>
                    <p className="text-muted-foreground text-xs">
                      Not enough data — nobody was mentioned across the answers collected.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold tabular-nums">
                      {percent(share.shareOfVoice.share)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {share.shareOfVoice.brandMentionCount} brand vs{" "}
                      {share.shareOfVoice.competitorMentionCount} competitor mentions
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="space-y-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">Citation share</p>
                  {scan.mocked ? <SampleDataBadge /> : null}
                </div>
                {!share || share.citationShare.share === null ? (
                  <>
                    <p className="text-muted-foreground text-lg font-semibold">—</p>
                    <p className="text-muted-foreground text-xs">
                      No provider citations were returned by any engine in this scan.
                      URLs inside answer text are extracted separately and never
                      counted here.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold tabular-nums">
                      {percent(share.citationShare.share)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {share.citationShare.ownedCitationCount} of{" "}
                      {share.citationShare.providerCitationCount} provider citations
                      point at your domain
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scan facts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This scan</CardTitle>
              <CardDescription>
                Started {scan.createdAt.toLocaleString()}
                {scan.completedAt ? ` · finished ${scan.completedAt.toLocaleString()}` : ""}
                {scan.mocked
                  ? " · all providers were mock — no credits spent."
                  : ` · provider cost so far: $${scan.providerCostUsd.toFixed(4)}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                {scan.completedOperations} of {scan.expectedOperations} steps completed
              </Badge>
              {scan.failedOperations > 0 ? (
                <Badge variant="warning">{scan.failedOperations} step(s) failed</Badge>
              ) : null}
              {scan.mocked ? <SampleDataBadge /> : null}
              {scan.error ? (
                <span className="text-destructive">{scan.error}</span>
              ) : null}
            </CardContent>
          </Card>

          {/* AI observations per prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI answers, prompt by prompt</CardTitle>
              <CardDescription>
                Each row is one engine asked one of your tracked questions. Failed
                checks are excluded from the score and shown here as failures —
                never counted as “not mentioned”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {observations.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No AI observations were recorded in this scan.
                </p>
              ) : (
                [...new Set(observations.map((obs) => obs.promptId))].map((promptId) => {
                  const rows = observations.filter((obs) => obs.promptId === promptId);
                  const promptText =
                    rows[0]?.promptText ?? "(prompt no longer exists)";
                  return (
                    <div key={promptId} className="space-y-2">
                      <p className="text-sm font-medium">{promptText}</p>
                      <ul className="divide-border divide-y">
                        {rows.map((obs) => (
                          <li key={`${obs.promptId}-${obs.engineKey}`} className="py-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">{obs.engineName}</span>
                              {obs.status === "completed" ? (
                                obs.brandMentioned ? (
                                  <Badge variant="success">
                                    mentioned ({obs.mentionCount ?? 1}×)
                                  </Badge>
                                ) : (
                                  <Badge variant="warning">not mentioned</Badge>
                                )
                              ) : (
                                <Badge variant="destructive">{obs.status}</Badge>
                              )}
                              {obs.mocked ? <SampleDataBadge /> : null}
                              {obs.model ? (
                                <span className="text-muted-foreground text-xs">{obs.model}</span>
                              ) : null}
                              {obs.latencyMs != null ? (
                                <span className="text-muted-foreground text-xs">
                                  {obs.latencyMs} ms
                                </span>
                              ) : null}
                              {obs.competitorMentions.some((c) => c.mentioned) ? (
                                <span className="text-muted-foreground text-xs">
                                  mentioned instead:{" "}
                                  {obs.competitorMentions
                                    .filter((c) => c.mentioned)
                                    .map((c) => c.name)
                                    .join(", ")}
                                </span>
                              ) : null}
                              {obs.extractedUrlCount > 0 ? (
                                <span className="text-muted-foreground text-xs">
                                  {obs.extractedUrlCount} URL(s) extracted from the answer
                                </span>
                              ) : null}
                              {obs.providerCitationCount > 0 ? (
                                <Badge variant="outline">
                                  {obs.providerCitationCount} provider citation(s)
                                </Badge>
                              ) : null}
                            </div>
                            {obs.error ? (
                              <p className="text-destructive mt-1 text-xs" role="alert">
                                {obs.error}
                              </p>
                            ) : null}
                            {obs.mentionContext ? (
                              <p className="text-muted-foreground mt-1 text-xs italic">
                                “…{obs.mentionContext}…”
                              </p>
                            ) : null}
                            {obs.answerText ? (
                              <details className="mt-1 text-xs">
                                <summary className="text-muted-foreground cursor-pointer">
                                  Full answer
                                </summary>
                                <p className="bg-muted/50 mt-2 whitespace-pre-wrap rounded-md p-2.5 leading-relaxed">
                                  {obs.answerText}
                                </p>
                              </details>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Keyword metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search demand for your questions</CardTitle>
              <CardDescription>
                Live keyword data from DataForSEO. “—” means the provider did not
                return that metric for the keyword — it is never estimated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {keywords.length === 0 ? (
                <p className="text-muted-foreground text-sm">No keyword data in this scan.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-border border-b text-left text-xs">
                        <th className="py-2 pr-4 font-medium">Keyword</th>
                        <th className="py-2 pr-4 font-medium">Volume</th>
                        <th className="py-2 pr-4 font-medium">CPC</th>
                        <th className="py-2 pr-4 font-medium">Competition</th>
                        <th className="py-2 pr-4 font-medium">Intent</th>
                        <th className="py-2 font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywords.map((row) => (
                        <tr key={row.keyword} className="border-border/60 border-b last:border-0">
                          <td className="max-w-[280px] truncate py-2 pr-4">{row.keyword}</td>
                          <td className="py-2 pr-4 tabular-nums">
                            {row.searchVolume ?? "—"}
                          </td>
                          <td className="py-2 pr-4 tabular-nums">
                            {row.cpc === null ? "—" : `$${row.cpc.toFixed(2)}`}
                          </td>
                          <td className="py-2 pr-4">{row.competitionLevel ?? "—"}</td>
                          <td className="py-2 pr-4">{row.intent ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              {row.mocked ? <SampleDataBadge /> : null}
                              {row.cacheHit ? (
                                <Badge variant="outline">cached</Badge>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SERP positions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google first-page presence</CardTitle>
              <CardDescription>
                Positions from live SERP checks. “Absent” means the domain was
                genuinely not in the results — a measured fact, not a guess.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {serp.length === 0 ? (
                <p className="text-muted-foreground text-sm">No SERP checks in this scan.</p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {serp.map((row) => (
                    <li key={row.keyword} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.keyword}</p>
                        <p className="text-muted-foreground text-xs">
                          {row.seResultsCount != null
                            ? `${row.seResultsCount.toLocaleString()} results`
                            : "result count not returned"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.trackedDomainRank != null ? (
                          <Badge variant={row.trackedDomainRank <= 5 ? "success" : "secondary"}>
                            position {row.trackedDomainRank}
                          </Badge>
                        ) : (
                          <Badge variant="warning">absent from results</Badge>
                        )}
                        {row.mocked ? <SampleDataBadge /> : null}
                        {row.cacheHit ? <Badge variant="outline">cached</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Engine status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI engines</CardTitle>
              <CardDescription>
                Honest engine status. Engines marked “coming soon” are never
                queried and never counted in scores. Engines without inline
                citation support contribute only extracted URLs, never citation
                share.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y text-sm">
                {engines.map((engine) => (
                  <li key={engine.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{engine.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {engine.sourceDescription ?? engine.key}
                        {engine.model ? ` · ${engine.model}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {engine.supportsCitations
                          ? "returns citations"
                          : "no citation support"}
                      </span>
                      {engine.status === "unavailable" ? (
                        <Badge variant="secondary">
                          {engine.unavailableReason?.includes("planned")
                            ? "coming soon"
                            : "unavailable"}
                        </Badge>
                      ) : (
                        <Badge variant={engineStatusVariant[engine.status] ?? "secondary"}>
                          {engine.status === "mock" ? "mock (sample data)" : "live"}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

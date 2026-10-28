import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  citations,
  competitors,
  competitorMentions,
  domains,
  intelligenceScans,
  keywordMetrics,
  prompts,
  recommendations,
  serpSnapshots,
  visibilityResults,
  visibilityRuns,
  type Domain,
  type IntelligenceScan,
  type Recommendation,
} from "@/lib/db/schema";
import { listAiEngines, type ResolvedAiEngine } from "@/lib/providers/ai/registry";
import { computeCitationShare, computeShareOfVoice } from "@/lib/scoring";
import { listDomains } from "@/server/repositories/domain-repository";

/**
 * Intelligence product read models (Phase 3C).
 *
 * Every value returned here is a real persisted measurement. When a metric
 * has no evidence (no scan, failed observations, no provider citations), the
 * shape keeps it NULL/empty so pages render explicit "not enough data"
 * states — these queries never compute a score from nothing.
 */

/* ------------------------------ domain scope ------------------------------ */

/**
 * Resolve the domain an intelligence page should show. Tenant-scoped:
 * a domain id from another workspace simply resolves to null.
 */
export async function getPrimaryDomain(
  workspaceId: string,
  domainIdParam?: string | null
): Promise<Domain | null> {
  const all = await listDomains(workspaceId);
  if (all.length === 0) return null;
  if (domainIdParam) {
    const match = all.find((domain) => domain.id === domainIdParam);
    if (match) return match;
  }
  return all[0] ?? null;
}

/** Latest scan for a tenant-scoped domain (any status). */
export async function getLatestScan(
  workspaceId: string,
  domainId: string
): Promise<IntelligenceScan | null> {
  const [scan] = await getDb()
    .select()
    .from(intelligenceScans)
    .where(
      and(
        eq(intelligenceScans.workspaceId, workspaceId),
        eq(intelligenceScans.domainId, domainId)
      )
    )
    .orderBy(desc(intelligenceScans.createdAt))
    .limit(1);
  return scan ?? null;
}

export async function getScanHistory(
  workspaceId: string,
  domainId: string,
  limit = 20
): Promise<IntelligenceScan[]> {
  return getDb()
    .select()
    .from(intelligenceScans)
    .where(
      and(
        eq(intelligenceScans.workspaceId, workspaceId),
        eq(intelligenceScans.domainId, domainId)
      )
    )
    .orderBy(desc(intelligenceScans.createdAt))
    .limit(limit);
}

/* ------------------------------ scan details ------------------------------ */

export interface KeywordTableRow {
  keyword: string;
  promptText: string | null;
  searchVolume: number | null;
  cpc: number | null;
  competitionLevel: string | null;
  intent: string | null;
  trendMonthly: number | null;
  cacheHit: boolean;
  mocked: boolean;
  retrievedAt: Date;
}

export async function getKeywordTable(
  scanId: string
): Promise<KeywordTableRow[]> {
  const rows = await getDb()
    .select({
      keyword: keywordMetrics.keyword,
      promptId: keywordMetrics.promptId,
      searchVolume: keywordMetrics.searchVolume,
      cpc: keywordMetrics.cpc,
      competitionLevel: keywordMetrics.competitionLevel,
      intent: keywordMetrics.intent,
      trendMonthly: keywordMetrics.trendMonthly,
      cacheHit: keywordMetrics.cacheHit,
      mocked: keywordMetrics.mocked,
      retrievedAt: keywordMetrics.retrievedAt,
      promptText: prompts.text,
    })
    .from(keywordMetrics)
    .leftJoin(prompts, eq(prompts.id, keywordMetrics.promptId))
    .where(eq(keywordMetrics.scanId, scanId))
    .orderBy(desc(keywordMetrics.searchVolume));
  return rows.map((row) => ({ ...row, promptText: row.promptText ?? null }));
}

export interface SerpTableRow {
  keyword: string;
  promptText: string | null;
  trackedDomainRank: number | null;
  trackedDomainUrl: string | null;
  seResultsCount: number | null;
  itemTypes: string[] | null;
  cacheHit: boolean;
  mocked: boolean;
  retrievedAt: Date;
}

export async function getSerpTable(scanId: string): Promise<SerpTableRow[]> {
  const rows = await getDb()
    .select({
      keyword: serpSnapshots.keyword,
      promptId: serpSnapshots.promptId,
      trackedDomainRank: serpSnapshots.trackedDomainRank,
      trackedDomainUrl: serpSnapshots.trackedDomainUrl,
      seResultsCount: serpSnapshots.seResultsCount,
      itemTypes: serpSnapshots.itemTypes,
      cacheHit: serpSnapshots.cacheHit,
      mocked: serpSnapshots.mocked,
      retrievedAt: serpSnapshots.retrievedAt,
      promptText: prompts.text,
    })
    .from(serpSnapshots)
    .leftJoin(prompts, eq(prompts.id, serpSnapshots.promptId))
    .where(eq(serpSnapshots.scanId, scanId))
    .orderBy(serpSnapshots.keyword);
  return rows.map((row) => ({ ...row, promptText: row.promptText ?? null }));
}

/* ---------------------------- AI observations ----------------------------- */

export interface AiObservationRow {
  promptId: string;
  promptText: string | null;
  engineKey: string;
  engineName: string;
  status: string;
  mocked: boolean;
  brandMentioned: boolean | null;
  mentionCount: number | null;
  mentionContext: string | null;
  answerText: string | null;
  model: string | null;
  latencyMs: number | null;
  tokenUsage: { input?: number; output?: number } | null;
  error: string | null;
  competitorMentions: Array<{ name: string; mentioned: boolean }>;
  extractedUrlCount: number;
  providerCitationCount: number;
}

export async function getAiObservations(scanId: string): Promise<AiObservationRow[]> {
  const db = getDb();
  const runs = await db
    .select({
      promptId: visibilityRuns.promptId,
      engine: visibilityRuns.engine,
      status: visibilityRuns.status,
      mocked: visibilityRuns.mocked,
      error: visibilityRuns.error,
      resultId: visibilityResults.id,
      brandMentioned: visibilityResults.brandMentioned,
      mentionCount: visibilityResults.mentionCount,
      mentionContext: visibilityResults.mentionContext,
      answerText: visibilityResults.answerText,
      model: visibilityResults.model,
      latencyMs: visibilityResults.latencyMs,
      tokenUsage: visibilityResults.tokenUsage,
    })
    .from(visibilityRuns)
    .leftJoin(visibilityResults, eq(visibilityResults.runId, visibilityRuns.id))
    .where(eq(visibilityRuns.scanId, scanId))
    .orderBy(visibilityRuns.promptId, visibilityRuns.engine);

  if (runs.length === 0) return [];

  const promptRows = await db
    .select({ id: prompts.id, text: prompts.text })
    .from(prompts)
    .where(inArray(prompts.id, [...new Set(runs.map((run) => run.promptId))]));
  const promptText = new Map(promptRows.map((row) => [row.id, row.text]));

  const engineRows = await listAiEngines();
  const engineLabel = new Map<ResolvedAiEngine["key"], string>(
    engineRows.map((row) => [row.key, row.name])
  );

  const resultIds = runs
    .map((run) => run.resultId)
    .filter((id): id is string => Boolean(id));
  const compRows =
    resultIds.length > 0
      ? await db
          .select({
            resultId: competitorMentions.resultId,
            mentioned: competitorMentions.mentioned,
            name: competitors.name,
          })
          .from(competitorMentions)
          .innerJoin(competitors, eq(competitors.id, competitorMentions.competitorId))
          .where(inArray(competitorMentions.resultId, resultIds))
      : [];
  const citationRows =
    resultIds.length > 0
      ? await db
          .select({
            resultId: citations.visibilityResultId,
            kind: citations.kind,
          })
          .from(citations)
          .where(inArray(citations.visibilityResultId, resultIds))
      : [];

  return runs.map((run) => ({
    promptId: run.promptId,
    promptText: promptText.get(run.promptId) ?? null,
    engineKey: run.engine,
    engineName: engineLabel.get(run.engine as ResolvedAiEngine["key"]) ?? run.engine,
    status: run.status,
    mocked: run.mocked,
    brandMentioned: run.brandMentioned,
    mentionCount: run.mentionCount,
    mentionContext: run.mentionContext,
    answerText: run.answerText,
    model: run.model,
    latencyMs: run.latencyMs,
    tokenUsage: run.tokenUsage,
    error: run.error,
    competitorMentions: compRows
      .filter((row) => row.resultId === run.resultId)
      .map((row) => ({ name: row.name, mentioned: row.mentioned })),
    extractedUrlCount: citationRows.filter(
      (row) => row.resultId === run.resultId && row.kind === "extracted"
    ).length,
    providerCitationCount: citationRows.filter(
      (row) => row.resultId === run.resultId && row.kind === "provider"
    ).length,
  }));
}

/* ------------------------------ share metrics ----------------------------- */

export interface ShareMetrics {
  shareOfVoice: ReturnType<typeof computeShareOfVoice>;
  citationShare: ReturnType<typeof computeCitationShare>;
}

/** Share-of-voice + citation share for one scan (nulls = not enough data). */
export async function getShareMetrics(
  workspaceId: string,
  domainId: string,
  scanId: string
): Promise<ShareMetrics | null> {
  const db = getDb();
  const [scan] = await db
    .select()
    .from(intelligenceScans)
    .where(
      and(eq(intelligenceScans.id, scanId), eq(intelligenceScans.workspaceId, workspaceId))
    )
    .limit(1);
  if (!scan || scan.domainId !== domainId) return null;

  const brandCounts = await db
    .select({
      mentionCount: sql<number>`coalesce(sum(${visibilityResults.mentionCount}), 0)::int`,
    })
    .from(visibilityRuns)
    .innerJoin(visibilityResults, eq(visibilityResults.runId, visibilityRuns.id))
    .where(and(eq(visibilityRuns.scanId, scanId), eq(visibilityRuns.status, "completed")));

  const competitorCounts = await db
    .select({
      name: competitors.name,
      count: sql<number>`count(*)::int`,
    })
    .from(competitorMentions)
    .innerJoin(visibilityResults, eq(visibilityResults.id, competitorMentions.resultId))
    .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
    .innerJoin(competitors, eq(competitors.id, competitorMentions.competitorId))
    .where(and(eq(visibilityRuns.scanId, scanId), eq(competitorMentions.mentioned, true)))
    .groupBy(competitors.name);

  const totalCompetitorMentions = competitorCounts.reduce<number>(
    (sum, row) => sum + row.count,
    0
  );

  // Citation share: ONLY genuine provider citations can contribute.
  const providerCitations = await db
    .select({
      isOwnedDomain: citations.isOwnedDomain,
      isCompetitorDomain: citations.isCompetitorDomain,
    })
    .from(citations)
    .innerJoin(visibilityResults, eq(visibilityResults.id, citations.visibilityResultId))
    .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
    .where(and(eq(visibilityRuns.scanId, scanId), eq(citations.kind, "provider")));

  return {
    shareOfVoice: computeShareOfVoice(
      brandCounts[0]?.mentionCount ?? 0,
      totalCompetitorMentions
    ),
    citationShare: computeCitationShare({ providerCitations }),
  };
}

/* -------------------------------- citations -------------------------------- */

export interface CitationRow {
  url: string;
  domain: string;
  kind: "provider" | "extracted";
  position: number | null;
  isOwnedDomain: boolean;
  isCompetitorDomain: boolean;
  promptText: string | null;
  engineKey: string;
}

export async function getCitationsForScan(
  workspaceId: string,
  domainId: string,
  scanId: string
): Promise<CitationRow[] | null> {
  const db = getDb();
  const [scan] = await db
    .select({ id: intelligenceScans.id, domainId: intelligenceScans.domainId })
    .from(intelligenceScans)
    .where(
      and(eq(intelligenceScans.id, scanId), eq(intelligenceScans.workspaceId, workspaceId))
    )
    .limit(1);
  if (!scan || scan.domainId !== domainId) return null;

  const rows = await db
    .select({
      url: citations.url,
      domain: citations.domain,
      kind: citations.kind,
      position: citations.position,
      isOwnedDomain: citations.isOwnedDomain,
      isCompetitorDomain: citations.isCompetitorDomain,
      engine: visibilityRuns.engine,
      promptId: visibilityRuns.promptId,
    })
    .from(citations)
    .innerJoin(visibilityResults, eq(visibilityResults.id, citations.visibilityResultId))
    .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
    .where(eq(visibilityRuns.scanId, scanId))
    .orderBy(citations.kind, citations.position);

  const promptIds = [...new Set(rows.map((row) => row.promptId))];
  const promptRows =
    promptIds.length > 0
      ? await db.select({ id: prompts.id, text: prompts.text }).from(prompts).where(inArray(prompts.id, promptIds))
      : [];
  const promptText = new Map(promptRows.map((row) => [row.id, row.text]));

  return rows.map((row) => ({
    url: row.url,
    domain: row.domain,
    kind: row.kind,
    position: row.position,
    isOwnedDomain: row.isOwnedDomain,
    isCompetitorDomain: row.isCompetitorDomain,
    engineKey: row.engine,
    promptText: promptText.get(row.promptId) ?? null,
  }));
}

/* ------------------------------ product pages ----------------------------- */

export interface PromptWithStatus {
  id: string;
  text: string;
  intent: string | null;
  funnelStage: string | null;
  importance: number | null;
  enabled: boolean;
  createdAt: Date;
  /** Mention status from the latest scan (null = not observed). */
  lastMentioned: boolean | null;
}

export async function getPromptsWithStatus(
  workspaceId: string,
  domainId: string
): Promise<{ prompts: PromptWithStatus[]; latestScan: IntelligenceScan | null }> {
  const db = getDb();
  const [domain] = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspaceId, workspaceId)))
    .limit(1);
  if (!domain) return { prompts: [], latestScan: null };

  const latestScan = await getLatestScan(workspaceId, domainId);
  const promptRows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.domainId, domainId))
    .orderBy(desc(prompts.importance), desc(prompts.createdAt));

  const mentionByPrompt = new Map<string, boolean>();
  if (latestScan) {
    const obs = await db
      .select({
        promptId: visibilityRuns.promptId,
        mentioned: visibilityResults.brandMentioned,
      })
      .from(visibilityRuns)
      .innerJoin(visibilityResults, eq(visibilityResults.runId, visibilityRuns.id))
      .where(and(eq(visibilityRuns.scanId, latestScan.id), eq(visibilityRuns.status, "completed")));
    for (const row of obs) {
      if (row.mentioned) mentionByPrompt.set(row.promptId, true);
      else if (!mentionByPrompt.has(row.promptId)) mentionByPrompt.set(row.promptId, false);
    }
  }

  return {
    latestScan,
    prompts: promptRows.map((prompt) => ({
      id: prompt.id,
      text: prompt.text,
      intent: prompt.intent,
      funnelStage: prompt.funnelStage,
      importance: prompt.importance,
      enabled: prompt.enabled,
      createdAt: prompt.createdAt,
      lastMentioned: latestScan ? (mentionByPrompt.get(prompt.id) ?? null) : null,
    })),
  };
}

export interface CompetitorWithStatus {
  id: string;
  name: string;
  normalizedDomain: string;
  discoveredAutomatically: boolean;
  confidence: number | null;
  mentionCountLatestScan: number;
}

export async function getCompetitorsWithStatus(
  workspaceId: string,
  domainId: string
): Promise<{ competitors: CompetitorWithStatus[]; latestScan: IntelligenceScan | null }> {
  const db = getDb();
  const [domain] = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspaceId, workspaceId)))
    .limit(1);
  if (!domain) return { competitors: [], latestScan: null };

  const latestScan = await getLatestScan(workspaceId, domainId);
  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.domainId, domainId))
    .orderBy(competitors.name);

  const mentionCounts = new Map<string, number>();
  if (latestScan) {
    const counts = await db
      .select({
        competitorId: competitorMentions.competitorId,
        count: sql<number>`count(*)::int`,
      })
      .from(competitorMentions)
      .innerJoin(visibilityResults, eq(visibilityResults.id, competitorMentions.resultId))
      .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
      .where(and(eq(visibilityRuns.scanId, latestScan.id), eq(competitorMentions.mentioned, true)))
      .groupBy(competitorMentions.competitorId);
    for (const row of counts) mentionCounts.set(row.competitorId, row.count);
  }

  return {
    latestScan,
    competitors: rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalizedDomain: row.normalizedDomain,
      discoveredAutomatically: row.discoveredAutomatically,
      confidence: row.confidence,
      mentionCountLatestScan: mentionCounts.get(row.id) ?? 0,
    })),
  };
}

/* ----------------------------- action center ------------------------------ */

export interface ActionRow extends Recommendation {
  promptText: string | null;
  competitorName: string | null;
}

export async function getRecommendationsForWorkspace(
  workspaceId: string,
  domainId?: string | null
): Promise<{ open: ActionRow[]; resolved: ActionRow[] }> {
  const db = getDb();
  const allDomains = await listDomains(workspaceId);
  const scopedIds = domainId
    ? allDomains.filter((domain) => domain.id === domainId).map((domain) => domain.id)
    : allDomains.map((domain) => domain.id);
  if (scopedIds.length === 0) return { open: [], resolved: [] };

  const rows = await db
    .select({
      rec: recommendations,
      promptText: prompts.text,
      competitorName: competitors.name,
    })
    .from(recommendations)
    .leftJoin(prompts, eq(prompts.id, recommendations.promptId))
    .leftJoin(competitors, eq(competitors.id, recommendations.competitorId))
    .where(inArray(recommendations.domainId, scopedIds));

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const mapped: ActionRow[] = rows.map((row) => ({
    ...row.rec,
    promptText: row.promptText ?? null,
    competitorName: row.competitorName ?? null,
  }));
  const sortFn = (a: ActionRow, b: ActionRow): number =>
    order[a.priority] - order[b.priority] || b.createdAt.getTime() - a.createdAt.getTime();

  return {
    open: mapped.filter((row) => row.status === "open").sort(sortFn),
    resolved: mapped
      .filter((row) => row.status !== "open")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
  };
}

/* -------------------------- dashboard overview ---------------------------- */

export interface DomainScanSummary {
  domainId: string;
  domainLabel: string;
  normalizedDomain: string;
  latestScan: {
    id: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    mocked: boolean;
    aiScore: number | null;
    aiCoverageCompleted: number;
    aiCoverageExpected: number;
    googleScore: number | null;
    googleCoverageCompleted: number;
    googleCoverageExpected: number;
  } | null;
  promptCount: number;
  openRecommendationCount: number;
}

export async function getDashboardIntelligence(
  workspaceId: string
): Promise<DomainScanSummary[]> {
  const db = getDb();
  const workspaceDomains = await listDomains(workspaceId);
  if (workspaceDomains.length === 0) return [];

  const domainIds = workspaceDomains.map((domain) => domain.id);
  const scans = await db
    .select()
    .from(intelligenceScans)
    .where(inArray(intelligenceScans.domainId, domainIds))
    .orderBy(desc(intelligenceScans.createdAt));
  const promptCounts = await db
    .select({ domainId: prompts.domainId, count: sql<number>`count(*)::int` })
    .from(prompts)
    .where(inArray(prompts.domainId, domainIds))
    .groupBy(prompts.domainId);
  const recCounts = await db
    .select({ domainId: recommendations.domainId, count: sql<number>`count(*)::int` })
    .from(recommendations)
    .where(and(inArray(recommendations.domainId, domainIds), eq(recommendations.status, "open")))
    .groupBy(recommendations.domainId);

  const promptMap = new Map(promptCounts.map((row) => [row.domainId, row.count]));
  const recMap = new Map(recCounts.map((row) => [row.domainId, row.count]));

  return workspaceDomains.map((domain) => {
    const latest = scans.find((scan) => scan.domainId === domain.id) ?? null;
    return {
      domainId: domain.id,
      domainLabel: domain.name ?? domain.normalizedDomain,
      normalizedDomain: domain.normalizedDomain,
      latestScan: latest
        ? {
            id: latest.id,
            status: latest.status,
            createdAt: latest.createdAt,
            completedAt: latest.completedAt,
            mocked: latest.mocked,
            aiScore: latest.aiScore,
            aiCoverageCompleted: latest.aiCoverageCompleted ?? 0,
            aiCoverageExpected: latest.aiCoverageExpected ?? 0,
            googleScore: latest.googleScore,
            googleCoverageCompleted: latest.googleCoverageCompleted ?? 0,
            googleCoverageExpected: latest.googleCoverageExpected ?? 0,
          }
        : null,
      promptCount: promptMap.get(domain.id) ?? 0,
      openRecommendationCount: recMap.get(domain.id) ?? 0,
    };
  });
}

/* ------------------------------ engine status ----------------------------- */

export interface EngineStatusRow {
  key: string;
  name: string;
  status: "real" | "mock" | "unavailable";
  mode: string;
  unavailableReason?: string;
  provider: string | null;
  model: string | null;
  supportsCitations: boolean;
  sourceDescription: string | null;
  mocked: boolean;
}

export async function getEngineStatuses(): Promise<EngineStatusRow[]> {
  const engines = await listAiEngines();
  return engines.map((engine) => ({
    key: engine.key,
    name: engine.name,
    status: engine.status,
    mode: engine.mode,
    unavailableReason: engine.unavailableReason,
    provider: engine.provider,
    model: engine.model,
    supportsCitations: engine.supportsCitations,
    sourceDescription: engine.sourceDescription,
    mocked: engine.adapter?.mock ?? false,
  }));
}

/** Light count of tracked prompts for a tenant-scoped domain. */
export async function getPromptCount(workspaceId: string, domainId: string): Promise<number> {
  const [domain] = await getDb()
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspaceId, workspaceId)))
    .limit(1);
  if (!domain) return 0;
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(prompts)
    .where(eq(prompts.domainId, domain.id));
  return count ?? 0;
}

/** Convenience: does any queued/running scan exist for the domain? */
export async function hasActiveScan(workspaceId: string, domainId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: intelligenceScans.id })
    .from(intelligenceScans)
    .where(
      and(
        eq(intelligenceScans.workspaceId, workspaceId),
        eq(intelligenceScans.domainId, domainId),
        inArray(intelligenceScans.status, ["queued", "running"])
      )
    )
    .limit(1);
  return Boolean(row);
}

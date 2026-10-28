import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import {
  citations,
  competitorMentions,
  keywordMetrics,
  serpResults,
  serpSnapshots,
  visibilityResults,
  visibilityRuns,
  type IntelligenceScan,
  type ScanOperation,
} from "@/lib/db/schema";
import { detectMention, domainMatches, extractUrlsFromAnswer } from "@/lib/providers/ai/mentions";
import type { AiEngineKey } from "@/lib/providers/ai/types";
import type { ResolvedAiEngine } from "@/lib/providers/ai/registry";
import {
  estimateKeywordOverviewUsd,
  estimateSerpLiveRegularUsd,
  type DataForSeoClient,
} from "@/lib/providers/dataforseo";
import type { ProviderErrorClass } from "@/lib/db/schema/types";
import type {
  AiPromptPayload,
  KeywordMetricsPayload,
  SerpPayload,
} from "@/server/services/scan/plan";

/**
 * Scan operation executors.
 *
 * Each executor:
 * 1. validates its own payload (Zod);
 * 2. calls the provider adapter (which enforces guard-before / record-after);
 * 3. persists results with UPSERTS keyed on the scan's unique constraints,
 *    so re-executing an operation can never duplicate data.
 *
 * Failures are returned as classified outcomes — never thrown — so the
 * worker can mark the operation and keep scanning (honest partial scans).
 */

export interface ScanExecutionContext {
  scan: IntelligenceScan;
  trackedDomain: string;
  /** Brand-name variants for mention detection (profile name + display name). */
  brandNames: string[];
  competitors: Array<{ id: string; name: string; normalizedDomain: string }>;
  engines: Map<AiEngineKey, ResolvedAiEngine>;
  dataForSeo: DataForSeoClient;
  workspaceId: string;
  domainId: string;
}

export interface OperationOutcome {
  status: "done" | "failed" | "skipped";
  errorClass?: ProviderErrorClass;
  error?: string | null;
  /** Provider-reported actual cost (null when not reported / mock). */
  actualCostUsd: number | null;
  /** Pre-run ESTIMATE for the attempt (0 for mock — zero spend by design). */
  estimatedCostUsd: number;
  mocked: boolean;
  /** Number of data rows produced (honest progress reporting). */
  dataCount: number;
}

const keywordMetricsPayloadSchema = z.object({
  keywords: z
    .array(z.object({ keyword: z.string().min(1), promptId: z.string().min(1) }))
    .min(1),
});

const serpPayloadSchema = z.object({
  keyword: z.string().min(1),
  promptId: z.string().min(1),
});

const aiPayloadSchema = z.object({
  promptId: z.string().min(1),
  engine: z.string().min(1),
  promptText: z.string().min(1),
});

function failure(
  errorClass: ProviderErrorClass,
  error: string,
  extra: Partial<OperationOutcome> = {}
): OperationOutcome {
  return {
    status: "failed",
    errorClass,
    error: error.slice(0, 500),
    actualCostUsd: null,
    estimatedCostUsd: 0,
    mocked: false,
    dataCount: 0,
    ...extra,
  };
}

export async function executeOperation(
  op: ScanOperation,
  context: ScanExecutionContext
): Promise<OperationOutcome> {
  try {
    switch (op.kind) {
      case "keyword_metrics":
        return await executeKeywordMetrics(op, context);
      case "serp":
        return await executeSerp(op, context);
      case "ai_prompt":
        return await executeAiPrompt(op, context);
      default:
        return failure("PROVIDER_ERROR", `Unknown operation kind: ${String(op.kind)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown operation failure";
    return failure("PROVIDER_ERROR", message);
  }
}

/* ---------------------------- keyword metrics ----------------------------- */

async function executeKeywordMetrics(
  op: ScanOperation,
  context: ScanExecutionContext
): Promise<OperationOutcome> {
  const parsed = keywordMetricsPayloadSchema.safeParse(op.payload);
  if (!parsed.success) {
    return failure("BAD_RESPONSE", "Keyword-metrics operation payload is malformed.");
  }
  const payload: KeywordMetricsPayload = parsed.data;
  const keywords = payload.keywords.map((entry) => entry.keyword);

  const result = await context.dataForSeo.keywordOverview({
    keywords,
    locationCode: context.scan.locationCode,
    languageCode: context.scan.languageCode,
    workspaceId: context.workspaceId,
    domainId: context.domainId,
    scanId: context.scan.id,
    fixtureHint: {
      trackedDomain: context.trackedDomain,
      competitors: context.competitors.map((c) => c.normalizedDomain),
    },
  });

  const db = getDb();
  for (const item of result.items) {
    const mapped = payload.keywords.find((entry) => entry.keyword === item.keyword);
    await db
      .insert(keywordMetrics)
      .values({
        scanId: context.scan.id,
        promptId: mapped?.promptId ?? null,
        keyword: item.keyword,
        provider: "dataforseo",
        locationCode: context.scan.locationCode,
        languageCode: context.scan.languageCode,
        searchVolume: item.searchVolume,
        cpc: item.cpc,
        competition: item.competition,
        competitionLevel: item.competitionLevel,
        trendMonthly: item.trendMonthly,
        trendQuarterly: item.trendQuarterly,
        trendYearly: item.trendYearly,
        intent: item.intent,
        cacheHit: result.cacheHit,
        mocked: result.mocked,
      })
      .onConflictDoUpdate({
        target: [keywordMetrics.scanId, keywordMetrics.keyword],
        set: {
          promptId: mapped?.promptId ?? null,
          searchVolume: item.searchVolume,
          cpc: item.cpc,
          competition: item.competition,
          competitionLevel: item.competitionLevel,
          trendMonthly: item.trendMonthly,
          trendQuarterly: item.trendQuarterly,
          trendYearly: item.trendYearly,
          intent: item.intent,
          cacheHit: result.cacheHit,
          mocked: result.mocked,
          retrievedAt: new Date(),
        },
      });
  }

  // Keywords the provider omitted stay absent (no row = no data) — the
  // provider does not charge for keywords it does not know.
  return {
    status: "done",
    actualCostUsd: result.actualCostUsd,
    estimatedCostUsd: result.mocked ? 0 : estimateKeywordOverviewUsd(keywords.length),
    mocked: result.mocked,
    dataCount: result.items.length,
  };
}

/* ---------------------------------- SERP ---------------------------------- */

async function executeSerp(
  op: ScanOperation,
  context: ScanExecutionContext
): Promise<OperationOutcome> {
  const parsed = serpPayloadSchema.safeParse(op.payload);
  if (!parsed.success) {
    return failure("BAD_RESPONSE", "SERP operation payload is malformed.");
  }
  const payload: SerpPayload = parsed.data;

  const result = await context.dataForSeo.serpLiveRegular({
    keyword: payload.keyword,
    locationCode: context.scan.locationCode,
    languageCode: context.scan.languageCode,
    depth: 10,
    workspaceId: context.workspaceId,
    domainId: context.domainId,
    scanId: context.scan.id,
    fixtureHint: {
      trackedDomain: context.trackedDomain,
      competitors: context.competitors.map((c) => c.normalizedDomain),
    },
  });

  // Tracked-domain rank: the best ORGANIC rank of any row on the tracked
  // domain; null when the domain is absent (absence is data, never a
  // fabricated worst-rank).
  const competitorByDomain = new Map(
    context.competitors.map((competitor) => [competitor.normalizedDomain, competitor.id])
  );
  let trackedDomainRank: number | null = null;
  let trackedDomainUrl: string | null = null;
  for (const row of result.results) {
    if (row.resultType !== "organic") continue;
    if (!domainMatches(row.domain, context.trackedDomain)) continue;
    const rank = row.rank ?? row.absoluteRank;
    if (rank != null && (trackedDomainRank == null || rank < trackedDomainRank)) {
      trackedDomainRank = rank;
      trackedDomainUrl = row.url;
    }
  }

  const db = getDb();
  const [snapshot] = await db
    .insert(serpSnapshots)
    .values({
      scanId: context.scan.id,
      promptId: payload.promptId,
      keyword: payload.keyword,
      provider: "dataforseo",
      locationCode: context.scan.locationCode,
      languageCode: context.scan.languageCode,
      trackedDomainRank,
      trackedDomainUrl,
      itemTypes: result.itemTypes,
      seResultsCount: result.seResultsCount,
      cacheHit: result.cacheHit,
      mocked: result.mocked,
    })
    .onConflictDoUpdate({
      target: [serpSnapshots.scanId, serpSnapshots.keyword],
      set: {
        promptId: payload.promptId,
        trackedDomainRank,
        trackedDomainUrl,
        itemTypes: result.itemTypes,
        seResultsCount: result.seResultsCount,
        cacheHit: result.cacheHit,
        mocked: result.mocked,
        retrievedAt: new Date(),
      },
    })
    .returning();
  if (!snapshot) {
    return failure("PROVIDER_ERROR", "Failed to persist the SERP snapshot.");
  }

  // Replace result rows wholesale — idempotent under re-execution.
  await db.delete(serpResults).where(eq(serpResults.snapshotId, snapshot.id));
  if (result.results.length > 0) {
    await db.insert(serpResults).values(
      result.results.slice(0, 25).map((row) => {
        const tracked = domainMatches(row.domain, context.trackedDomain);
        const competitorId = tracked ? null : competitorByDomain.get(row.domain) ?? null;
        return {
          snapshotId: snapshot.id,
          rank: row.rank,
          absoluteRank: row.absoluteRank,
          page: row.page,
          resultType: row.resultType,
          url: row.url,
          domain: row.domain,
          title: row.title,
          isTrackedDomain: tracked,
          isCompetitor: competitorId != null,
          competitorId,
        };
      })
    );
  }

  return {
    status: "done",
    actualCostUsd: result.actualCostUsd,
    estimatedCostUsd: result.mocked ? 0 : estimateSerpLiveRegularUsd(10),
    mocked: result.mocked,
    dataCount: result.results.length,
  };
}

/* ------------------------------- AI prompt -------------------------------- */

async function executeAiPrompt(
  op: ScanOperation,
  context: ScanExecutionContext
): Promise<OperationOutcome> {
  const parsed = aiPayloadSchema.safeParse(op.payload);
  if (!parsed.success) {
    return failure("BAD_RESPONSE", "AI operation payload is malformed.");
  }
  const payload = parsed.data as AiPromptPayload;
  const engine = context.engines.get(payload.engine);

  if (!engine?.adapter) {
    // Honest skip: the engine cannot be measured in this deployment.
    return {
      status: "skipped",
      errorClass: "CONFIGURATION",
      error: `Engine "${payload.engine}" is not available (planned or not configured).`,
      actualCostUsd: null,
      estimatedCostUsd: 0,
      mocked: false,
      dataCount: 0,
    };
  }

  const db = getDb();
  // Create the run FIRST (queued) so even a crash leaves an honest record.
  const [run] = await db
    .insert(visibilityRuns)
    .values({
      domainId: context.domainId,
      promptId: payload.promptId,
      scanId: context.scan.id,
      engine: payload.engine,
      status: "queued",
      mocked: engine.adapter.mock,
    })
    .onConflictDoUpdate({
      // The unique index is PARTIAL (WHERE scan_id IS NOT NULL) — Postgres
      // requires repeating the predicate in the conflict target.
      target: [visibilityRuns.scanId, visibilityRuns.promptId, visibilityRuns.engine],
      targetWhere: sql`"scan_id" IS NOT NULL`,
      set: { status: "queued", mocked: engine.adapter.mock, error: null },
    })
    .returning();
  if (!run) {
    return failure("PROVIDER_ERROR", "Failed to create the visibility run.");
  }

  try {
    const answer = await engine.adapter.ask({
      prompt: payload.promptText,
      ctx: {
        workspaceId: context.workspaceId,
        domainId: context.domainId,
        scanId: context.scan.id,
        runId: run.id,
      },
      // Mock-only hints; real adapters never receive brand information.
      fixtureHint: {
        brandName: context.brandNames[0] ?? null,
        domain: context.trackedDomain,
        competitors: context.competitors.map((c) => c.name),
      },
    });

    const answerText = answer.answerText.slice(0, env.MAX_STORED_AI_ANSWER_CHARS);
    const brandEvidence = detectMention(answerText, {
      brandNames: context.brandNames,
      domain: context.trackedDomain,
    });

    await db
      .update(visibilityRuns)
      .set({ status: "completed", completedAt: new Date(), error: null })
      .where(eq(visibilityRuns.id, run.id));

    // Replace the (unique) result row for this run — idempotent.
    await db.delete(visibilityResults).where(eq(visibilityResults.runId, run.id));
    const [result] = await db
      .insert(visibilityResults)
      .values({
        runId: run.id,
        brandMentioned: brandEvidence.mentioned,
        mentionCount: brandEvidence.count,
        mentionContext: brandEvidence.context,
        position: null, // not derivable deterministically from free text
        sentiment: null, // never fabricated — no deterministic model wired
        answerText,
        confidence: null, // never fabricated
        model: answer.model,
        latencyMs: answer.latencyMs,
        tokenUsage: answer.tokenUsage,
        costUsd: answer.actualCostUsd,
      })
      .returning();

    if (result) {
      // URLs inside the answer are EXTRACTED — never provider citations.
      const urls = extractUrlsFromAnswer(answerText, 10);
      if (urls.length > 0) {
        await db.insert(citations).values(
          urls.map((url, index) => ({
            visibilityResultId: result.id,
            url: url.url,
            domain: url.domain,
            kind: "extracted" as const,
            position: index + 1,
            isOwnedDomain: domainMatches(url.domain, context.trackedDomain),
            isCompetitorDomain: context.competitors.some((competitor) =>
              domainMatches(url.domain, competitor.normalizedDomain)
            ),
          }))
        );
      }
      if (context.competitors.length > 0) {
        await db.insert(competitorMentions).values(
          context.competitors.map((competitor) => ({
            resultId: result.id,
            competitorId: competitor.id,
            mentioned: detectMention(answerText, { brandNames: [competitor.name] }).mentioned,
          }))
        );
      }
    }

    return {
      status: "done",
      actualCostUsd: answer.actualCostUsd,
      // AI requests are bounded by REQUEST counters, not a price table —
      // no verified per-call price is asserted (see docs/PROVIDER_COSTS.md).
      estimatedCostUsd: 0,
      mocked: answer.mocked,
      dataCount: 1,
    };
  } catch (error) {
    const errorClass: ProviderErrorClass =
      error && typeof error === "object" && "errorClass" in error
        ? ((error as { errorClass: ProviderErrorClass }).errorClass)
        : "PROVIDER_ERROR";
    const message = error instanceof Error ? error.message : "AI request failed";
    await db
      .update(visibilityRuns)
      .set({ status: "failed", completedAt: new Date(), error: message.slice(0, 500) })
      .where(eq(visibilityRuns.id, run.id));
    return failure(errorClass, message);
  }
}

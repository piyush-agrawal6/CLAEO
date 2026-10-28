import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import {
  businessProfiles,
  competitors,
  domains,
  intelligenceScans,
  scanOperations,
  serpSnapshots,
  visibilityResults,
  visibilityRuns,
  type IntelligenceScan,
  type ScanOperation,
  type ScanStatus,
} from "@/lib/db/schema";
import { getDataForSeoClient } from "@/lib/providers/dataforseo";
import { listScannableAiEngines } from "@/lib/providers/ai/registry";
import { computeAiVisibilityScore, computeGoogleVisibilityScore } from "@/lib/scoring";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";
import {
  discoverCompetitorsFromSerp,
  generateRecommendations,
} from "@/server/services/scan/recommendations";
import {
  executeOperation,
  type OperationOutcome,
  type ScanExecutionContext,
} from "@/server/services/scan/executors";

/**
 * Scan worker.
 *
 * One "pass" claims the scan, executes pending operations until the
 * SCAN_WORKER_TIME_BUDGET_MS budget is spent, then either finalizes the
 * scan (all operations terminal) or leaves it `running` — a later pass
 * resumes exactly where it stopped (idempotent operation keys + upserts).
 *
 * Claims are atomic: the scan claim flips queued→running (a user-triggered
 * resume of an already-running scan re-claims it so the next pass continues),
 * and every operation claim is an UPDATE guarded on status='pending'. Safety
 * against two passes overlapping comes from those atomic operation claims
 * plus idempotent operation keys and upserts — not from scan-level staleness.
 */
/** Operation kinds run in a fixed order (cheap metrics → SERPs → AI). */
const KIND_ORDER = sql`case ${scanOperations.kind}
  when 'keyword_metrics' then 0
  when 'serp' then 1
  else 2 end`;

export interface ScanPassResult {
  scanId: string;
  status: ScanStatus;
  processedOperations: number;
  done: boolean;
}

async function claimScan(scanId: string): Promise<IntelligenceScan | null> {
  const now = new Date();
  const [claimed] = await getDb()
    .update(intelligenceScans)
    .set({
      status: "running",
      startedAt: sql`coalesce(${intelligenceScans.startedAt}, ${now})`,
    })
    .where(
      and(
        eq(intelligenceScans.id, scanId),
        inArray(intelligenceScans.status, ["queued", "running"])
      )
    )
    .returning();
  return claimed ?? null;
}

async function claimNextOperation(scanId: string): Promise<ScanOperation | null> {
  // SELECT the next pending operation (fixed kind order), then claim it with
  // an atomic UPDATE guarded on status — a concurrent worker loses cleanly.
  const [candidate] = await getDb()
    .select({ id: scanOperations.id })
    .from(scanOperations)
    .where(and(eq(scanOperations.scanId, scanId), eq(scanOperations.status, "pending")))
    .orderBy(KIND_ORDER, asc(scanOperations.createdAt))
    .limit(1);
  if (!candidate) return null;

  const [op] = await getDb()
    .update(scanOperations)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${scanOperations.attempts} + 1`,
    })
    .where(
      and(eq(scanOperations.id, candidate.id), eq(scanOperations.status, "pending"))
    )
    .returning();
  return op ?? null;
}

async function operationCounts(scanId: string): Promise<{ pending: number; running: number; done: number; failed: number; skipped: number }> {
  const rows = await getDb()
    .select({ status: scanOperations.status, count: sql<number>`count(*)::int` })
    .from(scanOperations)
    .where(eq(scanOperations.scanId, scanId))
    .groupBy(scanOperations.status);
  const counts = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    counts[row.status as keyof typeof counts] = row.count;
  }
  return counts;
}

async function loadScanContext(scan: IntelligenceScan): Promise<ScanExecutionContext> {
  const db = getDb();
  const [domainRow] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, scan.domainId))
    .limit(1);
  const competitorRows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.domainId, scan.domainId));
  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, scan.workspaceId))
    .limit(1);

  const trackedDomain = domainRow?.normalizedDomain ?? "";
  // Brand detection target = the explicit profile name only. The domain
  // itself is passed separately to detectMention(), which matches the full
  // domain plus its bare label ONLY as a proper-noun reference — putting the
  // display name here as well would re-introduce case-insensitive matches
  // inside foreign hostnames ("industry-week.example") and prose ("for
  // example"), fabricating brand mentions the answer never made.
  const brandNames = [
    ...new Set(
      [profile?.name].filter((name): name is string => Boolean(name && name.trim()))
    ),
  ];

  const engines = await listScannableAiEngines(env.MAX_AI_ENGINES_PER_SCAN);
  return {
    scan,
    trackedDomain,
    brandNames,
    competitors: competitorRows.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedDomain: c.normalizedDomain,
    })),
    engines: new Map(engines.map((engine) => [engine.key, engine])),
    dataForSeo: getDataForSeoClient(),
    workspaceId: scan.workspaceId,
    domainId: scan.domainId,
  };
}

async function persistOutcome(scanId: string, op: ScanOperation, outcome: OperationOutcome): Promise<void> {
  const db = getDb();
  await db
    .update(scanOperations)
    .set({
      status: outcome.status,
      error: outcome.error ?? null,
      errorClass: outcome.errorClass ?? null,
      completedAt: new Date(),
    })
    .where(eq(scanOperations.id, op.id));

  const costDelta = outcome.actualCostUsd ?? outcome.estimatedCostUsd;
  await db
    .update(intelligenceScans)
    .set({
      completedOperations: sql`${intelligenceScans.completedOperations} + ${outcome.status === "done" ? 1 : 0}`,
      failedOperations: sql`${intelligenceScans.failedOperations} + ${outcome.status !== "done" ? 1 : 0}`,
      providerCostUsd: sql`${intelligenceScans.providerCostUsd} + ${costDelta}`,
    })
    .where(eq(intelligenceScans.id, scanId));
}

/**
 * One worker pass. Safe to call repeatedly: pending operations are claimed
 * atomically, everything is idempotent, and a finished scan finalizes once.
 */
export async function runScanPass(scanId: string): Promise<ScanPassResult> {
  const db = getDb();
  const scan = await claimScan(scanId);
  if (!scan) {
    const [current] = await db
      .select({ status: intelligenceScans.status })
      .from(intelligenceScans)
      .where(eq(intelligenceScans.id, scanId))
      .limit(1);
    return {
      scanId,
      status: current?.status ?? "failed",
      processedOperations: 0,
      done: true,
    };
  }

  const context = await loadScanContext(scan);
  const deadline = Date.now() + env.SCAN_WORKER_TIME_BUDGET_MS;
  let processed = 0;
  let spendCapReached = false;

  while (Date.now() < deadline) {
    // Cancellation can happen between operations — respect it promptly.
    const [fresh] = await db
      .select({ status: intelligenceScans.status })
      .from(intelligenceScans)
      .where(eq(intelligenceScans.id, scanId))
      .limit(1);
    if (!fresh || fresh.status === "cancelled") break;

    if (spendCapReached || scan.providerCostUsd >= env.MAX_PROVIDER_SPEND_PER_SCAN_USD) {
      // Mark every remaining pending operation honestly as skipped-by-cap.
      spendCapReached = true;
      await db
        .update(scanOperations)
        .set({
          status: "skipped",
          error: "Per-scan provider spend cap reached.",
          errorClass: "SPEND_CAP",
          completedAt: new Date(),
        })
        .where(and(eq(scanOperations.scanId, scanId), eq(scanOperations.status, "pending")));
      metrics.increment("scan.spend_cap_reached", { scanId });
      break;
    }

    const op = await claimNextOperation(scanId);
    if (!op) break;

    const outcome = await executeOperation(op, context);
    await persistOutcome(scanId, op, outcome);
    scan.providerCostUsd += outcome.actualCostUsd ?? outcome.estimatedCostUsd;
    processed++;
  }

  const counts = await operationCounts(scanId);
  const done = counts.pending === 0 && counts.running === 0;
  if (done) {
    await finalizeScan(scanId);
  }

  const [final] = await db
    .select({ status: intelligenceScans.status })
    .from(intelligenceScans)
    .where(eq(intelligenceScans.id, scanId))
    .limit(1);
  const status = final?.status ?? "failed";
  metrics.increment("scan.pass_finished", { status });
  return { scanId, status, processedOperations: processed, done };
}

/** Computes and persists scores, discovers competitors, writes recs. */
async function finalizeScan(scanId: string): Promise<void> {
  const db = getDb();

  /* ---- AI visibility score (failed observations excluded) ---- */
  const aiRows = await db
    .select({
      mentioned: visibilityResults.brandMentioned,
      mentionCount: visibilityResults.mentionCount,
    })
    .from(visibilityRuns)
    .innerJoin(visibilityResults, eq(visibilityResults.runId, visibilityRuns.id))
    .where(and(eq(visibilityRuns.scanId, scanId), eq(visibilityRuns.status, "completed")));
  const [{ count: aiPlanned }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanOperations)
    .where(and(eq(scanOperations.scanId, scanId), eq(scanOperations.kind, "ai_prompt")));

  const aiScore = computeAiVisibilityScore({
    observations: aiRows.map((row) => ({ mentioned: row.mentioned })),
    coverageExpected: aiPlanned ?? 0,
  });

  /* ---- Google visibility score (SERP data only) ---- */
  const snapshotRanks = await db
    .select({ rank: serpSnapshots.trackedDomainRank })
    .from(serpSnapshots)
    .where(eq(serpSnapshots.scanId, scanId));
  const [{ count: serpPlanned }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanOperations)
    .where(and(eq(scanOperations.scanId, scanId), eq(scanOperations.kind, "serp")));

  const googleScore = computeGoogleVisibilityScore({
    ranks: snapshotRanks.map((row) => row.rank),
    coverageExpected: serpPlanned ?? 0,
  });

  /* ---- status ---- */
  const counts = await operationCounts(scanId);
  const status: ScanStatus =
    counts.failed + counts.skipped > 0 && counts.done === 0
      ? "failed"
      : counts.failed + counts.skipped > 0
        ? "partial"
        : "completed";
  const errorSummary =
    counts.failed + counts.skipped > 0
      ? `${counts.failed} operation(s) failed, ${counts.skipped} skipped.`
      : null;

  await db
    .update(intelligenceScans)
    .set({
      status,
      error: errorSummary,
      completedAt: new Date(),
      aiScore: aiScore.score,
      aiScoreFormulaVersion: aiScore.formulaVersion,
      aiCoverageExpected: aiScore.coverageExpected,
      aiCoverageCompleted: aiScore.coverageCompleted,
      googleScore: googleScore.score,
      googleScoreFormulaVersion: googleScore.formulaVersion,
      googleCoverageExpected: googleScore.coverageExpected,
      googleCoverageCompleted: googleScore.coverageCompleted,
    })
    .where(eq(intelligenceScans.id, scanId));

  /* ---- downstream: competitor discovery + recommendations ---- */
  try {
    await discoverCompetitorsFromSerp(scanId);
    const [scan] = await db
      .select()
      .from(intelligenceScans)
      .where(eq(intelligenceScans.id, scanId))
      .limit(1);
    if (scan) {
      await generateRecommendations(scan);
    }
  } catch (error) {
    // Recommendations/discovery must never fail a finished scan.
    logger.warn("Post-scan enrichment failed", { scanId, error });
  }
  logger.info("Scan finalized", {
    scanId,
    status,
    aiScore: aiScore.score,
    googleScore: googleScore.score,
  });
}

export { operationCounts };
export type { ScanStatus };

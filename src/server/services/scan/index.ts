import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ConfigurationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import {
  domains,
  intelligenceScans,
  prompts,
  scanOperations,
  type IntelligenceScan,
} from "@/lib/db/schema";
import { getDataForSeoClient } from "@/lib/providers/dataforseo";
import { listScannableAiEngines } from "@/lib/providers/ai/registry";
import { metrics } from "@/lib/logging/metrics";
import { buildScanPlan } from "@/server/services/scan/plan";
import { runScanPass, type ScanPassResult } from "@/server/services/scan/worker";

/**
 * Scan orchestration entry points (server-side only).
 *
 * - createAndRunScan: the ONLY way a scan starts — a direct user action.
 *   Nothing here runs on page load, login, navigation or startup.
 * - resumeScan: continues an interrupted (`running`) or queued scan.
 * - cancelScan: flips a queued/running scan to cancelled; pending operations
 *   are skipped and already-collected data is kept (honest partial scan).
 *
 * Tenant isolation: every entry point loads rows scoped by BOTH the domain
 * and the workspace — a foreign workspace id simply finds nothing.
 */

/** Inline passes over the worker per user trigger (mock scans finish in one). */
const MAX_INLINE_PASSES = 3;

export interface ScanServiceResult {
  scanId: string;
  status: IntelligenceScan["status"];
  /** True while operations remain (time budget spent); user may resume. */
  needsResume: boolean;
}

async function runPasses(scanId: string): Promise<ScanServiceResult> {
  let last: ScanPassResult | null = null;
  for (let pass = 0; pass < MAX_INLINE_PASSES; pass++) {
    last = await runScanPass(scanId);
    if (last.done) break;
    if (last.processedOperations === 0) break; // budget/cap/cancel — no progress
  }
  const status = last?.status ?? "failed";
  metrics.increment("scan.run_finished", { status });
  return { scanId, status, needsResume: !last?.done };
}

export async function createAndRunScan(input: {
  workspaceId: string;
  domainId: string;
}): Promise<ScanServiceResult> {
  const db = getDb();

  // Tenant isolation: the domain MUST belong to this workspace.
  const [domainRow] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, input.domainId), eq(domains.workspaceId, input.workspaceId)))
    .limit(1);
  if (!domainRow) {
    throw new ConfigurationError("Domain not found for this workspace.");
  }

  // Nothing to scan without at least one tracked prompt — say so instead of
  // spending provider credits on an empty plan.
  const promptRows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.domainId, input.domainId), eq(prompts.enabled, true)))
    .orderBy(
      sql`${prompts.importance} desc nulls last`,
      desc(prompts.createdAt)
    );
  if (promptRows.length === 0) {
    throw new ConfigurationError(
      "This domain has no enabled prompts yet. Add at least one question to track before scanning."
    );
  }

  const engines = await listScannableAiEngines(env.MAX_AI_ENGINES_PER_SCAN);
  const plan = buildScanPlan({
    prompts: promptRows.map((prompt) => ({
      id: prompt.id,
      text: prompt.text,
      importance: prompt.importance,
    })),
    engines: engines.map((engine) => ({ key: engine.key })),
  });

  // `mocked` is true only when EVERY provider involved in this scan is mock —
  // a single real engine or real DataForSEO makes the whole scan non-mock,
  // while per-row `mocked` flags keep the granular truth.
  const mocked =
    getDataForSeoClient().mock && engines.every((engine) => engine.adapter?.mock === true);

  const [scan] = await db
    .insert(intelligenceScans)
    .values({
      workspaceId: input.workspaceId,
      domainId: input.domainId,
      status: "queued",
      trigger: "manual",
      expectedOperations: plan.operations.length,
      mocked,
    })
    .returning();
  if (!scan) {
    throw new ConfigurationError("Failed to create the scan.");
  }

  if (plan.operations.length > 0) {
    await db.insert(scanOperations).values(
      plan.operations.map((operation) => ({
        scanId: scan.id,
        kind: operation.kind,
        operationKey: operation.operationKey,
        payload: operation.payload as unknown as Record<string, unknown>,
      }))
    );
  }

  metrics.increment("scan.created", {
    operations: String(plan.operations.length),
    mocked: String(mocked),
  });
  return runPasses(scan.id);
}

export async function resumeScan(input: {
  workspaceId: string;
  scanId: string;
}): Promise<ScanServiceResult> {
  const [scan] = await getDb()
    .select()
    .from(intelligenceScans)
    .where(
      and(
        eq(intelligenceScans.id, input.scanId),
        eq(intelligenceScans.workspaceId, input.workspaceId)
      )
    )
    .limit(1);
  if (!scan) {
    throw new ConfigurationError("Scan not found for this workspace.");
  }
  if (scan.status !== "running" && scan.status !== "queued") {
    throw new ConfigurationError(`A ${scan.status} scan cannot be resumed.`);
  }
  return runPasses(scan.id);
}

export async function cancelScan(input: {
  workspaceId: string;
  scanId: string;
}): Promise<{ scanId: string; cancelled: boolean }> {
  const db = getDb();
  const [cancelled] = await db
    .update(intelligenceScans)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(intelligenceScans.id, input.scanId),
        eq(intelligenceScans.workspaceId, input.workspaceId),
        inArray(intelligenceScans.status, ["queued", "running"])
      )
    )
    .returning({ id: intelligenceScans.id });
  if (!cancelled) {
    return { scanId: input.scanId, cancelled: false };
  }
  await db
    .update(scanOperations)
    .set({
      status: "skipped",
      error: "Scan cancelled.",
      completedAt: new Date(),
    })
    .where(
      and(eq(scanOperations.scanId, input.scanId), eq(scanOperations.status, "pending"))
    );
  metrics.increment("scan.cancelled", {});
  return { scanId: input.scanId, cancelled: true };
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { ConfigurationError } from "@/lib/errors";
import {
  InMemoryRedisClient,
  getRedis,
  setRedisForTesting,
} from "@/lib/redis";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import {
  businessProfiles,
  competitors,
  competitorMentions,
  citations,
  domains,
  intelligenceScans,
  keywordMetrics,
  prompts,
  recommendations,
  scanOperations,
  serpSnapshots,
  users,
  visibilityResults,
  visibilityRuns,
  workspaces,
} from "@/lib/db/schema";
import { buildScanPlan } from "@/server/services/scan/plan";
import {
  cancelScan,
  createAndRunScan,
  resumeScan,
} from "@/server/services/scan";
import { runScanPass } from "@/server/services/scan/worker";
import { utcDayKey } from "@/lib/usage/guards";

/**
 * Scan engine integration tests (PGlite + in-memory Redis + mock providers).
 *
 * These exercise the WHOLE Phase 3 pipeline — plan → operations → mock
 * provider calls → normalized persistence → scoring → recommendations —
 * with ZERO network and ZERO provider spend by construction.
 */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await setupTestDb();
  setRedisForTesting(new InMemoryRedisClient());
});

afterAll(async () => {
  await testDb?.close();
  setRedisForTesting(null);
});

let seedCounter = 0;
async function seedWorkspace(fixture: {
  prompts: Array<{ text: string; importance?: number | null }>;
}) {
  const db = getDb();
  const suffix = `s${++seedCounter}`;
  const [user] = await db
    .insert(users)
    .values({
      id: `user-${suffix}`,
      name: "Test User",
      email: `user-${suffix}@example.com`,
      emailVerified: new Date(),
    })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "W", slug: `w-${suffix}`, ownerId: user!.id })
    .returning();
  const [domain] = await db
    .insert(domains)
    .values({
      workspaceId: workspace!.id,
      domain: "https://acme.example",
      normalizedDomain: "acme.example",
      status: "ready",
    })
    .returning();
  const promptRows =
    fixture.prompts.length > 0
      ? await db
          .insert(prompts)
          .values(
            fixture.prompts.map((prompt) => ({
              domainId: domain!.id,
              text: prompt.text,
              normalizedText: prompt.text.toLowerCase(),
              importance: prompt.importance ?? null,
              source: "manual" as const,
              enabled: true,
            }))
          )
          .returning()
      : [];
  await db.insert(competitors).values({
    domainId: domain!.id,
    name: "Rival Co",
    domain: "rival.example",
    normalizedDomain: "rival.example",
    discoveredAutomatically: false,
  });
  await db.insert(businessProfiles).values({
    workspaceId: workspace!.id,
    domainId: domain!.id,
    name: "Acme Analytics",
  });
  return {
    workspaceId: workspace!.id,
    domainId: domain!.id,
    prompts: promptRows,
  };
}

/* -------------------------------- plan caps ------------------------------- */

describe("buildScanPlan", () => {
  it("caps every provider-facing list and stays deterministic", () => {
    const manyPrompts = Array.from({ length: 15 }, (_, index) => ({
      id: `p${index}`,
      text: `question number ${index}`,
      importance: null,
    }));
    const engines = [{ key: "gemini" as const }, { key: "llama" as const }];

    const plan = buildScanPlan({ prompts: manyPrompts, engines });
    const serpOps = plan.operations.filter((op) => op.kind === "serp");
    const aiOps = plan.operations.filter((op) => op.kind === "ai_prompt");
    const keywordOps = plan.operations.filter((op) => op.kind === "keyword_metrics");

    expect(keywordOps).toHaveLength(1); // ONE overview batch
    expect(keywordOps[0]?.payload.keywords).toHaveLength(10); // MAX_KEYWORDS_PER_SEARCH_SCAN
    expect(serpOps).toHaveLength(4); // DataForSEO budget 5 − 1 batch request
    expect(aiOps).toHaveLength(20); // 10 prompts × 2 engines = MAX_AI_REQUESTS_PER_SCAN
    // Total DataForSEO requests: 1 batch + 4 SERPs = 5 ≤ MAX_DATAFORSEO_REQUESTS_PER_SCAN.
    expect(1 + serpOps.length).toBeLessThanOrEqual(5);

    // Deterministic operation keys.
    const keys = plan.operations.map((op) => op.operationKey);
    expect(new Set(keys).size).toBe(keys.length);
    const again = buildScanPlan({ prompts: manyPrompts, engines });
    expect(again.operations.map((op) => op.operationKey)).toEqual(keys);
  });
});

/* ------------------------------ full scan e2e ----------------------------- */

describe("scan engine (mock providers)", () => {
  it(
    "runs a full scan end-to-end with honest data, scores and zero spend",
    async () => {
      const seed = await seedWorkspace({
        prompts: [
          { text: "fixture-nobrand: best analytics tools?", importance: 5 },
          { text: "best analytics tools", importance: 3 },
          { text: "fixture-absent analytics reporting", importance: null },
        ],
      });

      const result = await createAndRunScan({
        workspaceId: seed.workspaceId,
        domainId: seed.domainId,
      });

      expect(result.status).toBe("completed");
      expect(result.needsResume).toBe(false);

      const db = getDb();
      const [scan] = await db
        .select()
        .from(intelligenceScans)
        .where(eq(intelligenceScans.id, result.scanId))
        .limit(1);
      expect(scan?.mocked).toBe(true); // every provider in this scan was mock
      expect(scan?.expectedOperations).toBe(10); // 1 + 3 + 6
      expect(scan?.completedOperations).toBe(10);
      expect(scan?.failedOperations).toBe(0);
      expect(scan?.providerCostUsd).toBe(0); // mock implies zero spend
      expect(scan?.aiScoreFormulaVersion).toBe("ai_visibility_v1");
      expect(scan?.googleScoreFormulaVersion).toBe("google_visibility_v1");

      // Scores: real numbers from real (mock-provider) evidence.
      expect(scan?.aiCoverageCompleted).toBe(6); // 3 prompts × 2 engines
      expect(scan?.aiScore).not.toBeNull();
      expect(scan!.aiScore!).toBeGreaterThanOrEqual(0);
      expect(scan!.aiScore!).toBeLessThanOrEqual(100);
      // SERP: 2 keywords rank the tracked domain, "fixture-absent" does not.
      expect(scan?.googleCoverageCompleted).toBe(3);
      expect(scan!.googleScore!).toBeGreaterThan(0);
      expect(scan!.googleScore!).toBeLessThan(100);

      // Operations all terminal + engine assignment (primary first).
      const ops = await db
        .select()
        .from(scanOperations)
        .where(eq(scanOperations.scanId, scan!.id));
      expect(ops).toHaveLength(10);
      expect(ops.every((op) => op.status === "done")).toBe(true);
      const aiEnginesUsed = new Set(
        ops
          .filter((op) => op.kind === "ai_prompt")
          .map((op) => (op.payload as { engine: string }).engine)
      );
      expect([...aiEnginesUsed].sort()).toEqual(["gemini", "llama"]);

      // Persisted provider data.
      const metricRows = await db
        .select()
        .from(keywordMetrics)
        .where(eq(keywordMetrics.scanId, scan!.id));
      expect(metricRows).toHaveLength(3);
      expect(metricRows.every((row) => row.mocked)).toBe(true);

      const snapshots = await db
        .select()
        .from(serpSnapshots)
        .where(eq(serpSnapshots.scanId, scan!.id));
      expect(snapshots).toHaveLength(3);
      const absent = snapshots.find((row) => row.keyword.includes("fixture-absent"));
      expect(absent?.trackedDomainRank).toBeNull(); // absence = null, never fabricated
      expect(snapshots.filter((row) => row.trackedDomainRank != null)).toHaveLength(2);

      const runs = await db
        .select()
        .from(visibilityRuns)
        .where(eq(visibilityRuns.scanId, scan!.id));
      expect(runs).toHaveLength(6);
      expect(runs.every((run) => run.status === "completed")).toBe(true);
      expect(runs.every((run) => run.mocked)).toBe(true);

      // Citations: only kind='extracted' can exist from plain answers.
      const citationRows = await db
        .select()
        .from(citations)
        .innerJoin(
          visibilityResults,
          eq(visibilityResults.id, citations.visibilityResultId)
        )
        .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
        .where(eq(visibilityRuns.scanId, scan!.id));
      expect(citationRows.length).toBeGreaterThan(0);
      expect(citationRows.every((row) => row.citations.kind === "extracted")).toBe(true);

      const mentionRows = await db
        .select()
        .from(competitorMentions)
        .innerJoin(
          visibilityResults,
          eq(visibilityResults.id, competitorMentions.resultId)
        )
        .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
        .where(eq(visibilityRuns.scanId, scan!.id));
      expect(mentionRows).toHaveLength(6); // one per observation for "Rival Co"

      // Zero spend by construction: no guard counters were consumed.
      expect(await getRedis().get(`usage:dataforseo_request:daily:${utcDayKey()}`)).toBeNull();
      expect(await getRedis().get(`usage:llm_request:daily:${utcDayKey()}`)).toBeNull();

      // Deterministic, evidence-based recommendations exist.
      const recRows = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.domainId, seed.domainId));
      const absentRec = recRows.find(
        (rec) => rec.dedupKey === `brand_absent:${seed.prompts[0]!.id}`
      );
      expect(absentRec?.status).toBe("open");
      expect(absentRec?.priority).toBe("high"); // importance 5 ≥ 4
      expect(absentRec?.category).toBe("ai_visibility");
      expect(absentRec?.sourceScanId).toBe(scan!.id);

      const serpRec = recRows.find((rec) =>
        rec.dedupKey?.startsWith("serp_absent:fixture-absent")
      );
      expect(serpRec?.promptId).toBe(seed.prompts[2]!.id);
      // No low-rank recommendations: mock ranks are all page-one top-5.
      expect(recRows.some((rec) => rec.dedupKey?.startsWith("serp_low_rank:"))).toBe(
        false
      );

      // SERP-based competitor discovery (suggestions, clearly labeled).
      const discovered = await db
        .select()
        .from(competitors)
        .where(and(eq(competitors.domainId, seed.domainId), eq(competitors.discoveredAutomatically, true)));
      expect(discovered.length).toBeGreaterThan(0);
      expect(discovered.every((row) => row.confidence != null && row.confidence > 0)).toBe(true);
      expect(discovered.some((row) => row.normalizedDomain === "acme.example")).toBe(false);

      // ---- second scan on the same domain: idempotent recommendations ----
      const second = await createAndRunScan({
        workspaceId: seed.workspaceId,
        domainId: seed.domainId,
      });
      expect(second.status).toBe("completed");
      const absentRecsAfter = await db
        .select()
        .from(recommendations)
        .where(
          and(
            eq(recommendations.domainId, seed.domainId),
            eq(recommendations.dedupKey, `brand_absent:${seed.prompts[0]!.id}`)
          )
        );
      expect(absentRecsAfter).toHaveLength(1); // refreshed, never duplicated
      expect(absentRecsAfter[0]?.sourceScanId).toBe(second.scanId);

      // ---- idempotency: re-running a finished scan changes nothing ----
      const runsBefore = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(visibilityRuns)
        .where(eq(visibilityRuns.scanId, second.scanId));
      const replay = await runScanPass(second.scanId);
      expect(replay.done).toBe(true);
      expect(replay.processedOperations).toBe(0);
      const runsAfter = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(visibilityRuns)
        .where(eq(visibilityRuns.scanId, second.scanId));
      expect(runsAfter[0]?.count).toBe(runsBefore[0]?.count);

      // ---- auto-close: deleting the prompt makes the condition vanish ----
      await db.delete(prompts).where(eq(prompts.id, seed.prompts[0]!.id));
      const third = await createAndRunScan({
        workspaceId: seed.workspaceId,
        domainId: seed.domainId,
      });
      expect(third.status).toBe("completed");
      const closed = await db
        .select()
        .from(recommendations)
        .where(
          and(
            eq(recommendations.domainId, seed.domainId),
            eq(recommendations.dedupKey, `brand_absent:${seed.prompts[0]!.id}`)
          )
        );
      expect(closed[0]?.status).toBe("done");
      expect(closed[0]?.explanation).toContain("Auto-closed");
    },
    60_000
  );

  it("refuses to scan a domain with no enabled prompts", async () => {
    const seed = await seedWorkspace({ prompts: [] });
    await expect(
      createAndRunScan({ workspaceId: seed.workspaceId, domainId: seed.domainId })
    ).rejects.toThrow(/no enabled prompts/);
  });

  it("enforces tenant isolation on every entry point", async () => {
    const seed = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const other = await seedWorkspace({
      prompts: [{ text: "other prompt", importance: 3 }],
    });
    const db = getDb();
    const [scan] = await db
      .insert(intelligenceScans)
      .values({ workspaceId: seed.workspaceId, domainId: seed.domainId, status: "queued" })
      .returning();

    await expect(
      createAndRunScan({ workspaceId: other.workspaceId, domainId: seed.domainId })
    ).rejects.toThrow(ConfigurationError);
    await expect(
      resumeScan({ workspaceId: other.workspaceId, scanId: scan!.id })
    ).rejects.toThrow(ConfigurationError);
    const foreignCancel = await cancelScan({
      workspaceId: other.workspaceId,
      scanId: scan!.id,
    });
    expect(foreignCancel.cancelled).toBe(false);
  });

  it("honors the per-scan spend cap by skipping remaining work", async () => {
    const seed = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const db = getDb();
    const [scan] = await db
      .insert(intelligenceScans)
      .values({
        workspaceId: seed.workspaceId,
        domainId: seed.domainId,
        status: "queued",
        expectedOperations: 2,
        // Simulate a scan that already spent over the cap.
        providerCostUsd: 1,
      })
      .returning();
    await db.insert(scanOperations).values([
      { scanId: scan!.id, kind: "serp", operationKey: "serp:a", payload: { keyword: "a", promptId: seed.prompts[0]!.id } },
      { scanId: scan!.id, kind: "serp", operationKey: "serp:b", payload: { keyword: "b", promptId: seed.prompts[0]!.id } },
    ]);

    const pass = await runScanPass(scan!.id);
    expect(pass.done).toBe(true);
    const ops = await db
      .select()
      .from(scanOperations)
      .where(eq(scanOperations.scanId, scan!.id));
    expect(ops.every((op) => op.status === "skipped")).toBe(true);
    expect(ops.every((op) => op.errorClass === "SPEND_CAP")).toBe(true);
    const [finalScan] = await db
      .select()
      .from(intelligenceScans)
      .where(eq(intelligenceScans.id, scan!.id))
      .limit(1);
    expect(finalScan?.status).toBe("failed"); // nothing completed → failed
    expect(finalScan?.error).toContain("failed");
  });

  it("resumes a stale running scan after a crash", async () => {
    const seed = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const db = getDb();
    const [scan] = await db
      .insert(intelligenceScans)
      .values({
        workspaceId: seed.workspaceId,
        domainId: seed.domainId,
        status: "running",
        startedAt: new Date(Date.now() - 20 * 60 * 1000), // stale
        expectedOperations: 1,
      })
      .returning();
    await db.insert(scanOperations).values({
      scanId: scan!.id,
      kind: "ai_prompt",
      operationKey: `ai:${seed.prompts[0]!.id}:gemini`,
      payload: {
        promptId: seed.prompts[0]!.id,
        engine: "gemini",
        promptText: "best analytics tools",
      },
    });

    const pass = await runScanPass(scan!.id);
    expect(pass.processedOperations).toBe(1);
    expect(pass.status).toBe("completed");
    const [finalScan] = await db
      .select()
      .from(intelligenceScans)
      .where(eq(intelligenceScans.id, scan!.id))
      .limit(1);
    expect(finalScan?.aiCoverageCompleted).toBe(1);
    expect(finalScan?.aiScore).not.toBeNull();
  });

  it("cancels queued scans and skips their pending operations", async () => {
    const seed = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const db = getDb();
    const [scan] = await db
      .insert(intelligenceScans)
      .values({ workspaceId: seed.workspaceId, domainId: seed.domainId, status: "queued" })
      .returning();
    await db.insert(scanOperations).values({
      scanId: scan!.id,
      kind: "serp",
      operationKey: "serp:best analytics tools",
      payload: { keyword: "best analytics tools", promptId: seed.prompts[0]!.id },
    });

    const cancelled = await cancelScan({ workspaceId: seed.workspaceId, scanId: scan!.id });
    expect(cancelled.cancelled).toBe(true);

    const pass = await runScanPass(scan!.id); // nothing to claim
    expect(pass.done).toBe(true);
    expect(pass.status).toBe("cancelled");
    expect(pass.processedOperations).toBe(0);

    const ops = await db
      .select()
      .from(scanOperations)
      .where(eq(scanOperations.scanId, scan!.id));
    expect(ops[0]?.status).toBe("skipped");
    expect(ops[0]?.error).toContain("cancelled");

    await expect(
      resumeScan({ workspaceId: seed.workspaceId, scanId: scan!.id })
    ).rejects.toThrow(/cancelled scan cannot be resumed/);
  });

  it("keeps run data isolated per scan and workspace", async () => {
    const seedA = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const seedB = await seedWorkspace({
      prompts: [{ text: "best analytics tools", importance: 3 }],
    });
    const a = await createAndRunScan({ workspaceId: seedA.workspaceId, domainId: seedA.domainId });
    const b = await createAndRunScan({ workspaceId: seedB.workspaceId, domainId: seedB.domainId });
    const db = getDb();

    const runsA = await db
      .select()
      .from(visibilityRuns)
      .where(eq(visibilityRuns.scanId, a.scanId));
    expect(runsA).toHaveLength(2);
    expect(runsA.every((run) => run.domainId === seedA.domainId)).toBe(true);

    const runsB = await db
      .select({ domainId: visibilityRuns.domainId })
      .from(visibilityRuns)
      .where(eq(visibilityRuns.scanId, b.scanId));
    expect(runsB.every((run) => run.domainId === seedB.domainId)).toBe(true);

    const recsA = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.domainId, seedA.domainId));
    expect(recsA.every((rec) => rec.domainId === seedA.domainId)).toBe(true);
  });
});

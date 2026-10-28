import { afterAll, beforeAll, expect, it, describe } from "vitest";
import { InMemoryRedisClient, setRedisForTesting } from "@/lib/redis";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import {
  businessProfiles,
  citations,
  competitors,
  competitorMentions,
  domains,
  intelligenceScans,
  prompts,
  recommendations,
  users,
  visibilityResults,
  visibilityRuns,
  workspaces,
} from "@/lib/db/schema";
import {
  getAiObservations,
  getCitationsForScan,
  getLatestScan,
  getPrimaryDomain,
  getPromptCount,
  getRecommendationsForWorkspace,
  getShareMetrics,
} from "@/features/intelligence/queries";

/**
 * Intelligence read-model tests: tenant isolation and null (not enough data)
 * semantics are the contract these tests lock down.
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

let counter = 0;
async function seed() {
  const db = getDb();
  const suffix = `q${++counter}`;
  const [user] = await db
    .insert(users)
    .values({
      id: `user-${suffix}`,
      name: "T",
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
  const [prompt] = await db
    .insert(prompts)
    .values({
      domainId: domain!.id,
      text: "best analytics tools",
      normalizedText: "best analytics tools",
      source: "manual",
      enabled: true,
    })
    .returning();
  await db.insert(businessProfiles).values({
    workspaceId: workspace!.id,
    domainId: domain!.id,
    name: "Acme Analytics",
  });
  return { workspaceId: workspace!.id, domainId: domain!.id, promptId: prompt!.id };
}

/** Insert a scan with one completed run (+ optional result). */
async function seedScan(input: {
  workspaceId: string;
  domainId: string;
  promptId: string;
  engine?: string;
  brandMentioned?: boolean;
  mentionCount?: number;
}) {
  const db = getDb();
  const [scan] = await db
    .insert(intelligenceScans)
    .values({ workspaceId: input.workspaceId, domainId: input.domainId, status: "running" })
    .returning();
  const [run] = await db
    .insert(visibilityRuns)
    .values({
      domainId: input.domainId,
      promptId: input.promptId,
      scanId: scan!.id,
      engine: input.engine ?? "gemini",
      status: "completed",
      mocked: true,
    })
    .returning();
  const [result] = await db
    .insert(visibilityResults)
    .values({
      runId: run!.id,
      brandMentioned: input.brandMentioned ?? false,
      mentionCount: input.mentionCount ?? (input.brandMentioned ? 1 : 0),
    })
    .returning();
  return { scanId: scan!.id, runId: run!.id, resultId: result!.id };
}

describe("intelligence queries", () => {
  it("resolves the primary domain tenant-scoped with honest fallbacks", async () => {
    const a = await seed();
    const b = await seed();

    const fallback = await getPrimaryDomain(a.workspaceId);
    expect(fallback?.id).toBe(a.domainId);

    const matched = await getPrimaryDomain(a.workspaceId, a.domainId);
    expect(matched?.id).toBe(a.domainId);

    // A foreign (or deleted) domain id never resolves — falls back to own first.
    const foreign = await getPrimaryDomain(a.workspaceId, b.domainId);
    expect(foreign?.id).toBe(a.domainId);

    expect(await getPrimaryDomain("no-such-workspace")).toBeNull();
  });

  it("scopes scans and prompt counts to the workspace", async () => {
    const a = await seed();
    const b = await seed();
    const { scanId } = await seedScan({ ...a });

    const latest = await getLatestScan(a.workspaceId, a.domainId);
    expect(latest?.id).toBe(scanId);
    expect(await getLatestScan(b.workspaceId, a.domainId)).toBeNull();

    expect(await getPromptCount(a.workspaceId, a.domainId)).toBe(1);
    expect(await getPromptCount(b.workspaceId, a.domainId)).toBe(0);
  });

  it("returns honest AI observations (failed runs carry no mention data)", async () => {
    const a = await seed();
    const completed = await seedScan({ ...a, brandMentioned: true, mentionCount: 2 });
    // A failed observation in the SAME scan: excluded from scoring, never
    // treated as "not mentioned".
    await getDb()
      .insert(visibilityRuns)
      .values({
        domainId: a.domainId,
        promptId: a.promptId,
        scanId: completed.scanId,
        engine: "llama",
        status: "failed",
        error: "provider timeout",
        mocked: true,
      });

    const rows = await getAiObservations(completed.scanId);
    expect(rows).toHaveLength(2);

    const ok = rows.find((row) => row.engineKey === "gemini");
    expect(ok?.brandMentioned).toBe(true);
    expect(ok?.mentionCount).toBe(2);
    expect(ok?.engineName).toBe("Gemini"); // mapped from the seeded registry

    const bad = rows.find((row) => row.status === "failed");
    expect(bad?.brandMentioned).toBeNull(); // failure ≠ "not mentioned"
    expect(bad?.answerText).toBeNull();
  });

  it("keeps share metrics null until genuine evidence exists", async () => {
    const a = await seed();
    const { scanId, resultId } = await seedScan({ ...a, brandMentioned: true, mentionCount: 2 });

    // No competitor mentions, no provider citations → SoV from brand only,
    // citation share stays NULL (extracted URLs never count).
    const db = getDb();
    await db.insert(citations).values({
      visibilityResultId: resultId!,
      url: "https://industry-week.example/reviews",
      domain: "industry-week.example",
      kind: "extracted",
    });

    const empty = await getShareMetrics(a.workspaceId, a.domainId, "missing-scan");
    expect(empty).toBeNull();

    const share = await getShareMetrics(a.workspaceId, a.domainId, scanId);
    expect(share?.shareOfVoice.brandMentionCount).toBe(2);
    expect(share?.shareOfVoice.share).toBe(1); // brand only — competitor-free
    expect(share?.citationShare.providerCitationCount).toBe(0);
    expect(share?.citationShare.share).toBeNull(); // extracted excluded by design

    // Add a tracked competitor mention + one provider citation → shares update.
    const [competitor] = await db
      .insert(competitors)
      .values({
        domainId: a.domainId,
        name: "Rival",
        domain: "rival.example",
        normalizedDomain: "rival.example",
      })
      .returning();
    await db.insert(competitorMentions).values({
      resultId: resultId!,
      competitorId: competitor!.id,
      mentioned: true,
    });
    await db.insert(citations).values({
      visibilityResultId: resultId!,
      url: "https://acme.example/best",
      domain: "acme.example",
      kind: "provider",
      isOwnedDomain: true,
    });

    const updated = await getShareMetrics(a.workspaceId, a.domainId, scanId);
    expect(updated?.shareOfVoice.share).toBeCloseTo(2 / 3, 3);
    expect(updated?.citationShare.providerCitationCount).toBe(1);
    expect(updated?.citationShare.ownedCitationCount).toBe(1);
    expect(updated?.citationShare.share).toBe(1);

    // Foreign workspace sees nothing.
    expect(await getShareMetrics("foreign-ws", a.domainId, scanId)).toBeNull();
  });

  it("serves citations with provenance and blocks cross-workspace access", async () => {
    const a = await seed();
    const { scanId, resultId } = await seedScan({ ...a });
    const db = getDb();
    await db.insert(citations).values([
      { visibilityResultId: resultId!, url: "https://a.example/x", domain: "a.example", kind: "provider" },
      { visibilityResultId: resultId!, url: "https://b.example/y", domain: "b.example", kind: "extracted" },
    ]);

    const rows = await getCitationsForScan(a.workspaceId, a.domainId, scanId);
    expect(rows).toHaveLength(2);
    expect(rows?.some((row) => row.kind === "provider")).toBe(true);
    expect(rows?.some((row) => row.kind === "extracted")).toBe(true);
    expect(rows?.[0]?.promptText).toBe("best analytics tools");

    expect(await getCitationsForScan("foreign-ws", a.domainId, scanId)).toBeNull();
    expect(await getCitationsForScan(a.workspaceId, a.domainId, "missing")).toBeNull();
  });

  it("splits recommendations open/resolved with workspace scoping", async () => {
    const a = await seed();
    const b = await seed();
    const db = getDb();
    const base = {
      domainId: a.domainId,
      category: "ai_visibility",
      priority: "high" as const,
      title: "Test",
      dedupKey: "brand_absent:p1",
    };
    await db.insert(recommendations).values([
      { ...base, status: "open" },
      { ...base, dedupKey: "brand_absent:p2", status: "dismissed" },
    ]);
    await db
      .insert(recommendations)
      .values({
        domainId: b.domainId,
        category: "ai_visibility",
        priority: "low" as const,
        title: "Other workspace",
        dedupKey: "brand_absent:p1",
        status: "open",
      });

    const scoped = await getRecommendationsForWorkspace(a.workspaceId, a.domainId);
    expect(scoped.open).toHaveLength(1);
    expect(scoped.resolved).toHaveLength(1);
    expect(scoped.open[0]?.title).toBe("Test");

    const whole = await getRecommendationsForWorkspace(a.workspaceId);
    expect(whole.open).toHaveLength(1); // b's rec never leaks in
    expect(whole.open[0]?.domainId).toBe(a.domainId);

    const foreign = await getRecommendationsForWorkspace("foreign-ws");
    expect(foreign.open).toHaveLength(0);
  });
});

import { and, eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  aiEngines,
  businessProfiles,
  competitors,
  competitorMentions,
  domains,
  intelligenceScans,
  prompts,
  recommendations,
  serpResults,
  serpSnapshots,
  visibilityResults,
  visibilityRuns,
  type IntelligenceScan,
  type RecommendationPriority,
} from "@/lib/db/schema";
import { domainToDisplayName } from "@/lib/utils";
import { logger } from "@/lib/logging/logger";

/**
 * Deterministic Action Center.
 *
 * Every recommendation is derived by RULE from evidence persisted by a scan
 * (mention flags, SERP ranks) — no LLM is ever involved, so the same
 * evidence always produces the same recommendations.
 *
 * De-duplication: each rule has a deterministic `dedupKey`
 * (e.g. `brand_absent:{promptId}`). Re-running scans REFRESHES the existing
 * row (evidence, priority, source scan) instead of stacking duplicates —
 * enforced by the partial unique index on (domain_id, dedup_key).
 *
 * Staleness: when this scan has genuine evidence that a previously open
 * condition no longer holds, the open recommendation is auto-closed
 * (`open` → `done`). Dismissed/in-progress items are NEVER touched.
 */

const AI_RECAP_PREFIXES = ["brand_absent:", "competitor_ahead:"];
const SERP_RECAP_PREFIXES = ["serp_absent:", "serp_low_rank:"];

function snippet(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------- competitor discovery --------------------------- */

/**
 * Discover suggested competitors from a scan's organic SERP results:
 * a domain qualifies when it appears for ≥2 distinct tracked keywords and is
 * neither the tracked domain nor already tracked. Confidence = appearances ÷
 * keywords scanned (an ESTIMATE — labeled as suggestion in the UI).
 * Bounded to 5 new discoveries per scan.
 */
export async function discoverCompetitorsFromSerp(scanId: string): Promise<number> {
  const db = getDb();
  const [scan] = await db
    .select()
    .from(intelligenceScans)
    .where(eq(intelligenceScans.id, scanId))
    .limit(1);
  if (!scan) return 0;
  const [domainRow] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, scan.domainId))
    .limit(1);
  const trackedDomain = domainRow?.normalizedDomain ?? "";

  const rows = await db
    .select({ domain: serpResults.domain, keyword: serpSnapshots.keyword })
    .from(serpResults)
    .innerJoin(serpSnapshots, eq(serpSnapshots.id, serpResults.snapshotId))
    .where(
      and(
        eq(serpSnapshots.scanId, scanId),
        eq(serpResults.resultType, "organic"),
        eq(serpResults.isTrackedDomain, false)
      )
    );
  if (rows.length === 0) return 0;

  const keywordsPerDomain = new Map<string, Set<string>>();
  const totalKeywords = new Set<string>();
  for (const row of rows) {
    totalKeywords.add(row.keyword);
    const set = keywordsPerDomain.get(row.domain) ?? new Set<string>();
    set.add(row.keyword);
    keywordsPerDomain.set(row.domain, set);
  }
  const keywordCount = Math.max(1, totalKeywords.size);

  const existing = await db
    .select({ normalizedDomain: competitors.normalizedDomain })
    .from(competitors)
    .where(eq(competitors.domainId, scan.domainId));
  const known = new Set(existing.map((row) => row.normalizedDomain));
  known.add(trackedDomain);

  const candidates = [...keywordsPerDomain.entries()]
    .filter(([domain, seen]) => !known.has(domain) && seen.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, 5);
  if (candidates.length === 0) return 0;

  let inserted = 0;
  for (const [domain, seen] of candidates) {
    const rows = await db
      .insert(competitors)
      .values({
        domainId: scan.domainId,
        name: domainToDisplayName(domain),
        domain,
        normalizedDomain: domain,
        discoveredAutomatically: true,
        confidence: round2(Math.min(1, seen.size / keywordCount)),
      })
      .onConflictDoNothing({
        target: [competitors.domainId, competitors.normalizedDomain],
      })
      .returning({ id: competitors.id });
    inserted += rows.length;
  }
  if (inserted > 0) {
    logger.info("Competitors auto-discovered from SERP evidence", {
      scanId,
      inserted,
    });
  }
  return inserted;
}

/* ---------------------------- recommendation ------------------------------ */

interface RecommendationInput {
  domainId: string;
  promptId?: string | null;
  competitorId?: string | null;
  sourceScanId: string;
  category: string;
  priority: RecommendationPriority;
  impact: number;
  effort: "small" | "medium" | "large";
  title: string;
  explanation: string;
  action: string;
  evidence: Record<string, unknown>;
  dedupKey: string;
}

/** Insert-or-refresh by (domain_id, dedup_key). User dismissals are kept. */
async function upsertRecommendation(input: RecommendationInput): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: recommendations.id, status: recommendations.status })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.domainId, input.domainId),
        eq(recommendations.dedupKey, input.dedupKey)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(recommendations)
      .set({
        category: input.category,
        priority: input.priority,
        impact: input.impact,
        effort: input.effort,
        title: input.title,
        explanation: input.explanation,
        action: input.action,
        evidence: input.evidence,
        sourceScanId: input.sourceScanId,
        promptId: input.promptId ?? null,
        competitorId: input.competitorId ?? null,
        // Re-open only items we auto-closed; manual states are respected.
        status: existing.status === "done" ? "open" : existing.status,
      })
      .where(eq(recommendations.id, existing.id));
  } else {
    await db.insert(recommendations).values({
      domainId: input.domainId,
      promptId: input.promptId ?? null,
      competitorId: input.competitorId ?? null,
      sourceScanId: input.sourceScanId,
      category: input.category,
      priority: input.priority,
      impact: input.impact,
      effort: input.effort,
      title: input.title,
      explanation: input.explanation,
      action: input.action,
      evidence: input.evidence,
      dedupKey: input.dedupKey,
      status: "open",
    });
  }
}

interface AiPromptEvidence {
  promptId: string;
  promptText: string;
  importance: number | null;
  observations: Array<{ engine: string; mentioned: boolean }>;
  competitorMentions: Array<{ competitorId: string; name: string; engines: string[] }>;
}

interface SerpEvidence {
  promptId: string | null;
  keyword: string;
  rank: number | null;
  importance: number | null;
}

/**
 * Derive this scan's recommendations from persisted evidence, refresh their
 * dedup rows, and auto-close open conditions the evidence no longer supports.
 * Returns the number of recommendations written.
 */
export async function generateRecommendations(scan: IntelligenceScan): Promise<number> {
  const db = getDb();
  const domainId = scan.domainId;

  const [domainRow] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  const trackedDomain = domainRow?.normalizedDomain ?? "";
  // Same brand identity the executor used for mention detection (profile
  // name first), so recommendation language matches the evidence.
  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, scan.workspaceId))
    .limit(1);
  const brandLabel =
    profile?.name?.trim() ||
    (domainRow ? domainToDisplayName(domainRow.normalizedDomain) : "Your brand");

  const promptRows = await db.select().from(prompts).where(eq(prompts.domainId, domainId));
  const promptById = new Map(promptRows.map((row) => [row.id, row]));
  const engineRows = await db.select().from(aiEngines);
  const engineName = new Map(engineRows.map((row) => [row.key, row.name]));

  /* ---- AI evidence, grouped per prompt ---- */
  const aiRows = await db
    .select({
      promptId: visibilityRuns.promptId,
      engine: visibilityRuns.engine,
      mentioned: visibilityResults.brandMentioned,
      resultId: visibilityResults.id,
    })
    .from(visibilityRuns)
    .innerJoin(visibilityResults, eq(visibilityResults.runId, visibilityRuns.id))
    .where(
      and(eq(visibilityRuns.scanId, scan.id), eq(visibilityRuns.status, "completed"))
    );

  const compRows =
    aiRows.length > 0
      ? await db
          .select({
            resultId: visibilityResults.id,
            competitorId: competitorMentions.competitorId,
            mentioned: competitorMentions.mentioned,
            name: competitors.name,
            engine: visibilityRuns.engine,
          })
          .from(competitorMentions)
          .innerJoin(
            visibilityResults,
            eq(visibilityResults.id, competitorMentions.resultId)
          )
          .innerJoin(visibilityRuns, eq(visibilityRuns.id, visibilityResults.runId))
          .innerJoin(competitors, eq(competitors.id, competitorMentions.competitorId))
          .where(and(eq(visibilityRuns.scanId, scan.id), inArray(
            visibilityResults.id,
            aiRows.map((row) => row.resultId)
          )))
      : [];

  const perPrompt = new Map<string, AiPromptEvidence>();
  for (const row of aiRows) {
    if (!row.promptId) continue;
    const prompt = promptById.get(row.promptId);
    const entry = perPrompt.get(row.promptId) ?? {
      promptId: row.promptId,
      promptText: prompt?.text ?? "",
      importance: prompt?.importance ?? null,
      observations: [],
      competitorMentions: [],
    };
    entry.observations.push({ engine: row.engine, mentioned: row.mentioned });
    perPrompt.set(row.promptId, entry);
  }
  const resultToPrompt = new Map(aiRows.map((row) => [row.resultId, row.promptId]));
  for (const row of compRows) {
    const promptId = row.resultId ? resultToPrompt.get(row.resultId) : null;
    if (!promptId || !row.mentioned) continue;
    const entry = perPrompt.get(promptId);
    if (!entry) continue;
    const existing = entry.competitorMentions.find(
      (item) => item.competitorId === row.competitorId
    );
    if (existing) existing.engines.push(row.engine);
    else
      entry.competitorMentions.push({
        competitorId: row.competitorId,
        name: row.name,
        engines: [row.engine],
      });
  }

  /* ---- SERP evidence ---- */
  const snapshotRows = await db
    .select()
    .from(serpSnapshots)
    .where(eq(serpSnapshots.scanId, scan.id));
  const serpEvidence: SerpEvidence[] = snapshotRows.map((row) => ({
    promptId: row.promptId,
    keyword: row.keyword,
    rank: row.trackedDomainRank,
    importance: row.promptId ? promptById.get(row.promptId)?.importance ?? null : null,
  }));

  const currentKeys = new Set<string>();
  let written = 0;

  /* ---- Rule 1: brand absent from ALL AI answers for a prompt ---- */
  for (const entry of perPrompt.values()) {
    if (entry.observations.length === 0) continue;
    const enginesChecked = entry.observations.map((obs) =>
      engineName.get(obs.engine) ?? obs.engine
    );
    const anyMention = entry.observations.some((obs) => obs.mentioned);
    if (anyMention) continue;

    const importance = entry.importance;
    const dedupKey = `brand_absent:${entry.promptId}`;
    currentKeys.add(dedupKey);
    await upsertRecommendation({
      domainId,
      promptId: entry.promptId,
      sourceScanId: scan.id,
      category: "ai_visibility",
      priority: importance != null && importance >= 4 ? "high" : "medium",
      impact: round2(Math.min(1, (importance ?? 2) / 5)),
      effort: "medium",
      title: `${brandLabel} is absent from AI answers for “${snippet(entry.promptText, 56)}”`,
      explanation:
        `No AI engine checked this scan mentioned ${brandLabel} when answering this query ` +
        `(${enginesChecked.join(", ")}). The brand was not among the options surfaced to users.`,
      action:
        "Publish or strengthen a page that answers this question directly: state the entity/brand name " +
        "in the opening, answer the query in a concise paragraph, and structure the rest with clear sections.",
      evidence: {
        scanId: scan.id,
        promptText: entry.promptText,
        enginesChecked: entry.observations.map((obs) => obs.engine),
        enginesMentioningBrand: 0,
        competitorsMentioned: entry.competitorMentions.map((item) => item.name),
        totalObservations: entry.observations.length,
      },
      dedupKey,
    });
    written++;

    /* ---- Rule 2: competitor mentioned where the brand is not ---- */
    for (const competitor of entry.competitorMentions) {
      const key = `competitor_ahead:${entry.promptId}:${competitor.competitorId}`;
      currentKeys.add(key);
      await upsertRecommendation({
        domainId,
        promptId: entry.promptId,
        competitorId: competitor.competitorId,
        sourceScanId: scan.id,
        category: "ai_visibility",
        priority: "medium",
        impact: round2(Math.min(1, (importance ?? 2) / 5) * 0.7),
        effort: "medium",
        title: `${competitor.name} is mentioned where ${brandLabel} is not — “${snippet(entry.promptText, 44)}”`,
        explanation:
          `${competitor.name} appeared in ${competitor.engines.length} AI response(s) for this query ` +
          `while ${brandLabel} was absent (engines: ${competitor.engines
            .map((engine) => engineName.get(engine) ?? engine)
            .join(", ")}).`,
        action:
          `Close the gap with comparison/alternative content aimed at this query, and make the ` +
          `entity relationship explicit so engines can associate ${brandLabel} with this category.`,
        evidence: {
          scanId: scan.id,
          promptText: entry.promptText,
          competitorEngines: competitor.engines,
          brandMentioned: false,
        },
        dedupKey: key,
      });
      written++;
    }
  }

  /* ---- Rules 3 & 4: SERP presence ---- */
  for (const evidence of serpEvidence) {
    const importance = evidence.importance;
    if (evidence.rank == null) {
      const dedupKey = `serp_absent:${evidence.keyword}`;
      currentKeys.add(dedupKey);
      await upsertRecommendation({
        domainId,
        promptId: evidence.promptId,
        sourceScanId: scan.id,
        category: "search_presence",
        priority: importance != null && importance >= 4 ? "high" : "medium",
        impact: round2(Math.min(1, (importance ?? 2) / 5)),
        effort: "medium",
        title: `${trackedDomain} is absent from Google’s first-page results for “${snippet(evidence.keyword, 56)}”`,
        explanation:
          "This scan checked the live Google SERP for this query and the tracked domain did not appear " +
          "in the results. Absence here is confirmed measurement, not an estimate.",
        action:
          "Create or improve a page targeting this exact query — match the searcher’s intent in the title, " +
          "answer it in the first paragraph, and add structured sections engines can extract.",
        evidence: {
          scanId: scan.id,
          keyword: evidence.keyword,
          trackedDomainRank: null,
          locationCode: scan.locationCode,
          languageCode: scan.languageCode,
        },
        dedupKey,
      });
      written++;
    } else if (evidence.rank >= 6) {
      const dedupKey = `serp_low_rank:${evidence.keyword}`;
      currentKeys.add(dedupKey);
      await upsertRecommendation({
        domainId,
        promptId: evidence.promptId,
        sourceScanId: scan.id,
        category: "search_presence",
        priority: "low",
        impact: round2(Math.max(0.1, (11 - evidence.rank) / 20)),
        effort: "small",
        title: `Position ${evidence.rank} on page one for “${snippet(evidence.keyword, 56)}” — worth strengthening`,
        explanation:
          `The tracked domain ranked at position ${evidence.rank} for this query in the live SERP ` +
          "checked this scan. Lower page-one positions capture substantially less attention.",
        action:
          "Tighten the matching page’s title/H1 toward the query, add a direct answer block near the top, " +
          "and earn a few relevant internal links to that page.",
        evidence: {
          scanId: scan.id,
          keyword: evidence.keyword,
          trackedDomainRank: evidence.rank,
        },
        dedupKey,
      });
      written++;
    }
  }

  /* ---- auto-close open conditions this scan no longer supports ---- */
  await closeStaleRecommendations(scan, currentKeys, {
    evaluatedPromptIds: new Set(perPrompt.keys()),
    promptExists: promptById,
    evaluatedKeywords: new Set(serpEvidence.map((item) => item.keyword)),
  });

  return written;
}

async function closeStaleRecommendations(
  scan: IntelligenceScan,
  currentKeys: Set<string>,
  scope: {
    evaluatedPromptIds: Set<string>;
    promptExists: Map<string, { id: string }>;
    evaluatedKeywords: Set<string>;
  }
): Promise<void> {
  const db = getDb();
  const openRows = await db
    .select({
      id: recommendations.id,
      dedupKey: recommendations.dedupKey,
      explanation: recommendations.explanation,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.domainId, scan.domainId),
        eq(recommendations.status, "open"),
        or(
          like(recommendations.dedupKey, `${AI_RECAP_PREFIXES[0]}%`),
          like(recommendations.dedupKey, `${AI_RECAP_PREFIXES[1]}%`),
          like(recommendations.dedupKey, `${SERP_RECAP_PREFIXES[0]}%`),
          like(recommendations.dedupKey, `${SERP_RECAP_PREFIXES[1]}%`)
        )
      )
    );

  for (const row of openRows) {
    const key = row.dedupKey;
    if (!key || currentKeys.has(key)) continue;

    let evaluated = false;
    if (AI_RECAP_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      const promptId = key.split(":")[1] ?? "";
      // Prompt deleted → condition untrackable → close as no longer relevant.
      evaluated = !scope.promptExists.has(promptId) || scope.evaluatedPromptIds.has(promptId);
    } else {
      const keyword = key.slice(key.indexOf(":") + 1);
      evaluated = scope.evaluatedKeywords.has(keyword);
    }
    if (!evaluated) continue; // no fresh evidence either way → leave open

    await db
      .update(recommendations)
      .set({
        status: "done",
        explanation:
          `${row.explanation ?? ""}\n\nAuto-closed: scan ${scan.id} found this condition no longer holds.`.trim(),
        sourceScanId: scan.id,
      })
      .where(eq(recommendations.id, row.id));
  }
}

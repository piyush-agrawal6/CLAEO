import { env } from "@/lib/env";
import type { AiEngineKey } from "@/lib/providers/ai/types";

/**
 * Scan planning: turns workspace state (tracked prompts, scannable engines)
 * into a deterministic, budget-capped operation list.
 *
 * Every cap is enforced HERE, at plan time, so a scan can never exceed:
 * - MAX_KEYWORDS_PER_SEARCH_SCAN keywords for search-volume metrics
 *   (ONE keyword-overview batch request — ≤700 keywords per provider call);
 * - MAX_SERP_KEYWORDS_PER_SCAN live SERPs (each = one billed SERP), also
 *   bounded by MAX_DATAFORSEO_REQUESTS_PER_SCAN in total;
 * - MAX_AI_PROMPTS_PER_SCAN × MAX_AI_ENGINES_PER_SCAN AI observations,
 *   bounded by MAX_AI_REQUESTS_PER_SCAN.
 *
 * Operation keys are deterministic (`serp:{keyword}`, `ai:{promptId}:{engine}`)
 * — the idempotency backbone: a retried scan can never duplicate work.
 */

/** DataForSEO hard limit: 80 characters per keyword. */
export const KEYWORD_MAX_CHARS = 80;

export interface ScanPromptInput {
  id: string;
  text: string;
  importance: number | null;
}

export interface KeywordMetricsPayload {
  keywords: Array<{ keyword: string; promptId: string }>;
}
export interface SerpPayload {
  keyword: string;
  promptId: string;
}
export interface AiPromptPayload {
  promptId: string;
  engine: AiEngineKey;
  promptText: string;
}

export type ScanOperationPlan =
  | { kind: "keyword_metrics"; operationKey: string; payload: KeywordMetricsPayload }
  | { kind: "serp"; operationKey: string; payload: SerpPayload }
  | { kind: "ai_prompt"; operationKey: string; payload: AiPromptPayload };

export interface ScanPlan {
  operations: ScanOperationPlan[];
  /** Distinct keywords sent for search-volume metrics. */
  keywordCount: number;
  /** Keywords checked in live SERPs (= billed DataForSEO SERP requests). */
  serpKeywordCount: number;
  /** AI observations planned (= prompts × engines). */
  aiObservationCount: number;
  aiPromptCount: number;
  aiEngineCount: number;
}

export function normalizeKeyword(text: string): string {
  return text.trim().toLowerCase().slice(0, KEYWORD_MAX_CHARS);
}

export function buildScanPlan(input: {
  /** Enabled prompts, pre-sorted by importance (desc), stable otherwise. */
  prompts: ScanPromptInput[];
  /** Scannable engines (real or mock adapters), already capped+ordered. */
  engines: Array<{ key: AiEngineKey }>;
}): ScanPlan {
  const operations: ScanOperationPlan[] = [];

  const keywordPrompts = input.prompts.slice(0, env.MAX_KEYWORDS_PER_SEARCH_SCAN);
  const engines = input.engines.slice(0, env.MAX_AI_ENGINES_PER_SCAN);
  const aiPrompts = input.prompts.slice(0, env.MAX_AI_PROMPTS_PER_SCAN);

  // ONE keyword-overview batch (the provider accepts up to 700 keywords
  // per call) — consumes one DataForSEO request from the scan budget.
  if (keywordPrompts.length > 0 && env.MAX_DATAFORSEO_REQUESTS_PER_SCAN >= 1) {
    operations.push({
      kind: "keyword_metrics",
      operationKey: "keyword_metrics:overview",
      payload: {
        keywords: keywordPrompts.map((prompt) => ({
          keyword: normalizeKeyword(prompt.text),
          promptId: prompt.id,
        })),
      },
    });
  }

  // One billed SERP per keyword; bounded by both the SERP cap and whatever
  // remains of the DataForSEO request budget after the batch above.
  const serpBudget = Math.max(0, env.MAX_DATAFORSEO_REQUESTS_PER_SCAN - 1);
  const serpCap = Math.min(env.MAX_SERP_KEYWORDS_PER_SCAN, serpBudget);
  for (const prompt of input.prompts.slice(0, serpCap)) {
    const keyword = normalizeKeyword(prompt.text);
    operations.push({
      kind: "serp",
      operationKey: `serp:${keyword}`,
      payload: { keyword, promptId: prompt.id },
    });
  }

  // One AI observation per (prompt × engine), bounded by both caps.
  const aiOpsCap = Math.min(
    env.MAX_AI_PROMPTS_PER_SCAN * env.MAX_AI_ENGINES_PER_SCAN,
    env.MAX_AI_REQUESTS_PER_SCAN
  );
  let aiOps = 0;
  outer: for (const prompt of aiPrompts) {
    for (const engine of engines) {
      if (aiOps >= aiOpsCap) break outer;
      operations.push({
        kind: "ai_prompt",
        operationKey: `ai:${prompt.id}:${engine.key}`,
        payload: { promptId: prompt.id, engine: engine.key, promptText: prompt.text },
      });
      aiOps++;
    }
  }

  return {
    operations,
    keywordCount: keywordPrompts.length,
    serpKeywordCount: Math.min(input.prompts.length, serpCap),
    aiObservationCount: aiOps,
    aiPromptCount: aiPrompts.length,
    aiEngineCount: engines.length,
  };
}

/**
 * AI Visibility Score — formula `ai_visibility_v1`, plus share metrics.
 *
 * Per valid observation (one prompt × one engine, completed successfully):
 *   brand mentioned → 100 points, not mentioned → 0 points.
 * Score = mean over valid observations. FAILED observations never enter the
 * denominator — the caller only passes outcomes that actually exist.
 * Zero valid observations → score null ("not enough data").
 *
 * Share of Voice: brand mentions ÷ (brand + tracked-competitor mentions)
 * across all answers. No mentions anywhere → null ("not enough data"),
 * never 0.
 *
 * Citation share counts ONLY genuine provider citations
 * (kind = "provider"). Plain URLs inside answer text are "extracted" and are
 * excluded by construction here. Zero provider citations → null
 * ("no provider citations"), never 0.
 */

export const AI_VISIBILITY_FORMULA_VERSION = "ai_visibility_v1";

export interface AiVisibilityScore {
  /** 0-100, null when no valid observation exists. */
  score: number | null;
  formulaVersion: string;
  /** Prompt × engine observations the scan planned to make. */
  coverageExpected: number;
  /** Valid completed observations that count toward the score. */
  coverageCompleted: number;
}

export function computeAiVisibilityScore(input: {
  /** Only VALID completed observations (failures are excluded by the caller). */
  observations: Array<{ mentioned: boolean }>;
  coverageExpected: number;
}): AiVisibilityScore {
  const completed = input.observations.length;
  const expected = Math.max(input.coverageExpected, completed);
  const score =
    completed === 0
      ? null
      : Math.round(
          (input.observations.reduce((sum, obs) => sum + (obs.mentioned ? 100 : 0), 0) /
            completed) *
            10
        ) / 10;
  return {
    score,
    formulaVersion: AI_VISIBILITY_FORMULA_VERSION,
    coverageExpected: expected,
    coverageCompleted: completed,
  };
}

export interface ShareOfVoice {
  brandMentionCount: number;
  competitorMentionCount: number;
  /** 0-1; null = not enough data (no brand/competitor mentions anywhere). */
  share: number | null;
}

export function computeShareOfVoice(
  brandMentionCount: number,
  competitorMentionCount: number
): ShareOfVoice {
  const total = brandMentionCount + competitorMentionCount;
  return {
    brandMentionCount,
    competitorMentionCount,
    share: total > 0 ? Math.round((brandMentionCount / total) * 1000) / 1000 : null,
  };
}

export interface CitationShare {
  /** ALL genuine provider citations observed (kind = "provider"). */
  providerCitationCount: number;
  ownedCitationCount: number;
  competitorCitationCount: number;
  /** 0-1 owned share; null = no provider citations were returned at all. */
  share: number | null;
}

export function computeCitationShare(input: {
  providerCitations: Array<{ isOwnedDomain: boolean; isCompetitorDomain: boolean }>;
}): CitationShare {
  const providerCitationCount = input.providerCitations.length;
  const ownedCitationCount = input.providerCitations.filter((c) => c.isOwnedDomain).length;
  const competitorCitationCount = input.providerCitations.filter((c) => c.isCompetitorDomain).length;
  return {
    providerCitationCount,
    ownedCitationCount,
    competitorCitationCount,
    share: providerCitationCount > 0 ? Math.round((ownedCitationCount / providerCitationCount) * 1000) / 1000 : null,
  };
}

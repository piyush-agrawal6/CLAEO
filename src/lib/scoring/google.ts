/**
 * Google Visibility Score — formula `google_visibility_v1`.
 *
 * Tiered rank points per tracked keyword (documented in docs/SCORING.md):
 *   1→100, 2→85, 3→70, 4→55, 5→45, 6→35, 7→27, 8→20, 9→14, 10→10,
 *   beyond page one (>10)→5, absent from the SERP→0.
 *
 * Score = mean of per-keyword points over keywords that have ACTUAL SERP
 * data. "Absent from the SERP" is data (0 points); a keyword whose SERP
 * request FAILED is not data and is excluded from the denominator entirely
 * (it simply is not passed in). Zero data → score null ("not enough data").
 *
 * The formula version is persisted with every computed score so historical
 * scans keep the score calculated with the formula active at that time.
 */

export const GOOGLE_VISIBILITY_FORMULA_VERSION = "google_visibility_v1";

const RANK_POINTS: Record<number, number> = {
  1: 100,
  2: 85,
  3: 70,
  4: 55,
  5: 45,
  6: 35,
  7: 27,
  8: 20,
  9: 14,
  10: 10,
};

/** Points for one keyword. `null` = absent from the SERP = 0 points. */
export function keywordPoints(rank: number | null | undefined): number {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return 0;
  const floored = Math.floor(rank);
  return RANK_POINTS[floored] ?? (floored > 10 ? 5 : 0);
}

export interface GoogleVisibilityScore {
  /** 0-100, null when no keyword had SERP data. */
  score: number | null;
  formulaVersion: string;
  /** Tracked keywords the scan planned to check in the SERP. */
  coverageExpected: number;
  /** Keywords with actual SERP data that were scored (numberOfQueries). */
  coverageCompleted: number;
}

export function computeGoogleVisibilityScore(input: {
  /** One entry per keyword WITH SERP data; null = absent from the SERP. */
  ranks: Array<number | null>;
  coverageExpected: number;
}): GoogleVisibilityScore {
  const completed = input.ranks.length;
  const expected = Math.max(input.coverageExpected, completed);
  const score =
    completed === 0
      ? null
      : Math.round(
          (input.ranks.reduce<number>((sum, rank) => sum + keywordPoints(rank), 0) /
            completed) *
            10
        ) / 10;
  return {
    score,
    formulaVersion: GOOGLE_VISIBILITY_FORMULA_VERSION,
    coverageExpected: expected,
    coverageCompleted: completed,
  };
}

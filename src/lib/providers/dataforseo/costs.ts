/**
 * DataForSEO cost ESTIMATES, derived from the official pricing pages
 * (dataforseo.com/pricing, verified October 2026):
 *
 * - DataForSEO Labs Google (Live endpoints under "dataforseo_labs/google",
 *   e.g. keyword_overview/live): $0.012 per task + $0.00012 per returned item.
 *   `include_clickstream_data=true` would double the price — we never send it.
 * - Google Organic SERP (serp/google/organic/live/regular, Live mode):
 *   $0.002 per SERP of up to 10 results (depth rounded up to the next 10;
 *   search operators multiply the price ×5 — we never send operators).
 *
 * These numbers are used ONLY for pre-run estimates and the spend guard.
 * The provider-reported `cost` in each response is the actual value and
 * always takes precedence in the usage ledger.
 */

export const KEYWORD_OVERVIEW_TASK_USD = 0.012;
export const KEYWORD_OVERVIEW_PER_KEYWORD_USD = 0.00012;
export const SERP_LIVE_REGULAR_PER_SERP_USD = 0.002;

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Estimated USD for one keyword_overview/live call with N keywords. */
export function estimateKeywordOverviewUsd(keywordCount: number): number {
  const count = Math.max(0, Math.floor(keywordCount));
  return round6(KEYWORD_OVERVIEW_TASK_USD + count * KEYWORD_OVERVIEW_PER_KEYWORD_USD);
}

/** Estimated USD for one serp/google/organic/live/regular call (depth in results). */
export function estimateSerpLiveRegularUsd(depth = 10): number {
  const pages = Math.max(1, Math.ceil(Math.max(1, Math.floor(depth)) / 10));
  return round6(pages * SERP_LIVE_REGULAR_PER_SERP_USD);
}

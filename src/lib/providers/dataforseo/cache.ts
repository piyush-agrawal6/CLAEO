/**
 * Cache keys for DataForSEO responses.
 *
 * A key MUST bind every billed parameter (provider, endpoint, location,
 * language, and the normalized request payload) so a cached value can never
 * be served for a different request. Keys are versioned (`dfs:v1:`) so a
 * normalization change invalidates everything safely.
 */
export function keywordOverviewCacheKey(params: {
  locationCode: number;
  languageCode: string;
  keywords: string[];
}): string {
  const keywords = [...new Set(params.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("|");
  return `dfs:v1:kw:${params.locationCode}:${params.languageCode}:${keywords}`;
}

export function serpLiveCacheKey(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth: number;
}): string {
  const keyword = params.keyword.trim().toLowerCase();
  return `dfs:v1:serp:${params.locationCode}:${params.languageCode}:${params.depth}:${keyword}`;
}

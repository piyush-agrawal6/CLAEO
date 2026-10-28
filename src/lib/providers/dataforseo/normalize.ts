import type { KeywordOverviewResponse, SerpLiveRegularResponse } from "@/lib/providers/dataforseo/schemas";
import {
  DataForSeoError,
  type KeywordMetricData,
  type KeywordOverviewResult,
  type SerpLiveResult,
  type SerpResultItem,
} from "@/lib/providers/dataforseo/types";
import type { ProviderErrorClass } from "@/lib/db/schema/types";

/**
 * Pure normalization + error classification for DataForSEO responses.
 *
 * These functions never fetch, never log, never touch the database: given a
 * Zod-validated provider payload they produce the app's normalized types or
 * a classified error. The mock client produces provider-shaped payloads that
 * flow through these exact functions, so mock and real paths share one
 * normalization implementation.
 */

/** Successful DataForSEO status codes (20000 = Ok, 20001 = Partial content). */
const OK_STATUS_CODES = new Set([20000, 20001]);

/* --------------------------- error classification -------------------------- */

function sanitized(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim().slice(0, 300);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map a DataForSEO envelope/task `status_code` to a classified error.
 * Returns null for success codes (and for a missing code — shape problems
 * are surfaced later by Zod validation as BAD_RESPONSE).
 */
export function classifyProviderStatus(
  operation: string,
  statusCode: number | null | undefined,
  statusMessage?: string | null
): DataForSeoError | null {
  if (statusCode == null || OK_STATUS_CODES.has(statusCode)) return null;
  const message = sanitized(statusMessage) ?? `Provider returned status ${statusCode}.`;
  const options = { providerStatus: statusCode } satisfies {
    providerStatus: number;
  };

  if ([40100, 40101, 40102, 40300, 40301, 40302].includes(statusCode)) {
    return new DataForSeoError(operation, "AUTHENTICATION", message, options);
  }
  if (statusCode === 40200) {
    // Insufficient credits in the DataForSEO account.
    return new DataForSeoError(operation, "PROVIDER_QUOTA", message, {
      ...options,
      retryable: false,
    });
  }
  if ([42900, 42901, 42902].includes(statusCode)) {
    return new DataForSeoError(operation, "RATE_LIMIT", message, {
      ...options,
      retryable: true,
    });
  }
  if (statusCode >= 50000 && statusCode < 60000) {
    // Provider-side internal errors are transient by convention.
    return new DataForSeoError(operation, "PROVIDER_ERROR", message, {
      ...options,
      retryable: true,
    });
  }
  // Remaining 4xxxx codes: invalid request, unsupported location, etc.
  return new DataForSeoError(operation, "PROVIDER_ERROR", message, {
    ...options,
    retryable: false,
  });
}

/** Map an HTTP status (no parsed body) to a classified error; null when 2xx. */
export function classifyHttpStatus(
  operation: string,
  httpStatus: number,
  statusMessage?: string | null
): DataForSeoError | null {
  if (httpStatus >= 200 && httpStatus < 300) return null;
  const message = sanitized(statusMessage) ?? `Provider returned HTTP ${httpStatus}.`;
  const options = { httpStatus } satisfies { httpStatus: number };

  if (httpStatus === 401 || httpStatus === 403) {
    return new DataForSeoError(operation, "AUTHENTICATION", message, options);
  }
  if (httpStatus === 402) {
    return new DataForSeoError(operation, "PROVIDER_QUOTA", message, options);
  }
  if (httpStatus === 429) {
    return new DataForSeoError(operation, "RATE_LIMIT", message, {
      ...options,
      retryable: true,
    });
  }
  if (httpStatus >= 500) {
    return new DataForSeoError(operation, "PROVIDER_ERROR", message, {
      ...options,
      retryable: true,
    });
  }
  return new DataForSeoError(operation, "PROVIDER_ERROR", message, options);
}

/* ------------------------------ normalization ----------------------------- */

function hostnameFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Flatten keyword_overview/live into normalized metric rows.
 * `requestedKeywords` is used to report which sent keywords the provider
 * omitted (DataForSEO silently skips keywords it does not know, unbilled).
 */
export function normalizeKeywordOverview(
  response: KeywordOverviewResponse,
  requestedKeywords: string[]
): KeywordOverviewResult {
  const items: KeywordMetricData[] = [];
  let actualCostUsd: number | null = null;
  let taskId: string | null = null;

  for (const task of response.tasks ?? []) {
    if (actualCostUsd == null && typeof task.cost === "number") {
      actualCostUsd = task.cost;
    }
    if (taskId == null && task.id) taskId = task.id;
    for (const result of task.result ?? []) {
      for (const item of result.items ?? []) {
        const info = item.keyword_info;
        items.push({
          keyword: item.keyword,
          searchVolume: info?.search_volume ?? null,
          cpc: info?.cpc ?? null,
          competition: info?.competition ?? null,
          competitionLevel: info?.competition_level ?? null,
          trendMonthly: info?.search_volume_trend?.monthly ?? null,
          trendQuarterly: info?.search_volume_trend?.quarterly ?? null,
          trendYearly: info?.search_volume_trend?.yearly ?? null,
          intent: item.search_intent_info?.main_intent ?? null,
        });
      }
    }
  }

  if (actualCostUsd == null && typeof response.cost === "number") {
    actualCostUsd = response.cost;
  }

  const returned = new Set(items.map((item) => item.keyword.toLowerCase()));
  const omittedKeywords = requestedKeywords.filter((keyword) => !returned.has(keyword.toLowerCase()));

  return {
    items,
    omittedKeywords,
    actualCostUsd,
    taskId,
    cacheHit: false,
    mocked: false,
  };
}

/** Flatten serp/google/organic/live/regular into a normalized snapshot. */
export function normalizeSerpLive(
  response: SerpLiveRegularResponse,
  requestedKeyword: string
): SerpLiveResult {
  const task = response.tasks?.[0] ?? null;
  const result = task?.result?.[0] ?? null;

  const items: SerpResultItem[] = [];
  for (const raw of result?.items ?? []) {
    if (!raw.url) continue;
    const domain = raw.domain ?? hostnameFromUrl(raw.url);
    if (!domain) continue;
    items.push({
      rank: raw.rank_group ?? null,
      absoluteRank: raw.rank_absolute ?? null,
      page: raw.page ?? null,
      resultType: raw.type,
      url: raw.url,
      domain: domain.toLowerCase(),
      title: raw.title ?? null,
    });
  }

  return {
    keyword: result?.keyword ?? requestedKeyword,
    itemTypes: (result?.item_types ?? []).slice(0, 25),
    seResultsCount: result?.se_results_count ?? null,
    results: items,
    actualCostUsd: task?.cost ?? response.cost ?? null,
    taskId: task?.id ?? null,
    cacheHit: false,
    mocked: false,
  };
}

/** Re-export for callers that classify without importing the class directly. */
export type { ProviderErrorClass };

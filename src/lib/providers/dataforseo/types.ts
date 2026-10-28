import type { ProviderErrorClass } from "@/lib/db/schema/types";

/**
 * DataForSEO provider abstraction types.
 *
 * Endpoints (verified against the CURRENT official docs — docs.dataforseo.com,
 * Oct 2026; see docs/DATAFORSEO.md):
 * - POST /v3/dataforseo_labs/google/keyword_overview/live
 * - POST /v3/serp/google/organic/live/regular
 *
 * Design rules:
 * - Business code never sees provider-shaped payloads: the client returns
 *   the normalized types below.
 * - Every provider metric is nullable — a value the provider does not return
 *   stays null. Nothing is ever back-filled or estimated per keyword.
 * - Errors are classified (`ProviderErrorClass`) so retries, spend records
 *   and observability can reason about failures without string matching.
 */

/**
 * Thrown by the DataForSEO client. Carries a sanitized message only:
 * never credentials, never raw response bodies.
 */
export class DataForSeoError extends Error {
  readonly errorClass: ProviderErrorClass;
  readonly operation: string;
  /** True only for transient failures that are safe to retry (429/5xx/network). */
  readonly retryable: boolean;
  /** DataForSEO status_code (20000-range family) when the response parsed. */
  readonly providerStatus?: number;
  /** HTTP status when an HTTP round trip happened. */
  readonly httpStatus?: number;

  constructor(
    operation: string,
    errorClass: ProviderErrorClass,
    message: string,
    options: {
      retryable?: boolean;
      providerStatus?: number;
      httpStatus?: number;
      cause?: unknown;
    } = {}
  ) {
    super(`[dataforseo:${operation}] ${message}`, { cause: options.cause });
    this.name = "DataForSeoError";
    this.operation = operation;
    this.errorClass = errorClass;
    this.retryable = options.retryable ?? false;
    this.providerStatus = options.providerStatus;
    this.httpStatus = options.httpStatus;
  }
}

/* ------------------------------- normalized ------------------------------- */

export interface KeywordMetricData {
  /** Keyword exactly as returned by the provider (lowercased). */
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  /** 0-1 paid-search competition (Google Ads based). */
  competition: number | null;
  /** Provider competition level; LOW | MEDIUM | HIGH | null (unknown). */
  competitionLevel: string | null;
  /** Search-volume change percent vs previous month / quarter / year. */
  trendMonthly: number | null;
  trendQuarterly: number | null;
  trendYearly: number | null;
  /** Provider main search intent (informational | navigational | commercial | transactional). */
  intent: string | null;
}

export interface DataForSeoUsageInfo {
  /** Provider-reported actual cost of the request (USD) when reported. */
  actualCostUsd: number | null;
  /** DataForSEO task id when returned (audit trail). */
  taskId: string | null;
  /** True when the result came from our cache — no provider request made. */
  cacheHit: boolean;
  /** True when produced by the deterministic mock client. */
  mocked: boolean;
}

export interface KeywordOverviewResult extends DataForSeoUsageInfo {
  /** One entry per keyword the provider knew about (unknown keywords omitted). */
  items: KeywordMetricData[];
  /** Keywords sent that the provider omitted from the response. */
  omittedKeywords: string[];
}

export interface SerpResultItem {
  /** Rank within its result-type group (provider rank_group). */
  rank: number | null;
  /** Absolute position across the SERP (provider rank_absolute). */
  absoluteRank: number | null;
  page: number | null;
  /** organic | paid | featured_snippet (only types this endpoint returns). */
  resultType: string;
  url: string;
  domain: string;
  title: string | null;
}

export interface SerpLiveResult extends DataForSeoUsageInfo {
  keyword: string;
  /** SERP item types observed on the page (e.g. organic, ai_overview). */
  itemTypes: string[];
  /** Total results the provider reported for the SERP (null when omitted). */
  seResultsCount: number | null;
  results: SerpResultItem[];
}

/* --------------------------------- client --------------------------------- */

/**
 * Mock-only fixture hints (e.g. which domain to place in fixture SERPs).
 * Consumed by the mock client and IGNORED by the real client.
 */
export interface MockFixtureHint {
  /** Domain to place in fixture SERPs as the customer's own site. */
  trackedDomain?: string | null;
  /** Domains to place in fixture SERPs as competitors. */
  competitors?: string[];
}

export interface DataForSeoRequestContext {
  workspaceId?: string | null;
  domainId?: string | null;
  scanId?: string | null;
  runId?: string | null;
  fixtureHint?: MockFixtureHint;
}

export interface KeywordOverviewParams extends DataForSeoRequestContext {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}

export interface SerpLiveParams extends DataForSeoRequestContext {
  keyword: string;
  locationCode: number;
  languageCode: string;
  /** Depth capped at 10 (one billed SERP page) — never above the cap. */
  depth?: number;
}

export interface DataForSeoClient {
  /** True when this client serves deterministic fixtures (zero spend). */
  readonly mock: boolean;
  keywordOverview(params: KeywordOverviewParams): Promise<KeywordOverviewResult>;
  serpLiveRegular(params: SerpLiveParams): Promise<SerpLiveResult>;
}

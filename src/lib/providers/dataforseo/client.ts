import { ConfigurationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";
import { cacheGet, cacheSet } from "@/lib/redis";
import {
  keywordOverviewCacheKey,
  serpLiveCacheKey,
} from "@/lib/providers/dataforseo/cache";
import {
  estimateKeywordOverviewUsd,
  estimateSerpLiveRegularUsd,
} from "@/lib/providers/dataforseo/costs";
import {
  classifyHttpStatus,
  classifyProviderStatus,
  normalizeKeywordOverview,
  normalizeSerpLive,
} from "@/lib/providers/dataforseo/normalize";
import {
  keywordOverviewResponseSchema,
  serpLiveRegularResponseSchema,
} from "@/lib/providers/dataforseo/schemas";
import { DataForSeoError } from "@/lib/providers/dataforseo/types";
import type {
  DataForSeoClient,
  DataForSeoRequestContext,
  KeywordOverviewParams,
  KeywordOverviewResult,
  SerpLiveParams,
  SerpLiveResult,
} from "@/lib/providers/dataforseo/types";
import type { ProviderErrorClass } from "@/lib/db/schema/types";
import { CACHE_TTL } from "@/lib/usage/limits";
import { requirePaidOperation } from "@/lib/usage/guards";
import { recordUsage } from "@/lib/usage/recorder";

/**
 * Real DataForSEO HTTP client (Live endpoints).
 *
 * Safety invariants enforced HERE so no call site can forget them:
 * 1. `canPerformPaidOperation()` (via requirePaidOperation) runs BEFORE any
 *    external request; `recordUsage()` runs AFTER every attempt, including
 *    failed ones (with the classified error class).
 * 2. Cache hits record a ledger row with `cacheHit: true` and make NO
 *    provider request (guard counters untouched — nothing was consumed).
 * 3. Retries only for transient, safe-to-retry failures (HTTP 429/5xx and
 *    network errors). Timeouts and provider 4xxxx statuses are NOT retried —
 *    a synchronous Live request that timed out may still have completed
 *    server-side, and retrying could double-charge.
 * 4. Logs are redacted and bounded: no auth headers, no request bodies, no
 *    raw response payloads.
 */

const KEYWORD_OVERVIEW_PATH = "/v3/dataforseo_labs/google/keyword_overview/live";
const SERP_LIVE_REGULAR_PATH = "/v3/serp/google/organic/live/regular";

/** 1 initial attempt + 2 retries. */
const MAX_HTTP_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const SERP_DEPTH_MAX = 10; // one billed SERP page — never exceeds scan budgets

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envelopeOf(json: unknown): { status?: number; message?: string | null } {
  if (typeof json === "object" && json !== null) {
    const record = json as Record<string, unknown>;
    return {
      status: typeof record.status_code === "number" ? record.status_code : undefined,
      message: typeof record.status_message === "string" ? record.status_message : null,
    };
  }
  return {};
}

function classifyTransportError(
  operation: string,
  error: unknown,
  timeoutMs: number
): DataForSeoError {
  if (error instanceof DataForSeoError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    // Deliberately NOT retryable: Live endpoints are synchronous — a timed
    // out request may still have executed server-side (double-charge risk).
    return new DataForSeoError(
      operation,
      "TIMEOUT",
      `The provider did not respond within ${timeoutMs}ms.`,
      { retryable: false, cause: error }
    );
  }
  return new DataForSeoError(operation, "NETWORK", "Network error while contacting the provider.", {
    retryable: true,
    cause: error,
  });
}

interface AttemptRecord {
  operation: string;
  ctx: DataForSeoRequestContext;
  units: number;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  cacheHit: boolean;
  success: boolean;
  errorClass?: ProviderErrorClass;
}

export class HttpDataForSeoClient implements DataForSeoClient {
  readonly mock = false;

  private readonly login: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: { login?: string; password?: string; baseUrl?: string; timeoutMs?: number } = {}) {
    this.login = options.login ?? env.DATAFORSEO_LOGIN ?? "";
    this.password = options.password ?? env.DATAFORSEO_PASSWORD ?? "";
    this.baseUrl = (
      options.baseUrl ??
      env.DATAFORSEO_BASE_URL ??
      "https://api.dataforseo.com"
    ).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? env.DATAFORSEO_TIMEOUT_MS;
    if (!this.login || !this.password) {
      throw new ConfigurationError(
        "DataForSEO credentials are not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD). " +
          "Set DATAFORSEO_MOCK_MODE=true for development."
      );
    }
  }

  async keywordOverview(params: KeywordOverviewParams): Promise<KeywordOverviewResult> {
    const keywords = [
      ...new Set(params.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)),
    ].slice(0, 700); // provider hard limit
    const cacheKey = keywordOverviewCacheKey({
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      keywords,
    });

    const cached = await cacheGet<KeywordOverviewResult>(cacheKey);
    if (cached) {
      await this.record({
        operation: "keyword_overview",
        ctx: params,
        units: 0,
        estimatedCostUsd: 0,
        actualCostUsd: null,
        cacheHit: true,
        success: true,
      });
      return { ...cached, cacheHit: true };
    }

    await requirePaidOperation("dataforseo_request", {
      provider: "dataforseo",
      workspaceId: params.workspaceId ?? undefined,
    });

    const estimate = estimateKeywordOverviewUsd(keywords.length);
    try {
      const raw = await this.post(
        KEYWORD_OVERVIEW_PATH,
        [
          {
            keywords,
            location_code: params.locationCode,
            language_code: params.languageCode,
            include_serp_info: false,
          },
        ],
        "keyword_overview"
      );
      const parsed = keywordOverviewResponseSchema.parse(raw);
      const result = normalizeKeywordOverview(parsed, keywords);
      await cacheSet(cacheKey, { ...result, cacheHit: false }, CACHE_TTL.keywordMetrics);
      await this.record({
        operation: "keyword_overview",
        ctx: params,
        units: 1,
        estimatedCostUsd: estimate,
        actualCostUsd: result.actualCostUsd,
        cacheHit: false,
        success: true,
      });
      return result;
    } catch (error) {
      throw await this.recordFailure("keyword_overview", params, estimate, error);
    }
  }

  async serpLiveRegular(params: SerpLiveParams): Promise<SerpLiveResult> {
    const keyword = params.keyword.trim();
    const depth = Math.min(SERP_DEPTH_MAX, Math.max(1, params.depth ?? SERP_DEPTH_MAX));
    const cacheKey = serpLiveCacheKey({
      keyword,
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      depth,
    });

    const cached = await cacheGet<SerpLiveResult>(cacheKey);
    if (cached) {
      await this.record({
        operation: "serp_organic_live",
        ctx: params,
        units: 0,
        estimatedCostUsd: 0,
        actualCostUsd: null,
        cacheHit: true,
        success: true,
      });
      return { ...cached, cacheHit: true };
    }

    await requirePaidOperation("dataforseo_request", {
      provider: "dataforseo",
      workspaceId: params.workspaceId ?? undefined,
    });

    const estimate = estimateSerpLiveRegularUsd(depth);
    try {
      const raw = await this.post(
        SERP_LIVE_REGULAR_PATH,
        [
          {
            keyword,
            location_code: params.locationCode,
            language_code: params.languageCode,
            depth,
          },
        ],
        "serp_organic_live"
      );
      const parsed = serpLiveRegularResponseSchema.parse(raw);
      const result = normalizeSerpLive(parsed, keyword);
      await cacheSet(cacheKey, { ...result, cacheHit: false }, CACHE_TTL.serpSnapshot);
      await this.record({
        operation: "serp_organic_live",
        ctx: params,
        units: 1,
        estimatedCostUsd: estimate,
        actualCostUsd: result.actualCostUsd,
        cacheHit: false,
        success: true,
      });
      return result;
    } catch (error) {
      throw await this.recordFailure("serp_organic_live", params, estimate, error);
    }
  }

  /* ------------------------------ internals ------------------------------ */

  /** Records one attempt in the durable usage ledger + Redis counters. */
  private async record(attempt: AttemptRecord): Promise<void> {
    await recordUsage({
      workspaceId: attempt.ctx.workspaceId ?? null,
      domainId: attempt.ctx.domainId ?? null,
      scanId: attempt.ctx.scanId ?? null,
      runId: attempt.ctx.runId ?? null,
      provider: "dataforseo",
      operation: attempt.operation,
      // Cache hits consume no guard budget — no provider request was made.
      guardOperation: attempt.cacheHit ? undefined : "dataforseo_request",
      units: attempt.units,
      estimatedCostUsd: attempt.estimatedCostUsd,
      actualCostUsd: attempt.actualCostUsd,
      cacheHit: attempt.cacheHit,
      success: attempt.success,
      errorClass: attempt.errorClass,
    });
  }

  /** Records a failed attempt, then returns the error to throw. */
  private async recordFailure(
    operation: string,
    ctx: DataForSeoRequestContext,
    estimate: number,
    error: unknown
  ): Promise<Error> {
    const errorClass: ProviderErrorClass =
      error instanceof DataForSeoError ? error.errorClass : "BAD_RESPONSE";
    await this.record({
      operation,
      ctx,
      units: 1,
      estimatedCostUsd: estimate,
      actualCostUsd: null,
      cacheHit: false,
      success: false,
      errorClass,
    });
    metrics.increment("dataforseo.attempt_failed", { operation, class: errorClass });

    if (error instanceof DataForSeoError) return error;
    return new DataForSeoError(
      operation,
      "BAD_RESPONSE",
      "The provider response did not match the documented schema.",
      { cause: error }
    );
  }

  /**
   * POST with bounded retry (transient failures only). Returns the parsed
   * JSON body; throws classified DataForSeoError otherwise.
   */
  private async post(path: string, body: unknown[], operation: string): Promise<unknown> {
    const authorization =
      "Basic " + Buffer.from(`${this.login}:${this.password}`, "utf8").toString("base64");
    let lastError: DataForSeoError | null = null;

    for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await fetch(this.baseUrl + path, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const durationMs = Date.now() - startedAt;

        const text = await response.text();
        let json: unknown = null;
        try {
          json = text ? (JSON.parse(text) as unknown) : null;
        } catch {
          json = null;
        }
        const envelope = envelopeOf(json);
        logger.debug("DataForSEO response", {
          operation,
          httpStatus: response.status,
          providerStatus: envelope.status,
          durationMs,
        });

        if (json === null) {
          // Non-JSON body: the request DID execute, but retrying is unsafe.
          throw new DataForSeoError(
            operation,
            "BAD_RESPONSE",
            `The provider returned a non-JSON response (HTTP ${response.status}).`,
            { httpStatus: response.status }
          );
        }

        const classified =
          classifyHttpStatus(operation, response.status, envelope.message) ??
          classifyProviderStatus(operation, envelope.status, envelope.message);
        if (classified) throw classified;

        metrics.increment("dataforseo.response_ok", { operation });
        return json;
      } catch (error) {
        const classified = classifyTransportError(operation, error, this.timeoutMs);
        lastError = classified;

        if (classified.retryable && attempt < MAX_HTTP_ATTEMPTS) {
          const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 125);
          logger.warn("DataForSEO request failed — retrying", {
            operation,
            attempt,
            errorClass: classified.errorClass,
            delayMs,
          });
          metrics.increment("dataforseo.retry", { operation, class: classified.errorClass });
          await sleep(delayMs);
          continue;
        }

        logger.error("DataForSEO request failed", {
          operation,
          errorClass: classified.errorClass,
          retryable: classified.retryable,
          attempts: attempt,
        });
        throw classified;
      }
    }

    throw lastError ?? new DataForSeoError(operation, "PROVIDER_ERROR", "Request failed.");
  }
}

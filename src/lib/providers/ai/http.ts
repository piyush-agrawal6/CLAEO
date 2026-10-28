import type { ProviderErrorClass } from "@/lib/db/schema/types";
import type { PaidProvider } from "@/lib/usage/limits";
import type { AiEngineKey, AiRequestContext } from "@/lib/providers/ai/types";
import { AiProviderError } from "@/lib/providers/ai/types";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";
import { requirePaidOperation } from "@/lib/usage/guards";
import { recordUsage } from "@/lib/usage/recorder";

/**
 * Shared HTTP + cost-guard plumbing for real AI adapters.
 *
 * Retry policy (mirrors the DataForSEO client):
 * - retry once on HTTP 429/5xx and network errors;
 * - NEVER retry timeouts — an aborted LLM call may still complete
 *   server-side, and double-sending is a real cost risk.
 *
 * Cost accounting: AI requests are bounded by REQUEST counters
 * (MAX_AI_REQUESTS_PER_SCAN / MAX_LLM_REQUESTS_PER_DAY) rather than a price
 * table — we do not assert per-token prices we have not verified, so the
 * estimated cost is recorded as 0 and provider-reported token usage is
 * stored when available (see docs/PROVIDER_COSTS.md).
 */

const MAX_ATTEMPTS = 2; // 1 initial + 1 retry
const RETRY_BASE_DELAY_MS = 250;
export const AI_HTTP_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyHttp(engine: AiEngineKey, httpStatus: number, message: string | null): AiProviderError | null {
  if (httpStatus >= 200 && httpStatus < 300) return null;
  const msg = message?.slice(0, 300) || `Provider returned HTTP ${httpStatus}.`;
  if (httpStatus === 401 || httpStatus === 403) {
    return new AiProviderError(engine, "AUTHENTICATION", msg, { httpStatus });
  }
  if (httpStatus === 429) {
    return new AiProviderError(engine, "RATE_LIMIT", msg, { httpStatus, retryable: true });
  }
  if (httpStatus >= 500) {
    return new AiProviderError(engine, "PROVIDER_ERROR", msg, { httpStatus, retryable: true });
  }
  return new AiProviderError(engine, "PROVIDER_ERROR", msg, { httpStatus });
}

function classifyTransport(engine: AiEngineKey, error: unknown, timeoutMs: number): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new AiProviderError(engine, "TIMEOUT", `The provider did not respond within ${timeoutMs}ms.`, {
      retryable: false,
      cause: error,
    });
  }
  return new AiProviderError(engine, "NETWORK", "Network error while contacting the provider.", {
    retryable: true,
    cause: error,
  });
}

export interface AiPostParams {
  engine: AiEngineKey;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  /** Extract a sanitized error message from a parsed error body, if any. */
  extractErrorMessage?: (json: unknown) => string | null;
}

/** POST JSON with bounded retry; returns the parsed JSON body. */
export async function aiPostJson(params: AiPostParams): Promise<unknown> {
  const timeoutMs = params.timeoutMs ?? AI_HTTP_TIMEOUT_MS;
  let lastError: AiProviderError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(params.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...params.headers },
        body: JSON.stringify(params.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        json = null;
      }

      const errorMessage =
        json !== null && params.extractErrorMessage ? params.extractErrorMessage(json) : null;
      const classified = classifyHttp(params.engine, response.status, errorMessage);
      if (classified) throw classified;

      if (json === null) {
        throw new AiProviderError(
          params.engine,
          "BAD_RESPONSE",
          `The provider returned a non-JSON response (HTTP ${response.status}).`,
          { httpStatus: response.status }
        );
      }
      return json;
    } catch (error) {
      const classified = classifyTransport(params.engine, error, timeoutMs);
      lastError = classified;
      if (classified.retryable && attempt < MAX_ATTEMPTS) {
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 125);
        logger.warn("AI provider request failed — retrying", {
          engine: params.engine,
          attempt,
          errorClass: classified.errorClass,
          delayMs,
        });
        metrics.increment("ai.retry", { engine: params.engine, class: classified.errorClass });
        await sleep(delayMs);
        continue;
      }
      logger.error("AI provider request failed", {
        engine: params.engine,
        errorClass: classified.errorClass,
        retryable: classified.retryable,
      });
      throw classified;
    }
  }
  throw lastError ?? new AiProviderError(params.engine, "PROVIDER_ERROR", "Request failed.");
}

export interface ExecuteAiRequestParams {
  engine: AiEngineKey;
  /** Billed provider budget (gemini | groq). */
  provider: PaidProvider;
  /** Ledger operation name, e.g. "generate_content" | "chat_completions". */
  operation: string;
  ctx?: AiRequestContext;
  call: () => Promise<unknown>;
}

/**
 * Runs one paid AI request with the mandatory guard/record sequence:
 * requirePaidOperation BEFORE, recordUsage AFTER (success and failure).
 * Returns the parsed JSON body.
 */
export async function executeAiRequest(
  params: ExecuteAiRequestParams
): Promise<{ json: unknown; latencyMs: number }> {
  await requirePaidOperation("llm_request", {
    provider: params.provider,
    workspaceId: params.ctx?.workspaceId ?? undefined,
  });

  const startedAt = Date.now();
  const record = async (input: {
    success: boolean;
    errorClass?: ProviderErrorClass;
  }): Promise<void> => {
    await recordUsage({
      workspaceId: params.ctx?.workspaceId ?? null,
      domainId: params.ctx?.domainId ?? null,
      scanId: params.ctx?.scanId ?? null,
      runId: params.ctx?.runId ?? null,
      provider: params.provider,
      operation: params.operation,
      guardOperation: "llm_request",
      units: 1,
      estimatedCostUsd: 0, // price not asserted — bounded by request counters
      actualCostUsd: null,
      cacheHit: false,
      success: input.success,
      errorClass: input.errorClass,
    });
  };

  try {
    const json = await params.call();
    const latencyMs = Date.now() - startedAt;
    await record({ success: true });
    return { json, latencyMs };
  } catch (error) {
    const errorClass: ProviderErrorClass =
      error instanceof AiProviderError ? error.errorClass : "BAD_RESPONSE";
    await record({ success: false, errorClass });
    metrics.increment("ai.attempt_failed", { engine: params.engine, class: errorClass });
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError(params.engine, "BAD_RESPONSE", "The provider response was malformed.", {
      cause: error,
    });
  }
}

/** Sanitized bounded extractor for `{ error: { message } }` style bodies. */
export function extractErrorMessageField(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const error = (json as { error?: unknown }).error;
  if (typeof error === "string") return error.slice(0, 300);
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 300);
  }
  return null;
}

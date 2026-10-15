import {
  AIResponseFormatError,
  AIProviderTransportError,
  type AIProvider,
  type AnalyzeParams,
  type AnalyzeResult,
  type ClassifyParams,
  type ClassifyResult,
  type GenerateStructuredResult,
} from "@/lib/ai/types";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";

/**
 * Provider-agnostic helpers shared by the real Gemini/Groq adapters:
 * extract the first JSON object/array from noisy model output.
 */

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  // Strip common markdown fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith("{") || candidate.startsWith("[")) return candidate;

  // Fall back to the first balanced JSON object or array in the text.
  const start = candidate.search(/[[{]/);
  if (start === -1) return candidate;
  const opener = candidate[start];
  const closer = opener === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(closer);
  if (end > start) return candidate.slice(start, end + 1);
  return candidate;
}

export function parseJsonLenient(raw: string): unknown {
  const payload = extractJsonPayload(raw);
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new AIResponseFormatError(
      "unknown",
      `Response did not contain valid JSON (${(error as Error).message})`
    );
  }
}

/**
 * Wrap any provider call with latency metrics, structured logging and
 * error normalization. Raw provider bodies are never logged.
 */
export async function instrumentProviderCall<T>(
  provider: string,
  operation: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    metrics.observe("ai.latency_ms", performance.now() - started, { provider, label });
    return result;
  } catch (error) {
    metrics.increment("ai.failures", { provider, label });
    if (
      error instanceof AIResponseFormatError ||
      error instanceof AIProviderTransportError
    ) {
      throw error;
    }
    throw new AIProviderTransportError(
      provider as never,
      `${operation} failed`,
      { cause: error }
    );
  }
}

/**
 * Retry-once semantics for structured output:
 * 1. primary provider, 2. primary provider again (transient/format), then
 * the fallback provider once. After that, fail gracefully — we never burn
 * quota on repeated retries.
 */
export interface RetryContext {
  primary: AIProvider;
  fallback: AIProvider | null;
}

export async function withFormatRetry<T>(
  providers: AIProvider[],
  attempt: (provider: AIProvider) => Promise<GenerateStructuredResult<T>>,
  label: string
): Promise<GenerateStructuredResult<T>> {
  let lastError: unknown;

  for (const provider of providers) {
    // One retry for format failures per provider.
    for (let tryNo = 1; tryNo <= 2; tryNo++) {
      try {
        const result = await attempt(provider);
        metrics.increment("ai.success", { provider: provider.id, label });
        return result;
      } catch (error) {
        lastError = error;
        const isFormatError = error instanceof AIResponseFormatError;
        logger.warn("AI provider attempt failed", {
          label,
          provider: provider.id,
          attempt: tryNo,
          formatError: isFormatError,
          error: error instanceof Error ? error.message : String(error),
        });
        // Transport errors are not retried on the same provider.
        if (!isFormatError) break;
      }
    }
  }

  metrics.increment("ai.exhausted", { label });
  throw lastError instanceof Error
    ? lastError
    : new AIResponseFormatError("unknown", "All AI providers failed");
}

export type { ClassifyParams, ClassifyResult, AnalyzeParams, AnalyzeResult };

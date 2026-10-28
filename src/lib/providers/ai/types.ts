import type { ProviderErrorClass } from "@/lib/db/schema/types";
import type { PaidProvider } from "@/lib/usage/limits";
import type { EngineKey } from "@/lib/providers/search/types";

/**
 * AI engine adapter layer (Phase 3B).
 *
 * Honesty contract:
 * - An adapter may only claim the engine it genuinely talks to. There is a
 *   REAL adapter for Gemini (Google AI) and Llama (Groq); everything else
 *   stays `planned` in the engine registry until a documented source exists.
 * - Adapters NEVER receive brand/domain information for real calls: the
 *   measurement prompt must stay neutral or mentions would be meaningless.
 *   `fixtureHint` exists for the deterministic mock only.
 * - Every paid call goes through requirePaidOperation() before and
 *   recordUsage() after (including failures), exactly like DataForSEO.
 */

export const aiEngineKeys = [
  "chatgpt",
  "gemini",
  "perplexity",
  "google_ai_mode",
  "claude",
  "copilot",
  "llama",
] as const;
export type AiEngineKey = (typeof aiEngineKeys)[number];

/** Engine keys backed by a REAL adapter in this deployment. */
export const realAiEngineKeys = ["gemini", "llama"] as const;
export type RealAiEngineKey = (typeof realAiEngineKeys)[number];

/** Classified AI-provider failure (mirrors the DataForSEO taxonomy). */
export class AiProviderError extends Error {
  readonly errorClass: ProviderErrorClass;
  readonly engine: AiEngineKey;
  /** True only for transient failures safe to retry (429/5xx/network). */
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(
    engine: AiEngineKey,
    errorClass: ProviderErrorClass,
    message: string,
    options: { retryable?: boolean; httpStatus?: number; cause?: unknown } = {}
  ) {
    super(`[ai:${engine}] ${message}`, { cause: options.cause });
    this.name = "AiProviderError";
    this.engine = engine;
    this.errorClass = errorClass;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus;
  }
}

/** Correlation ids for the usage ledger (Phase 3). */
export interface AiRequestContext {
  workspaceId?: string | null;
  domainId?: string | null;
  scanId?: string | null;
  runId?: string | null;
}

export interface AiAnswerRequest {
  prompt: string;
  ctx?: AiRequestContext;
  /**
   * MOCK-ONLY fixture hints (deterministic sample answers that reference the
   * customer's brand/domain). NEVER sent to a real provider — a real
   * measurement prompt must stay neutral or mentions prove nothing.
   */
  fixtureHint?: {
    brandName?: string | null;
    domain?: string | null;
    competitors?: string[];
  };
}

export interface AiAnswer {
  answerText: string;
  /** Model that actually produced the answer (env-derived, never hardcoded logic). */
  model: string | null;
  latencyMs: number;
  /** Bounded token usage when the provider reports it. */
  tokenUsage: { input?: number; output?: number } | null;
  /** Provider-reported actual cost when known; null when not reported. */
  actualCostUsd: number | null;
  /** True when produced by the deterministic mock (must be labeled in UI). */
  mocked: boolean;
}

export interface AiEngineAdapter {
  readonly engine: AiEngineKey;
  /** Which paid-provider budget consumes (gemini | groq). */
  readonly provider: PaidProvider;
  readonly model: string;
  readonly mock: boolean;
  /** True ONLY when the integration returns explicit provider citations. */
  readonly supportsCitations: boolean;
  ask(request: AiAnswerRequest): Promise<AiAnswer>;
}

export type { EngineKey };

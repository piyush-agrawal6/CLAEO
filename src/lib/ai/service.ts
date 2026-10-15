import { MockAIProvider } from "@/lib/ai/mock-provider";
import { withFormatRetry } from "@/lib/ai/provider-helpers";
import {
  type AIProvider,
  type AIProviderId,
  type AnalyzeParams,
  type AnalyzeResult,
  type ClassifyParams,
  type ClassifyResult,
  type GenerateStructuredParams,
  type GenerateStructuredResult,
} from "@/lib/ai/types";
import { ConfigurationError, QuotaExceededError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { canPerformPaidOperation } from "@/lib/usage/guards";
import { recordUsage } from "@/lib/usage/recorder";

/**
 * AIService — the only AI entry point for business logic.
 *
 * Responsibilities:
 * - resolve primary/fallback providers (never hardcoded in features)
 * - enforce the usage/budget guard BEFORE any provider call
 * - validate structured output with Zod, retrying at most once per provider
 * - record usage (units + estimated cost) after every call
 * - fail gracefully (typed errors), never crash the app or loop on retries
 */

/** Rough estimated cost per 1K output tokens by provider (USD, labeled estimate). */
const ESTIMATED_COST_PER_1K_OUTPUT: Record<AIProviderId, number> = {
  gemini: 0.0004,
  groq: 0.0008,
  mock: 0,
};

export interface AIServiceOptions {
  primary: AIProvider;
  fallback?: AIProvider | null;
  /** Workspace to attribute usage to. */
  workspaceId?: string | null;
}

export class AIService {
  readonly primary: AIProvider;
  readonly fallback: AIProvider | null;
  private readonly workspaceId: string | null;

  constructor(options: AIServiceOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback ?? null;
    this.workspaceId = options.workspaceId ?? null;
  }

  /** Providers in attempt order, de-duplicated. */
  private get providerChain(): AIProvider[] {
    if (!this.fallback || this.fallback.id === this.primary.id) {
      return [this.primary];
    }
    return [this.primary, this.fallback];
  }

  private get isMocked(): boolean {
    return this.primary.id === "mock";
  }

  private async guard(operationLabel: string): Promise<void> {
    if (this.isMocked) return; // mocks cost nothing
    const check = await canPerformPaidOperation("llm_request");
    if (!check.allowed) {
      logger.warn("LLM call denied by usage guard", { label: operationLabel });
      throw new QuotaExceededError(
        "budget",
        "The daily AI usage limit has been reached. Please try again later."
      );
    }
  }

  private async record(label: string, provider: AIProviderId, outputTokens?: number): Promise<void> {
    if (this.isMocked) return;
    const estimatedCostUsd = ((outputTokens ?? 0) / 1000) * ESTIMATED_COST_PER_1K_OUTPUT[provider];
    await recordUsage({
      workspaceId: this.workspaceId,
      provider,
      operation: label,
      guardOperation: "llm_request",
      units: 1,
      estimatedCostUsd,
    });
  }

  /**
   * Structured generation. Output is parsed with the provided Zod schema;
   * malformed responses are retried once per provider, then the fallback
   * provider is attempted. After that, a typed error is thrown.
   */
  async generateStructured<T>(
    params: GenerateStructuredParams<T>
  ): Promise<GenerateStructuredResult<T>> {
    await this.guard(params.label);

    try {
      const result = await withFormatRetry(
        this.providerChain,
        (provider) => provider.generateStructured(params),
        params.label
      );
      await this.record(params.label, result.provider, result.usage?.outputTokens);
      if (result.mocked) {
        logger.debug("AI structured call served from mock", { label: params.label });
      }
      return result;
    } catch (error) {
      await this.record(params.label, this.primary.id);
      throw error;
    }
  }

  /** Single-label classification with graceful failure. */
  async classify(params: ClassifyParams): Promise<ClassifyResult> {
    await this.guard(params.label);
    let lastError: unknown;
    for (const provider of this.providerChain) {
      try {
        const result = await provider.classify(params);
        await this.record(params.label, result.provider);
        return result;
      } catch (error) {
        lastError = error;
        logger.warn("AI classify attempt failed", {
          label: params.label,
          provider: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.record(params.label, this.primary.id);
    throw lastError instanceof Error ? lastError : new Error("Classification failed");
  }

  /** Free-text semantic analysis with graceful failure. */
  async analyze(params: AnalyzeParams): Promise<AnalyzeResult> {
    await this.guard(params.label);
    let lastError: unknown;
    for (const provider of this.providerChain) {
      try {
        const result = await provider.analyze(params);
        await this.record(params.label, result.provider);
        return result;
      } catch (error) {
        lastError = error;
        logger.warn("AI analyze attempt failed", {
          label: params.label,
          provider: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.record(params.label, this.primary.id);
    throw lastError instanceof Error ? lastError : new Error("Analysis failed");
  }
}

/* -------------------------------- factory -------------------------------- */

let service: AIService | null = null;

/**
 * Resolve the application AI service.
 *
 * - `AI_MOCK_MODE=true` (development default): only the deterministic mock
 *   provider is used — zero spend, zero network.
 * - Otherwise the configured primary/fallback providers are used. Real
 *   vendor adapters (Gemini/Groq) land in the AI-layer phase; until then a
 *   clear configuration error is raised rather than silently fabricating
 *   data.
 */
export function getAIService(workspaceId?: string | null): AIService {
  if (workspaceId !== undefined) {
    const { primary, fallback } = resolveProviders();
    return new AIService({ primary, fallback, workspaceId });
  }
  if (!service) {
    const { primary, fallback } = resolveProviders();
    service = new AIService({ primary, fallback });
  }
  return service;
}

function resolveProviders(): { primary: AIProvider; fallback: AIProvider | null } {
  if (env.AI_MOCK_MODE || env.NODE_ENV === "test") {
    return { primary: new MockAIProvider(), fallback: null };
  }
  throw new ConfigurationError(
    "Real AI providers are not wired yet (AI layer phase). " +
      "Set AI_MOCK_MODE=true for development, or implement the vendor adapter first."
  );
}

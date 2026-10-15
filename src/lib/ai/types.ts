import type { z } from "zod";

/**
 * AI provider abstraction.
 *
 * Business logic never talks to a concrete vendor. It calls `AIService`
 * (src/lib/ai/service.ts), which resolves primary/fallback providers from
 * this interface. Adding OpenAI/Claude later means implementing `AIProvider`
 * once — no feature code changes.
 */

export type AIProviderId = "gemini" | "groq" | "mock";

export interface AIUsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateStructuredParams<T> {
  /**
   * Stable label for metrics + mock resolution, e.g. "prompt_generation".
   */
  label: string;
  /** System-level instructions. Untrusted content goes via `untrustedContent`. */
  system?: string;
  /** The task prompt. */
  prompt: string;
  /**
   * Website/user-derived content that must be treated as DATA, never as
   * instructions. The provider layer wraps it with an injection guard.
   */
  untrustedContent?: string;
  /** Zod schema the model output must parse into. */
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Deterministic result for mock mode. Because a mock cannot satisfy an
   * arbitrary schema by magic, each call site provides its own fixture.
   */
  mockFactory?: () => T;
}

export interface GenerateStructuredResult<T> {
  data: T;
  provider: AIProviderId;
  model: string;
  usage?: AIUsageInfo;
  /** True when the result came from a mock, not a real provider. */
  mocked: boolean;
}

export interface ClassifyParams {
  label: string;
  system?: string;
  prompt: string;
  untrustedContent?: string;
  /** Allowed labels; the provider must return exactly one. */
  labels: readonly string[];
  mockFactory?: () => string;
}

export interface ClassifyResult {
  label: string;
  provider: AIProviderId;
  mocked: boolean;
}

export interface AnalyzeParams {
  label: string;
  system?: string;
  prompt: string;
  untrustedContent?: string;
  mockFactory?: () => string;
}

export interface AnalyzeResult {
  text: string;
  provider: AIProviderId;
  mocked: boolean;
}

export interface AIProvider {
  readonly id: AIProviderId;
  /** Model identifier actually used (from env, never hardcoded in logic). */
  readonly model: string;
  isAvailable(): boolean;
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<GenerateStructuredResult<T>>;
  classify(params: ClassifyParams): Promise<ClassifyResult>;
  analyze(params: AnalyzeParams): Promise<AnalyzeResult>;
}

/** Thrown by providers on transport/API errors (never carries raw bodies). */
export class AIProviderTransportError extends Error {
  constructor(
    readonly provider: AIProviderId,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "AIProviderTransportError";
  }
}

/** Thrown when the provider returned content that failed schema validation. */
export class AIResponseFormatError extends Error {
  constructor(
    readonly provider: AIProviderId | "unknown",
    message = "Model returned a response that did not match the expected structure"
  ) {
    super(message);
    this.name = "AIResponseFormatError";
  }
}

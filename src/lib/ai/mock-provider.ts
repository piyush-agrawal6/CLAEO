import {
  AIResponseFormatError,
  type AIProvider,
  type AnalyzeParams,
  type AnalyzeResult,
  type ClassifyParams,
  type ClassifyResult,
  type GenerateStructuredParams,
  type GenerateStructuredResult,
} from "@/lib/ai/types";

/**
 * Deterministic mock AI provider.
 *
 * Purpose: develop dashboards, flows and tests WITHOUT spending provider
 * credits. Every result carries `mocked: true` so any consumer can (and
 * must) label it in the UI.
 *
 * A mock cannot invent data for an arbitrary schema, so call sites pass a
 * `mockFactory` fixture. When no fixture exists, the mock fails loudly
 * instead of fabricating plausible-looking nonsense — fabricated data is a
 * hard product rule violation.
 *
 * `failureInjection` allows tests to simulate malformed model output for
 * the retry logic in `AIService`.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model = "mock-model";

  /** Test hook: label -> number of malformed responses to serve first. */
  readonly failureInjection = new Map<string, number>();

  isAvailable(): boolean {
    return true;
  }

  private shouldMalform(label: string): boolean {
    const remaining = this.failureInjection.get(label) ?? 0;
    if (remaining > 0) {
      this.failureInjection.set(label, remaining - 1);
      return true;
    }
    return false;
  }

  async generateStructured<T>(
    params: GenerateStructuredParams<T>
  ): Promise<GenerateStructuredResult<T>> {
    if (this.shouldMalform(params.label)) {
      throw new AIResponseFormatError("mock", "Injected malformed response");
    }
    if (!params.mockFactory) {
      throw new Error(
        `[mock] No mockFactory provided for label "${params.label}". ` +
          `Add a deterministic fixture at the call site.`
      );
    }
    const data = params.mockFactory();
    const parsed = params.schema.safeParse(data);
    if (!parsed.success) {
      throw new AIResponseFormatError(
        "mock",
        `mockFactory output for "${params.label}" does not match the schema`
      );
    }
    return {
      data: parsed.data,
      provider: "mock",
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
      mocked: true,
    };
  }

  async classify(params: ClassifyParams): Promise<ClassifyResult> {
    if (!params.mockFactory) {
      throw new Error(
        `[mock] No mockFactory provided for label "${params.label}".`
      );
    }
    const label = params.mockFactory();
    if (!params.labels.includes(label)) {
      throw new AIResponseFormatError(
        "mock",
        `Mock classification "${label}" is not one of the allowed labels`
      );
    }
    return { label, provider: "mock", mocked: true };
  }

  async analyze(params: AnalyzeParams): Promise<AnalyzeResult> {
    if (!params.mockFactory) {
      throw new Error(
        `[mock] No mockFactory provided for label "${params.label}".`
      );
    }
    return { text: params.mockFactory(), provider: "mock", mocked: true };
  }
}

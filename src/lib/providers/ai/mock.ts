import type { PaidProvider } from "@/lib/usage/limits";
import type {
  AiAnswer,
  AiEngineAdapter,
  AiAnswerRequest,
  AiEngineKey,
} from "@/lib/providers/ai/types";

/**
 * Deterministic mock AI adapter — sample data only, zero spend.
 *
 * The produced answer TEXT flows through the exact same mention/URL
 * detection as real answers, so the whole pipeline is exercised in dev/E2E.
 *
 * Deterministic fixture triggers (used by tests/E2E):
 * - a prompt containing `fixture-nobrand` → the brand is NEVER mentioned;
 * - otherwise the brand is mentioned for ~60% of (engine, prompt, domain)
 *   combinations, deterministically.
 *
 * The answer always contains the owned domain URL (extracted-URL evidence)
 * and occasionally a third-party review URL — mirroring how real answers
 * cite sources, while clearly remaining sample data (mocked: true).
 */

/** FNV-1a-style stable hash. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockAiAdapter implements AiEngineAdapter {
  readonly mock = true;
  readonly supportsCitations = false;
  readonly model: string;
  readonly provider: PaidProvider;

  constructor(
    readonly engine: AiEngineKey,
    provider: PaidProvider = "gemini"
  ) {
    this.model = `mock-${engine}`;
    this.provider = provider;
  }

  async ask(request: AiAnswerRequest): Promise<AiAnswer> {
    const seed = hash(`${this.engine}:${request.prompt}:${request.fixtureHint?.domain ?? ""}`);
    const brand = request.fixtureHint?.brandName?.trim() || "Acme";
    const domain = (request.fixtureHint?.domain ?? "acme.example").trim().toLowerCase();
    const competitors = (request.fixtureHint?.competitors ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 2);

    const mentionsBrand =
      !request.prompt.toLowerCase().includes("fixture-nobrand") && seed % 100 < 60;
    const mentionsCompetitor =
      competitors.length > 0 && seed % 100 >= 40 && seed % 100 < 70;

    const parts: string[] = [
      `[sample ${this.model}] Teams evaluating "${request.prompt.trim().slice(0, 80)}" usually compare features, pricing and reviews before deciding.`,
    ];
    if (mentionsBrand) {
      parts.push(
        `${brand} (https://${domain}) comes up often for its focused feature set and straightforward pricing.`
      );
    }
    if (mentionsCompetitor && competitors[0]) {
      parts.push(
        `${competitors[0]} is another frequently discussed alternative in third-party roundups.`
      );
    }
    // The owned site is only linked when the answer actually discusses the
    // brand — mirrors how real answers cite the pages they talk about.
    parts.push(
      mentionsBrand
        ? `A useful starting point: https://${domain}/guide, plus an independent roundup at https://industry-week.example/reviews.`
        : `A useful starting point: an independent roundup at https://industry-week.example/reviews.`
    );
    const answerText = parts.join(" ");

    return {
      answerText,
      model: this.model,
      latencyMs: 5 + (seed % 20),
      tokenUsage: { input: 30 + request.prompt.length, output: Math.ceil(answerText.length / 4) },
      actualCostUsd: null,
      mocked: true,
    };
  }
}

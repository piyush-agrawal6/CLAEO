import {
  type EngineKey,
  type SearchVisibilityProvider,
  type VisibilityObservation,
  type VisibilityQuery,
} from "@/lib/providers/search/types";

/**
 * Deterministic mock search-visibility provider.
 *
 * Output is a pure function of (engine, prompt, domain) so dashboards and
 * tests are stable. Everything is clearly flagged `mocked: true` and MUST
 * be labeled in the UI. Never enabled in production
 * (`DATAFORSEO_MOCK_MODE` is forced off when NODE_ENV=production).
 */

/** Tiny stable string hash (FNV-1a). */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockSearchVisibilityProvider implements SearchVisibilityProvider {
  readonly id = "mock-search";

  isAvailable(): boolean {
    return true;
  }

  supportedEngines(): EngineKey[] {
    return ["chatgpt", "gemini", "perplexity"];
  }

  async queryVisibility(query: VisibilityQuery): Promise<VisibilityObservation> {
    const seed = hash(`${query.engine}:${query.prompt}:${query.normalizedDomain}`);
    const brandMentioned = seed % 100 < 45;
    const competitorCount = Math.min(query.competitorNames.length, 2 + (seed % 2));

    const citations = Array.from({ length: brandMentioned ? 2 : 1 }, (_, i) => {
      const citationSeed = hash(`${seed}:citation:${i}`);
      const domain =
        citationSeed % 3 === 0
          ? "g2.com"
          : citationSeed % 3 === 1
            ? "reddit.com"
            : "zapier.com";
      return {
        url: `https://${domain}/articles/${citationSeed.toString(36)}`,
        domain,
        title: `Mock source ${citationSeed.toString(36)}`,
        type: (domain === "g2.com"
          ? "comparison"
          : domain === "reddit.com"
            ? "forum"
            : "blog") as VisibilityObservation["citations"][number]["type"],
      };
    });

    return {
      engine: query.engine,
      prompt: query.prompt,
      brandMentioned,
      position: brandMentioned ? 1 + (seed % 3) : undefined,
      sentiment: brandMentioned ? "neutral" : undefined,
      answerText: brandMentioned
        ? `[MOCK ${query.engine}] The answer mentions ${query.brandNames[0] ?? "the brand"} among the options.`
        : `[MOCK ${query.engine}] The answer does not mention the brand.`,
      confidence: brandMentioned ? 0.6 + (seed % 30) / 100 : 0.5,
      citations,
      competitors: query.competitorNames.slice(0, competitorCount).map((name, i) => ({
        name,
        mentioned: true,
        position: i + 1,
      })),
      observedAt: new Date(),
      mocked: true,
    };
  }
}

import {
  keywordOverviewResponseSchema,
  serpLiveRegularResponseSchema,
} from "@/lib/providers/dataforseo/schemas";
import {
  normalizeKeywordOverview,
  normalizeSerpLive,
} from "@/lib/providers/dataforseo/normalize";
import type {
  DataForSeoClient,
  KeywordOverviewParams,
  KeywordOverviewResult,
  SerpLiveParams,
  SerpLiveResult,
} from "@/lib/providers/dataforseo/types";

/**
 * Deterministic mock DataForSEO client.
 *
 * Every fixture is PROVIDER-SHAPED: it is parsed by the same Zod schemas and
 * normalized by the same functions as real responses, so the mock exercises
 * the entire pipeline (minus the network). Zero provider credits are spent.
 *
 * Determinism: all values derive from a stable hash of the keyword, so the
 * same request always yields the same numbers (no flicker between renders).
 *
 * Deliberate fixture triggers (used by tests/E2E to exercise honest states):
 * - a keyword containing `fixture-unknown` is OMITTED from keyword-overview
 *   results (simulates "provider does not know this keyword", unbilled);
 * - a keyword containing `fixture-absent` never places the tracked domain in
 *   the fixture SERP (simulates "domain absent from the SERP" → null rank).
 */

const MOCK_TASK_DATETIME = "2026-01-01 00:00:00 +00:00";
const FILLER_DOMAINS = [
  "reviewsite.example",
  "toplist.example",
  "vendorlist.example",
  "industry-week.example",
  "saas-report.example",
] as const;

/** djb2-style hash → stable 32-bit unsigned integer per input string. */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function slugifyKeyword(keyword: string): string {
  return (
    keyword
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "keyword"
  );
}

function stripWww(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

function buildKeywordOverviewRaw(
  keywords: string[],
  locationCode: number,
  languageCode: string
): unknown {
  const items = keywords
    .filter((keyword) => !keyword.includes("fixture-unknown"))
    .map((keyword) => {
      const hash = stableHash(keyword);
      const levels = ["LOW", "MEDIUM", "HIGH"] as const;
      const intents = ["informational", "commercial", "transactional", "navigational"] as const;
      return {
        se_type: "google",
        keyword,
        location_code: locationCode,
        language_code: languageCode,
        search_partners: false,
        keyword_info: {
          se_type: "google",
          last_updated_time: MOCK_TASK_DATETIME,
          competition: (hash % 100) / 100,
          competition_level: levels[hash % levels.length],
          cpc: Math.round((0.3 + (hash % 400) / 100) * 100) / 100,
          search_volume: 10 + (hash % 9000),
          search_volume_trend: {
            monthly: (hash % 41) - 20,
            quarterly: (hash % 61) - 30,
            yearly: (hash % 81) - 40,
          },
        },
        search_intent_info: {
          se_type: "google",
          main_intent: intents[hash % intents.length],
        },
      };
    });

  return {
    version: "0.1.mock",
    status_code: 20000,
    status_message: "Ok. Mock fixture.",
    time: "0.001 sec.",
    cost: null, // mock data implies NO provider spend
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: `mock-kw-${stableHash(keywords.join(",")).toString(16)}`,
        status_code: 20000,
        status_message: "Ok.",
        time: "0.001 sec.",
        cost: null,
        result_count: 1,
        result: [
          {
            se_type: "google",
            location_code: locationCode,
            language_code: languageCode,
            items_count: items.length,
            items,
          },
        ],
      },
    ],
  };
}

function buildSerpRaw(
  keyword: string,
  locationCode: number,
  languageCode: string,
  depth: number,
  hint: { trackedDomain?: string | null; competitors?: string[] } | undefined
): unknown {
  const hash = stableHash(keyword);
  const slug = slugifyKeyword(keyword);
  const tracked = hint?.trackedDomain ? stripWww(hint.trackedDomain) : null;
  const competitors = (hint?.competitors ?? [])
    .map(stripWww)
    .filter((domain): domain is string => Boolean(domain))
    .slice(0, 2);
  const absent = keyword.toLowerCase().includes("fixture-absent");

  // Assemble the organic list: competitors + fillers, then splice the tracked
  // domain into a deterministic position (or leave it out entirely). The list
  // always contains exactly 5 organic results.
  const organicDomains: string[] = [];
  organicDomains.push(...competitors);
  const trackedIncluded = Boolean(tracked) && !absent;
  const targetCount = 5 - (trackedIncluded ? 1 : 0);
  let fillerIndex = hash % FILLER_DOMAINS.length;
  while (organicDomains.length < targetCount) {
    const candidate = FILLER_DOMAINS[fillerIndex % FILLER_DOMAINS.length]!;
    if (!organicDomains.includes(candidate)) organicDomains.push(candidate);
    fillerIndex++;
  }
  if (tracked && trackedIncluded) {
    const position = hash % Math.min(3, organicDomains.length);
    organicDomains.splice(position, 0, tracked);
  }

  const snippetDomain = FILLER_DOMAINS[hash % FILLER_DOMAINS.length]!;
  const items: unknown[] = [
    {
      type: "featured_snippet",
      rank_group: 1,
      rank_absolute: 1,
      page: 1,
      domain: snippetDomain,
      title: `${keyword} — sample featured snippet`,
      description: "Sample featured snippet produced by the QuerySide mock client.",
      url: `https://${snippetDomain}/${slug}`,
      breadcrumb: null,
    },
  ];
  organicDomains.forEach((domain, index) => {
    items.push({
      type: "organic",
      rank_group: index + 1,
      rank_absolute: index + 2,
      page: 1,
      domain,
      title: `${keyword} — result on ${domain}`,
      description: `Sample organic result for the fixture keyword "${keyword}".`,
      url: `https://${domain}/${slug}`,
      breadcrumb: `https://${domain} › ${slug}`,
    });
  });
  items.push({
    type: "paid",
    rank_group: 1,
    rank_absolute: organicDomains.length + 2,
    page: 1,
    domain: "ads.example",
    title: `Ad — ${keyword}`,
    description: "Sample paid result produced by the QuerySide mock client.",
    url: `https://ads.example/${slug}`,
    breadcrumb: null,
  });

  return {
    version: "0.1.mock",
    status_code: 20000,
    status_message: "Ok. Mock fixture.",
    time: "0.001 sec.",
    cost: null, // mock data implies NO provider spend
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: `mock-serp-${hash.toString(16)}`,
        status_code: 20000,
        status_message: "Ok.",
        time: "0.001 sec.",
        cost: null,
        result_count: 1,
        result: [
          {
            keyword,
            type: "organic",
            se_domain: "google.com",
            location_code: locationCode,
            language_code: languageCode,
            check_url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
            datetime: MOCK_TASK_DATETIME,
            spell: null,
            item_types: ["featured_snippet", "organic", "paid", "ai_overview"],
            se_results_count: 1_000_000 + (hash % 5_000_000),
            pages_count: Math.max(1, Math.ceil(depth / 10)),
            items_count: items.length,
            items,
          },
        ],
      },
    ],
  };
}

export class MockDataForSeoClient implements DataForSeoClient {
  readonly mock = true;

  async keywordOverview(params: KeywordOverviewParams): Promise<KeywordOverviewResult> {
    const keywords = [...new Set(params.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    const raw = buildKeywordOverviewRaw(keywords, params.locationCode, params.languageCode);
    const parsed = keywordOverviewResponseSchema.parse(raw);
    const result = normalizeKeywordOverview(parsed, keywords);
    return { ...result, mocked: true };
  }

  async serpLiveRegular(params: SerpLiveParams): Promise<SerpLiveResult> {
    const depth = Math.min(10, Math.max(1, params.depth ?? 10));
    const raw = buildSerpRaw(
      params.keyword,
      params.locationCode,
      params.languageCode,
      depth,
      params.fixtureHint
    );
    const parsed = serpLiveRegularResponseSchema.parse(raw);
    const result = normalizeSerpLive(parsed, params.keyword);
    return { ...result, mocked: true };
  }
}

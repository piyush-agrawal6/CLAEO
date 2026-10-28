import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "@/lib/errors";
import {
  InMemoryRedisClient,
  cacheSet,
  getRedis,
  setRedisForTesting,
} from "@/lib/redis";
import {
  keywordOverviewCacheKey,
  serpLiveCacheKey,
} from "@/lib/providers/dataforseo/cache";
import { HttpDataForSeoClient } from "@/lib/providers/dataforseo/client";
import {
  estimateKeywordOverviewUsd,
  estimateSerpLiveRegularUsd,
} from "@/lib/providers/dataforseo/costs";
import { MockDataForSeoClient } from "@/lib/providers/dataforseo/mock";
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
import { setProviderDisabled, utcDayKey } from "@/lib/usage/guards";

/**
 * Unit tests for the DataForSEO provider layer.
 *
 * NOTHING here touches a real provider: the HTTP client is exercised against
 * a stubbed global fetch, and the mock client is pure. Zero spend by
 * construction — same guarantee the app relies on in development.
 */

function httpClient(): HttpDataForSeoClient {
  return new HttpDataForSeoClient({
    login: "test-login",
    password: "test-password",
    baseUrl: "https://api.dataforseo.test",
    timeoutMs: 5_000,
  });
}

const KEYWORD_OVERVIEW_OK = {
  version: "0.1.20241227",
  status_code: 20000,
  status_message: "Ok.",
  cost: 0.01212,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "task-1",
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.01212,
      result_count: 1,
      result: [
        {
          se_type: "google",
          location_code: 2840,
          language_code: "en",
          items_count: 1,
          items: [
            {
              se_type: "google",
              keyword: "crm",
              keyword_info: {
                search_volume: 12000,
                cpc: 6.45,
                competition: 0.8,
                competition_level: "HIGH",
                search_volume_trend: { monthly: 5, quarterly: -3, yearly: 12 },
              },
              search_intent_info: { main_intent: "commercial" },
            },
          ],
        },
      ],
    },
  ],
};

const SERP_OK = {
  version: "0.1.20200129",
  status_code: 20000,
  status_message: "Ok.",
  cost: 0.002,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "task-serp-1",
      status_code: 20000,
      cost: 0.002,
      result_count: 1,
      result: [
        {
          keyword: "crm",
          type: "organic",
          se_domain: "google.com",
          location_code: 2840,
          language_code: "en",
          datetime: "2026-01-01 00:00:00 +00:00",
          item_types: ["organic", "ai_overview"],
          se_results_count: 85600000,
          items: [
            {
              type: "organic",
              rank_group: 1,
              rank_absolute: 2,
              page: 1,
              domain: "www.acme.example",
              title: "Acme CRM",
              url: "https://www.acme.example/crm",
            },
          ],
        },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  setRedisForTesting(new InMemoryRedisClient());
});

afterEach(() => {
  vi.unstubAllGlobals();
  setRedisForTesting(null);
});

/* ------------------------------ normalization ----------------------------- */

describe("normalizeKeywordOverview", () => {
  it("maps provider items and reports omitted keywords", () => {
    const parsed = keywordOverviewResponseSchema.parse(KEYWORD_OVERVIEW_OK);
    const result = normalizeKeywordOverview(parsed, ["crm", "unknown kw"]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      keyword: "crm",
      searchVolume: 12000,
      cpc: 6.45,
      competition: 0.8,
      competitionLevel: "HIGH",
      trendMonthly: 5,
      trendQuarterly: -3,
      trendYearly: 12,
      intent: "commercial",
    });
    expect(result.omittedKeywords).toEqual(["unknown kw"]);
    expect(result.actualCostUsd).toBe(0.01212);
    expect(result.taskId).toBe("task-1");
    expect(result.mocked).toBe(false);
    expect(result.cacheHit).toBe(false);
  });

  it("keeps metrics null when the provider omits them (never fabricates)", () => {
    const parsed = keywordOverviewResponseSchema.parse({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [{ items: [{ keyword: "no data kw" }] }],
        },
      ],
    });
    const result = normalizeKeywordOverview(parsed, ["no data kw"]);
    expect(result.items[0]).toEqual({
      keyword: "no data kw",
      searchVolume: null,
      cpc: null,
      competition: null,
      competitionLevel: null,
      trendMonthly: null,
      trendQuarterly: null,
      trendYearly: null,
      intent: null,
    });
    expect(result.omittedKeywords).toEqual([]);
    expect(result.actualCostUsd).toBeNull();
  });
});

describe("normalizeSerpLive", () => {
  it("normalizes items, derives domain from URL, skips url-less rows", () => {
    const parsed = serpLiveRegularResponseSchema.parse({
      status_code: 20000,
      cost: 0.002,
      tasks: [
        {
          id: "s1",
          status_code: 20000,
          cost: 0.002,
          result: [
            {
              keyword: "kw",
              item_types: ["organic"],
              se_results_count: 12345,
              items: [
                {
                  type: "organic",
                  rank_group: 1,
                  rank_absolute: 3,
                  page: 1,
                  title: "T",
                  url: "https://www.Example.com/page",
                  domain: null,
                },
                { type: "organic" },
              ],
            },
          ],
        },
      ],
    });
    const result = normalizeSerpLive(parsed, "kw");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      rank: 1,
      absoluteRank: 3,
      page: 1,
      resultType: "organic",
      url: "https://www.Example.com/page",
      domain: "example.com",
      title: "T",
    });
    expect(result.seResultsCount).toBe(12345);
    expect(result.actualCostUsd).toBe(0.002);
    expect(result.taskId).toBe("s1");
  });
});

/* --------------------------- error classification -------------------------- */

describe("error classification", () => {
  it("treats success codes as success", () => {
    expect(classifyProviderStatus("op", 20000)).toBeNull();
    expect(classifyProviderStatus("op", 20001)).toBeNull();
    expect(classifyProviderStatus("op", undefined)).toBeNull();
    expect(classifyHttpStatus("op", 200)).toBeNull();
  });

  it("classifies provider status codes", () => {
    expect(classifyProviderStatus("op", 40100)?.errorClass).toBe("AUTHENTICATION");
    expect(classifyProviderStatus("op", 40200)?.errorClass).toBe("PROVIDER_QUOTA");
    const rate = classifyProviderStatus("op", 42900);
    expect(rate?.errorClass).toBe("RATE_LIMIT");
    expect(rate?.retryable).toBe(true);
    const internal = classifyProviderStatus("op", 50000);
    expect(internal?.retryable).toBe(true);
    const invalid = classifyProviderStatus("op", 40500);
    expect(invalid?.errorClass).toBe("PROVIDER_ERROR");
    expect(invalid?.retryable).toBe(false);
  });

  it("classifies HTTP statuses", () => {
    expect(classifyHttpStatus("op", 401)?.errorClass).toBe("AUTHENTICATION");
    expect(classifyHttpStatus("op", 429)?.retryable).toBe(true);
    expect(classifyHttpStatus("op", 503)?.retryable).toBe(true);
    expect(classifyHttpStatus("op", 400)?.retryable).toBe(false);
  });
});

/* --------------------------------- mock ----------------------------------- */

describe("MockDataForSeoClient", () => {
  it("is deterministic and never implies provider spend", async () => {
    const client = new MockDataForSeoClient();
    const params = { keywords: ["best crm"], locationCode: 2840, languageCode: "en" };
    const first = await client.keywordOverview(params);
    const second = await client.keywordOverview(params);

    expect(first.items).toEqual(second.items);
    expect(first.mocked).toBe(true);
    expect(first.cacheHit).toBe(false);
    expect(first.actualCostUsd).toBeNull(); // fixtures never claim cost
    expect(first.items[0]?.searchVolume).toBeGreaterThan(0);
  });

  it("omits fixture-unknown keywords like a provider with no data", async () => {
    const client = new MockDataForSeoClient();
    const result = await client.keywordOverview({
      keywords: ["fixture-unknown thing"],
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.items).toHaveLength(0);
    expect(result.omittedKeywords).toEqual(["fixture-unknown thing"]);
  });

  it("places the tracked domain and competitors in fixture SERPs", async () => {
    const client = new MockDataForSeoClient();
    const result = await client.serpLiveRegular({
      keyword: "best crm",
      locationCode: 2840,
      languageCode: "en",
      fixtureHint: { trackedDomain: "www.Acme.io", competitors: ["rival.example"] },
    });
    const domains = result.results.map((r) => r.domain);
    expect(domains).toContain("acme.io");
    expect(domains).toContain("rival.example");
    expect(result.itemTypes).toContain("organic");
    const organic = result.results.filter((r) => r.resultType === "organic");
    expect(organic.length).toBe(5);
    organic.forEach((row, index) => expect(row.rank).toBe(index + 1));
  });

  it("keeps the tracked domain absent for fixture-absent keywords", async () => {
    const client = new MockDataForSeoClient();
    const result = await client.serpLiveRegular({
      keyword: "fixture-absent query",
      locationCode: 2840,
      languageCode: "en",
      fixtureHint: { trackedDomain: "acme.io" },
    });
    expect(result.results.some((r) => r.domain === "acme.io")).toBe(false);
  });
});

/* ------------------------------- cache keys -------------------------------- */

describe("cache keys", () => {
  it("are keyword-order and case insensitive, and bind all billed params", () => {
    const a = keywordOverviewCacheKey({ locationCode: 2840, languageCode: "en", keywords: ["B", "a"] });
    const b = keywordOverviewCacheKey({ locationCode: 2840, languageCode: "en", keywords: ["a", "b", "a"] });
    expect(a).toBe(b);
    expect(a).not.toBe(
      keywordOverviewCacheKey({ locationCode: 2841, languageCode: "en", keywords: ["a", "b"] })
    );
    expect(a).not.toBe(
      keywordOverviewCacheKey({ locationCode: 2840, languageCode: "de", keywords: ["a", "b"] })
    );

    const s1 = serpLiveCacheKey({ keyword: " CRM ", locationCode: 2840, languageCode: "en", depth: 10 });
    const s2 = serpLiveCacheKey({ keyword: "crm", locationCode: 2840, languageCode: "en", depth: 10 });
    const s3 = serpLiveCacheKey({ keyword: "crm", locationCode: 2840, languageCode: "en", depth: 20 });
    expect(s1).toBe(s2);
    expect(s2).not.toBe(s3);
  });
});

/* ---------------------------------- costs --------------------------------- */

describe("cost estimates", () => {
  it("matches the official pricing model (task + per item / per SERP)", () => {
    expect(estimateKeywordOverviewUsd(1)).toBeCloseTo(0.01212, 5);
    expect(estimateKeywordOverviewUsd(10)).toBeCloseTo(0.0132, 5);
    expect(estimateSerpLiveRegularUsd(10)).toBe(0.002);
    expect(estimateSerpLiveRegularUsd(15)).toBe(0.004); // depth rounds up per 10
  });
});

/* ------------------------------ HTTP client -------------------------------- */

describe("HttpDataForSeoClient", () => {
  it("throws a configuration error without credentials", () => {
    expect(() => new HttpDataForSeoClient({ login: "", password: "" })).toThrow(/not configured/);
  });

  it("sends Basic auth, returns normalized data, and records usage", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(KEYWORD_OVERVIEW_OK));
    const client = httpClient();

    const result = await client.keywordOverview({
      keywords: ["crm"],
      locationCode: 2840,
      languageCode: "en",
      scanId: "scan-1",
      domainId: "domain-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.dataforseo.test/v3/dataforseo_labs/google/keyword_overview/live");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
    expect(headers.Authorization).not.toContain("test-password"); // sanity: base64 only

    expect(result.items[0]?.searchVolume).toBe(12000);
    expect(result.actualCostUsd).toBe(0.01212);
    expect(result.cacheHit).toBe(false);
    expect(result.mocked).toBe(false);

    // Guard counter incremented exactly once, spend counter tracks estimate.
    const counter = await getRedis().get(`usage:dataforseo_request:daily:${utcDayKey()}`);
    expect(counter).toBe(1);
    const spend = await getRedis().get<number>(`usage:spend:daily:${utcDayKey()}`);
    expect(spend).toBeCloseTo(estimateKeywordOverviewUsd(1), 5);
  });

  it("serves cached results without consuming guard budget", async () => {
    const key = keywordOverviewCacheKey({ locationCode: 2840, languageCode: "en", keywords: ["crm"] });
    await cacheSet(
      key,
      {
        items: [
          {
            keyword: "crm",
            searchVolume: 42,
            cpc: null,
            competition: null,
            competitionLevel: null,
            trendMonthly: null,
            trendQuarterly: null,
            trendYearly: null,
            intent: null,
          },
        ],
        omittedKeywords: [],
        actualCostUsd: 0.01212,
        taskId: "cached-task",
        cacheHit: false,
        mocked: false,
      },
      60
    );
    const fetchMock = stubFetch(async () => {
      throw new Error("fetch must not be called on a cache hit");
    });
    const client = httpClient();

    const result = await client.keywordOverview({
      keywords: ["CRM"], // normalization must hit the same key
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.cacheHit).toBe(true);
    expect(result.items[0]?.searchVolume).toBe(42);
    expect(fetchMock).not.toHaveBeenCalled();
    // No guard budget consumed: nothing was requested from the provider.
    expect(await getRedis().get(`usage:dataforseo_request:daily:${utcDayKey()}`)).toBeNull();
  });

  it("retries transient rate limits and then succeeds", async () => {
    let calls = 0;
    const fetchMock = stubFetch(async () => {
      calls++;
      if (calls < 3) {
        return new Response(JSON.stringify({ status_code: 42900, status_message: "Too many requests" }), {
          status: 429,
        });
      }
      return jsonResponse(SERP_OK);
    });
    const client = httpClient();

    const result = await client.serpLiveRegular({
      keyword: "crm",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("does NOT retry timeouts (double-charge protection)", async () => {
    const fetchMock = stubFetch(async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    const client = httpClient();

    const error = await client
      .serpLiveRegular({ keyword: "crm", locationCode: 2840, languageCode: "en" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataForSeoError);
    expect((error as DataForSeoError).errorClass).toBe("TIMEOUT");
    expect((error as DataForSeoError).retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The failed attempt is still recorded in the ledger counters.
    expect(await getRedis().get(`usage:dataforseo_request:daily:${utcDayKey()}`)).toBe(1);
  });

  it("classifies provider-level auth failures without retrying", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({ status_code: 40100, status_message: "Unauthorized" }, 200)
    );
    const client = httpClient();

    const error = await client
      .keywordOverview({ keywords: ["crm"], locationCode: 2840, languageCode: "en" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataForSeoError);
    expect((error as DataForSeoError).errorClass).toBe("AUTHENTICATION");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed provider payloads as BAD_RESPONSE", async () => {
    stubFetch(async () => jsonResponse({ unexpected: "shape" }, 200));
    const client = httpClient();

    const error = await client
      .keywordOverview({ keywords: ["crm"], locationCode: 2840, languageCode: "en" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataForSeoError);
    expect((error as DataForSeoError).errorClass).toBe("BAD_RESPONSE");
  });

  it("never requests a provider when the kill switch is on", async () => {
    await setProviderDisabled("dataforseo", true);
    const fetchMock = stubFetch(async () => jsonResponse(KEYWORD_OVERVIEW_OK));
    const client = httpClient();

    await expect(
      client.keywordOverview({ keywords: ["crm"], locationCode: 2840, languageCode: "en" })
    ).rejects.toThrow(QuotaExceededError);

    expect(fetchMock).not.toHaveBeenCalled();
    // A denied check is not an attempt: no ledger consumption either.
    expect(await getRedis().get(`usage:dataforseo_request:daily:${utcDayKey()}`)).toBeNull();
    await setProviderDisabled("dataforseo", false);
  });
});

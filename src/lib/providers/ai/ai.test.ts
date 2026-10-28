import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "@/lib/errors";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import {
  InMemoryRedisClient,
  getRedis,
  setRedisForTesting,
} from "@/lib/redis";
import {
  detectMention,
  domainMatches,
  extractUrlsFromAnswer,
} from "@/lib/providers/ai/mentions";
import { GeminiAdapter } from "@/lib/providers/ai/gemini";
import { GroqAdapter } from "@/lib/providers/ai/groq";
import { MockAiAdapter } from "@/lib/providers/ai/mock";
import { AiProviderError } from "@/lib/providers/ai/types";
import { listAiEngines, listScannableAiEngines } from "@/lib/providers/ai/registry";
import { setProviderDisabled, utcDayKey } from "@/lib/usage/guards";

/**
 * Phase 3B tests: mention/citation detection, real-adapter plumbing (against
 * a stubbed fetch — zero network), and engine-registry honesty.
 */

beforeEach(() => {
  setRedisForTesting(new InMemoryRedisClient());
});

afterEach(() => {
  vi.unstubAllGlobals();
  setRedisForTesting(null);
});

function stubFetch(impl: () => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/* ------------------------------ mention detection -------------------------- */

describe("detectMention", () => {
  it("matches brand-name variants with word boundaries", () => {
    const target = { brandNames: ["Acme Corp"] };
    expect(detectMention("We recommend Acme Corp for most teams.", target)).toMatchObject({
      mentioned: true,
      count: 1,
    });
    expect(detectMention("We recommend acme-corp and AcmeCorp today.", target).count).toBe(2);
    // Boundary safety: "acmecorpinc" is a different token and must NOT match.
    expect(detectMention("Only acmecorpinc is listed.", target).mentioned).toBe(false);
    expect(detectMention("Nothing relevant here.", target).mentioned).toBe(false);
  });

  it("matches the domain and its bare label, but not lookalikes", () => {
    const target = { domain: "acme.io" };
    expect(detectMention("See https://www.acme.io/pricing for details.", target).mentioned).toBe(true);
    expect(detectMention("Acme has great docs.", target).mentioned).toBe(true);
    expect(detectMention("Visit acmee.io or notacme.io instead.", {
      brandNames: ["Acme"],
    }).mentioned).toBe(false);
  });

  it("never counts hostname fragments or lowercase prose as a bare-label mention", () => {
    // "example" inside another host is a URL fragment, not a brand reference.
    expect(
      detectMention("A roundup at https://industry-week.example/reviews covers it.", {
        domain: "example.com",
      }).mentioned
    ).toBe(false);
    // The literal phrase "for example" must never fabricate a brand mention.
    expect(
      detectMention("Most teams, for example, prefer weekly reviews.", {
        domain: "example.com",
      }).mentioned
    ).toBe(false);
    // Capitalized proper-noun usage still counts (the intended label signal).
    expect(detectMention("Example Corp ships fast.", { domain: "example.com" }).mentioned).toBe(true);
    // The full domain itself is always counted, wherever it appears.
    expect(detectMention("See example.com for details.", { domain: "example.com" }).mentioned).toBe(
      true
    );
    expect(
      detectMention("See example.com for details.", { domain: "example.com" }).count
    ).toBe(1); // full domain only — no double count from the label pattern
  });

  it("counts every occurrence and returns evidence context", () => {
    const result = detectMention("Acme is good. Acme is great. Others lag.", {
      brandNames: ["Acme"],
    });
    expect(result.count).toBe(2);
    expect(result.context).toContain("Acme");
    expect(result.context!.length).toBeLessThanOrEqual(240);
  });

  it("handles empty text", () => {
    expect(detectMention("", { brandNames: ["Acme"], domain: "acme.io" })).toEqual({
      mentioned: false,
      count: 0,
      context: null,
    });
  });
});

describe("extractUrlsFromAnswer", () => {
  it("extracts, normalizes, dedupes and caps URLs", () => {
    const text =
      "See https://acme.io/guide, https://www.acme.io/guide (dup), and https://other.example/x. " +
      "Also https://trailing.example/path. Then (https://parens.example/a).";
    const urls = extractUrlsFromAnswer(text, 10);
    const domains = urls.map((u) => u.domain);
    expect(domains).toContain("acme.io");
    expect(domains).toContain("other.example");
    expect(domains.filter((d) => d === "acme.io")).toHaveLength(1); // www deduped by domain view
    expect(urls.find((u) => u.domain === "trailing.example")?.url).toBe("https://trailing.example/path");
    expect(urls.find((u) => u.domain === "parens.example")?.url).toBe("https://parens.example/a");
    expect(extractUrlsFromAnswer("no links at all")).toEqual([]);
  });
});

describe("domainMatches", () => {
  it("matches subdomains but not lookalike domains", () => {
    expect(domainMatches("www.acme.io", "acme.io")).toBe(true);
    expect(domainMatches("blog.acme.io", "acme.io")).toBe(true);
    expect(domainMatches("acme.io", "acme.io")).toBe(true);
    expect(domainMatches("notacme.io", "acme.io")).toBe(false);
    expect(domainMatches("acme.io.evil.com", "acme.io")).toBe(false);
  });
});

/* ------------------------------ real adapters ------------------------------ */

const GEMINI_OK = {
  candidates: [
    {
      content: { parts: [{ text: "A neutral answer with no brand." }], role: "model" },
      modelVersion: "gemini-2.0-flash-001",
    },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
};

describe("GeminiAdapter", () => {
  function adapter(): GeminiAdapter {
    return new GeminiAdapter({ apiKey: "test-key", model: "gemini-2.0-flash", timeoutMs: 5_000 });
  }

  it("parses answers, records usage, and never injects brand context", async () => {
    const fetchMock = stubFetch(async () => new Response(JSON.stringify(GEMINI_OK), { status: 200 }));

    const answer = await adapter().ask({ prompt: "What is a good CRM?" });

    expect(answer.answerText).toBe("A neutral answer with no brand.");
    expect(answer.model).toBe("gemini-2.0-flash-001");
    expect(answer.tokenUsage).toEqual({ input: 12, output: 34 });
    expect(answer.mocked).toBe(false);
    expect(answer.actualCostUsd).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("models/gemini-2.0-flash:generateContent");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    // The body must contain ONLY the tracked prompt — no brand/domain hints.
    const body = JSON.parse(init.body as string) as { contents: Array<{ parts: Array<{ text: string }> }> };
    expect(body.contents[0]!.parts[0]!.text).toBe("What is a good CRM?");

    expect(await getRedis().get(`usage:llm_request:daily:${utcDayKey()}`)).toBe(1);
  });

  it("retries rate limits once, then succeeds", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
      }
      return new Response(JSON.stringify(GEMINI_OK), { status: 200 });
    });

    const answer = await adapter().ask({ prompt: "q" });
    expect(calls).toBe(2);
    expect(answer.answerText.length).toBeGreaterThan(0);
  });

  it("classifies auth failures without retrying", async () => {
    const fetchMock = stubFetch(async () =>
      new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 401 })
    );
    const error = await adapter()
      .ask({ prompt: "q" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).errorClass).toBe("AUTHENTICATION");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Failed attempts still consume guard counters (recorded as failures).
    expect(await getRedis().get(`usage:llm_request:daily:${utcDayKey()}`)).toBe(1);
  });

  it("rejects responses with no answer text as BAD_RESPONSE", async () => {
    stubFetch(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const error = await adapter()
      .ask({ prompt: "q" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).errorClass).toBe("BAD_RESPONSE");
  });

  it("never calls the provider when the gemini kill switch is on", async () => {
    await setProviderDisabled("gemini", true);
    const fetchMock = stubFetch(async () => new Response(JSON.stringify(GEMINI_OK), { status: 200 }));

    await expect(adapter().ask({ prompt: "q" })).rejects.toThrow(QuotaExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
    await setProviderDisabled("gemini", false);
  });
});

describe("GroqAdapter", () => {
  it("parses OpenAI-compatible responses", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          model: "llama-3.3-70b-versatile",
          choices: [{ message: { role: "assistant", content: "Open-model answer." } }],
          usage: { prompt_tokens: 9, completion_tokens: 11 },
        }),
        { status: 200 }
      )
    );

    const answer = await new GroqAdapter({ apiKey: "k", model: "llama-3.3-70b-versatile" }).ask({
      prompt: "q",
    });
    expect(answer.answerText).toBe("Open-model answer.");
    expect(answer.model).toBe("llama-3.3-70b-versatile");
    expect(answer.tokenUsage).toEqual({ input: 9, output: 11 });
    expect(await getRedis().get(`usage:llm_request:daily:${utcDayKey()}`)).toBe(1);
  });
});

/* --------------------------------- mock ----------------------------------- */

describe("MockAiAdapter", () => {
  it("is deterministic and couples the owned-site link to the brand mention", async () => {
    const adapter = new MockAiAdapter("gemini");
    const request = {
      prompt: "best crm?",
      fixtureHint: { brandName: "Acme", domain: "acme.io", competitors: ["Rival"] },
    };
    const first = await adapter.ask(request);
    const second = await adapter.ask(request);

    expect(first.answerText).toBe(second.answerText);
    expect(first.mocked).toBe(true);

    // Invariant: the owned domain is linked exactly when the brand is
    // discussed (so mention detection and evidence never contradict).
    const mention = detectMention(first.answerText, { brandNames: ["Acme"], domain: "acme.io" });
    const domains = extractUrlsFromAnswer(first.answerText).map((u) => u.domain);
    expect(domains.includes("acme.io")).toBe(mention.mentioned);
  });

  it("never mentions the brand for fixture-nobrand prompts", async () => {
    const adapter = new MockAiAdapter("llama", "groq");
    const answer = await adapter.ask({
      prompt: "fixture-nobrand: what is a crm?",
      fixtureHint: { brandName: "Acme", domain: "acme.io" },
    });
    const mention = detectMention(answer.answerText, { brandNames: ["Acme"], domain: "acme.io" });
    expect(mention.mentioned).toBe(false);
  });
});

/* -------------------------------- registry -------------------------------- */

describe("engine registry", () => {
  let testDb: TestDb | null = null;

  beforeEach(async () => {
    testDb = await setupTestDb();
  });

  afterEach(async () => {
    await testDb?.close();
    testDb = null;
  });

  it("resolves engines honestly: real adapters mocked in test env, planned stays planned", async () => {
    const engines = await listAiEngines();
    expect(engines.length).toBeGreaterThanOrEqual(7);
    const byKey = new Map(engines.map((e) => [e.key, e]));

    // In mock/test env the two real-capable engines run as labeled mocks.
    expect(byKey.get("gemini")?.status).toBe("mock");
    expect(byKey.get("gemini")?.adapter).toBeInstanceOf(MockAiAdapter);
    expect(byKey.get("llama")?.status).toBe("mock");
    expect(byKey.get("llama")?.adapter).toBeInstanceOf(MockAiAdapter);

    // Planned engines are unavailable with an honest reason — never scannable.
    for (const key of ["chatgpt", "perplexity", "claude", "copilot", "google_ai_mode"] as const) {
      const engine = byKey.get(key);
      expect(engine?.status).toBe("unavailable");
      expect(engine?.unavailableReason).toBe("planned");
      expect(engine?.adapter).toBeNull();
    }
  });

  it("caps scannable engines at the requested limit, primary first", async () => {
    const one = await listScannableAiEngines(1);
    expect(one).toHaveLength(1);
    expect(one[0]?.key).toBe("gemini"); // AI_PRIMARY_PROVIDER=gemini

    const two = await listScannableAiEngines(2);
    expect(two.map((e) => e.key)).toEqual(["gemini", "llama"]);

    const zero = await listScannableAiEngines(0);
    expect(zero).toHaveLength(0);
  });
});

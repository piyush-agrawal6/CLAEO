import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AIService, getAIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";
import {
  AIResponseFormatError,
  type AIProvider,
  type GenerateStructuredParams,
} from "@/lib/ai/types";
import { extractJsonPayload, parseJsonLenient } from "@/lib/ai/provider-helpers";

const schema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
});
type Result = z.infer<typeof schema>;

function params(overrides: Partial<GenerateStructuredParams<Result>> = {}) {
  return {
    label: "test_structured",
    prompt: "Analyze this",
    schema,
    mockFactory: () => ({ score: 42, summary: "deterministic" }),
    ...overrides,
  } as GenerateStructuredParams<Result>;
}

describe("AIService with mock provider", () => {
  it("returns validated data labeled as mocked", async () => {
    const provider = new MockAIProvider();
    const service = new AIService({ primary: provider });

    const result = await service.generateStructured(params());
    expect(result.data).toEqual({ score: 42, summary: "deterministic" });
    expect(result.mocked).toBe(true);
    expect(result.provider).toBe("mock");
  });

  it("fails loudly when no mockFactory fixture exists (never fabricates)", async () => {
    const service = new AIService({ primary: new MockAIProvider() });
    await expect(
      service.generateStructured(params({ mockFactory: undefined }))
    ).rejects.toThrow(/mockFactory/);
  });

  it("rejects mockFactory output that violates the schema", async () => {
    const service = new AIService({ primary: new MockAIProvider() });
    await expect(
      service.generateStructured(
        params({
          // Type-valid but out of schema range — must fail Zod validation.
          mockFactory: () => ({ score: 999, summary: "out of range" }),
        })
      )
    ).rejects.toBeInstanceOf(AIResponseFormatError);
  });

  it("retries once on a format error and succeeds", async () => {
    const provider = new MockAIProvider();
    provider.failureInjection.set("test_structured", 1);
    const service = new AIService({ primary: provider });

    const result = await service.generateStructured(params());
    expect(result.data.score).toBe(42);
    expect(provider.failureInjection.get("test_structured")).toBe(0);
  });

  it("falls back to the secondary provider after persistent format errors", async () => {
    const primary = new MockAIProvider();
    // Primary is permanently malformed — only the fallback can answer.
    primary.failureInjection.set("test_structured", 99);

    const fallback: AIProvider = {
      id: "groq",
      model: "fallback-model",
      isAvailable: () => true,
      generateStructured: async (p) => ({
        data: p.schema.parse(p.mockFactory?.()),
        provider: "groq",
        model: "fallback-model",
        mocked: false,
      }),
      classify: async (p) => ({
        label: p.labels[0] ?? "unknown",
        provider: "groq",
        mocked: false,
      }),
      analyze: async (p) => ({
        text: p.mockFactory?.() ?? "",
        provider: "groq",
        mocked: false,
      }),
    };

    const service = new AIService({ primary, fallback });
    const result = await service.generateStructured(params());

    expect(result.provider).toBe("groq");
    expect(result.data.score).toBe(42);
    // The primary consumed both of its attempts before the switch.
    expect(primary.failureInjection.get("test_structured")).toBe(97);
  });

  it("throws after both providers are exhausted", async () => {
    const primary = new MockAIProvider();
    const fallback = new MockAIProvider();
    primary.failureInjection.set("test_structured", 99);
    fallback.failureInjection.set("test_structured", 99);
    const service = new AIService({ primary, fallback });

    await expect(service.generateStructured(params())).rejects.toBeInstanceOf(
      AIResponseFormatError
    );
  });

  it("classify validates labels from the fixture", async () => {
    const service = new AIService({ primary: new MockAIProvider() });

    const ok = await service.classify({
      label: "test_classify",
      prompt: "p",
      labels: ["brand", "product"] as const,
      mockFactory: () => "brand",
    });
    expect(ok.label).toBe("brand");
    expect(ok.mocked).toBe(true);

    await expect(
      service.classify({
        label: "test_classify_bad",
        prompt: "p",
        labels: ["brand"] as const,
        mockFactory: () => "not-allowed",
      })
    ).rejects.toBeInstanceOf(AIResponseFormatError);
  });

  it("analyze returns fixture text labeled as mocked", async () => {
    const service = new AIService({ primary: new MockAIProvider() });
    const result = await service.analyze({
      label: "test_analyze",
      prompt: "p",
      mockFactory: () => "analysis text",
    });
    expect(result.text).toBe("analysis text");
    expect(result.mocked).toBe(true);
  });
});

describe("getAIService factory", () => {
  it("resolves the mock provider in test/mock mode", () => {
    const service = getAIService("ws_1");
    expect(service.primary.id).toBe("mock");
  });

  it("creates workspace-scoped instances", () => {
    const a = getAIService("ws_a");
    const b = getAIService("ws_b");
    expect(a).not.toBe(b);
    expect(a.primary.id).toBe("mock");
  });
});

describe("JSON extraction helpers", () => {
  it("extracts JSON from markdown fences", () => {
    expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts the first balanced object from noisy text", () => {
    expect(extractJsonPayload('Here is the answer: {"a":1,"b":[2]} done')).toBe(
      '{"a":1,"b":[2]}'
    );
  });

  it("parses leniently and reports invalid JSON as a format error", () => {
    expect(parseJsonLenient('{"ok":true}')).toEqual({ ok: true });
    expect(() => parseJsonLenient("not json at all")).toThrow(
      AIResponseFormatError
    );
  });
});

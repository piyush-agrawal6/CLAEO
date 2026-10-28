import { describe, expect, it } from "vitest";
import {
  businessProfileSuggestionSchema,
  classifyIndustry,
  deriveBusinessProfile,
  deriveCompetitorAssist,
  deriveQuerySuggestions,
  extractKeywords,
  inferBusinessProfile,
  inferCompetitorAssist,
  inferQuerySuggestions,
  querySuggestionsSchema,
} from "@/server/services/discovery/inference";

const EVIDENCE = {
  normalizedDomain: "acme-analytics.com",
  pages: [
    {
      url: "https://acme-analytics.com/",
      title: "Acme Analytics — Product analytics for teams",
      metaDescription: "Acme Analytics helps product teams understand their users with fast dashboards.",
      text:
        "Acme Analytics is a software platform for product analytics. " +
        "Product teams use our analytics dashboard to understand user behavior. " +
        "Analytics software with integrations and workflow automation.",
    },
  ],
};

describe("extractKeywords", () => {
  it("ranks by frequency, filters stopwords/numbers, and is deterministic", () => {
    const text = "analytics dashboard analytics software analytics the and for 123";
    expect(extractKeywords(text)).toEqual(["analytics", "dashboard", "software"]);
    expect(extractKeywords(text)).toEqual(extractKeywords(text));
  });
});

describe("classifyIndustry", () => {
  it("classifies from keyword evidence and falls back to other", () => {
    expect(classifyIndustry(["software", "platform", "analytics"])).toBe("software");
    expect(classifyIndustry(["clinic", "patient", "dental"])).toBe("healthcare");
    expect(classifyIndustry([])).toBe("other");
    expect(classifyIndustry(["purple", "elephant"])).toBe("other");
  });
});

describe("deriveBusinessProfile", () => {
  it("derives a schema-valid profile grounded in the crawl evidence", () => {
    const suggestion = deriveBusinessProfile(EVIDENCE);
    expect(() => businessProfileSuggestionSchema.parse(suggestion)).not.toThrow();
    expect(suggestion.name).toBe("Acme Analytics");
    expect(suggestion.tagline).toContain("Acme Analytics helps product teams");
    expect(suggestion.industry).toBe("software");
    expect(suggestion.keywords).toContain("analytics");
    expect(suggestion.audience).toBeTruthy();
  });

  it("stays honest on empty evidence (no invention)", () => {
    const suggestion = deriveBusinessProfile({
      normalizedDomain: "bare-domain.example",
      pages: [],
    });
    expect(suggestion.name).toBe("Bare-domain"); // fallback display name
    expect(suggestion.tagline).toBeNull();
    expect(suggestion.description).toBeNull();
    expect(suggestion.audience).toBeNull();
    expect(suggestion.products).toEqual([]);
    expect(suggestion.keywords).toEqual([]);
    expect(suggestion.industry).toBe("other");
  });
});

describe("deriveQuerySuggestions", () => {
  const suggestions = deriveQuerySuggestions({
    brand: "Acme Analytics",
    industry: "software",
    keywords: ["analytics", "dashboard", "software", "integrations", "workflow"],
  });

  it("produces schema-valid suggestions with balanced intents", () => {
    expect(() => querySuggestionsSchema.parse(suggestions)).not.toThrow();
    expect(suggestions.queries.length).toBeGreaterThan(0);
    expect(suggestions.queries.length).toBeLessThanOrEqual(12);
    const priorities = new Set(suggestions.queries.map((query) => query.priority));
    expect(priorities.has("HIGH")).toBe(true);
    expect(priorities.has("MEDIUM")).toBe(true);
    expect(priorities.has("LOW")).toBe(true);
    // Brand query first.
    expect(suggestions.queries[0]?.text).toBe("Acme Analytics review");
    expect(suggestions.queries[0]?.intent).toBe("brand");
  });

  it("NEVER emits fabricated metric fields or values", () => {
    const serialized = JSON.stringify(suggestions);
    expect(serialized).not.toMatch(/volume|cpc|cost per|traffic|difficulty|searches per month/i);
    for (const query of suggestions.queries) {
      expect(Object.keys(query).sort()).toEqual([
        "funnelStage",
        "intent",
        "priority",
        "rationale",
        "text",
      ]);
    }
  });

  it("returns nothing rather than guessing when there is no evidence", () => {
    const empty = deriveQuerySuggestions({ brand: "", industry: "other", keywords: [] });
    expect(empty.queries).toEqual([]);
  });
});

describe("deriveCompetitorAssist", () => {
  it("suggests search queries and categories — never company names", () => {
    const assist = deriveCompetitorAssist({
      industry: "software",
      keywords: ["analytics", "dashboard"],
    });
    expect(assist.discoveryQueries).toContain("best analytics companies");
    expect(assist.discoveryQueries).toContain("dashboard comparison");
    expect(assist.categoryHints.length).toBeGreaterThan(0);
    // Every discovery entry is a templated query built from OUR keywords —
    // no invented entities.
    for (const query of assist.discoveryQueries) {
      expect(query).toMatch(/(analytics|dashboard)/);
      expect(query).toMatch(/(companies|comparison)/);
    }
  });

  it("degrades to an empty list without keywords", () => {
    const assist = deriveCompetitorAssist({ industry: "other", keywords: [] });
    expect(assist.discoveryQueries).toEqual([]);
    expect(assist.categoryHints.length).toBeGreaterThan(0); // still helpful categories
  });
});

describe("service wrappers (mocked AIService)", () => {
  it("inferBusinessProfile returns mocked, schema-validated data", async () => {
    const result = await inferBusinessProfile("ws-inference-test", EVIDENCE);
    expect(result.mocked).toBe(true);
    expect(() => businessProfileSuggestionSchema.parse(result.data)).not.toThrow();
    expect(result.data.name).toBe("Acme Analytics");
  });

  it("inferQuerySuggestions returns mocked, schema-validated data", async () => {
    const result = await inferQuerySuggestions("ws-inference-test", {
      brand: "Acme Analytics",
      industry: "software",
      keywords: ["analytics"],
    });
    expect(result.mocked).toBe(true);
    expect(() => querySuggestionsSchema.parse(result.data)).not.toThrow();
  });

  it("inferCompetitorAssist returns mocked, schema-validated data", async () => {
    const result = await inferCompetitorAssist("ws-inference-test", {
      industry: "software",
      keywords: ["analytics"],
    });
    expect(result.mocked).toBe(true);
    expect(Array.isArray(result.data.discoveryQueries)).toBe(true);
  });
});

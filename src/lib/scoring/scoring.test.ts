import { describe, expect, it } from "vitest";
import {
  AI_VISIBILITY_FORMULA_VERSION,
  computeAiVisibilityScore,
  computeCitationShare,
  computeShareOfVoice,
} from "@/lib/scoring/ai";
import {
  GOOGLE_VISIBILITY_FORMULA_VERSION,
  computeGoogleVisibilityScore,
  keywordPoints,
} from "@/lib/scoring/google";

describe("google visibility scoring (google_visibility_v1)", () => {
  it("maps ranks to tiered points and absence to zero", () => {
    expect(keywordPoints(1)).toBe(100);
    expect(keywordPoints(3)).toBe(70);
    expect(keywordPoints(10)).toBe(10);
    expect(keywordPoints(15)).toBe(5); // beyond page one
    expect(keywordPoints(null)).toBe(0); // absent from the SERP
    expect(keywordPoints(undefined)).toBe(0);
    expect(keywordPoints(0)).toBe(0);
  });

  it("averages points over keywords with data (absent counts as 0)", () => {
    const result = computeGoogleVisibilityScore({ ranks: [1, 5, null], coverageExpected: 3 });
    expect(result.score).toBe(Math.round(((100 + 45 + 0) / 3) * 10) / 10);
    expect(result.formulaVersion).toBe(GOOGLE_VISIBILITY_FORMULA_VERSION);
    expect(result.coverageCompleted).toBe(3);
    expect(result.coverageExpected).toBe(3);
  });

  it("returns null (not enough data) when no keyword had SERP data", () => {
    const result = computeGoogleVisibilityScore({ ranks: [], coverageExpected: 5 });
    expect(result.score).toBeNull();
    expect(result.coverageCompleted).toBe(0);
    expect(result.coverageExpected).toBe(5);
  });
});

describe("ai visibility scoring (ai_visibility_v1)", () => {
  it("scores mention rate over valid observations only", () => {
    const result = computeAiVisibilityScore({
      observations: [{ mentioned: true }, { mentioned: false }, { mentioned: true }],
      coverageExpected: 3,
    });
    expect(result.score).toBe(66.7);
    expect(result.formulaVersion).toBe(AI_VISIBILITY_FORMULA_VERSION);
    expect(result.coverageCompleted).toBe(3);
  });

  it("excludes failed observations from the denominator (caller passes none)", () => {
    // 4 planned observations, 2 failed → only the 2 valid ones are passed in.
    const result = computeAiVisibilityScore({
      observations: [{ mentioned: true }, { mentioned: false }],
      coverageExpected: 4,
    });
    expect(result.score).toBe(50);
    expect(result.coverageExpected).toBe(4);
    expect(result.coverageCompleted).toBe(2);
  });

  it("returns null when nothing is valid", () => {
    const result = computeAiVisibilityScore({ observations: [], coverageExpected: 4 });
    expect(result.score).toBeNull();
    expect(result.coverageCompleted).toBe(0);
  });
});

describe("share of voice", () => {
  it("computes brand share against competitor mentions", () => {
    expect(computeShareOfVoice(3, 1).share).toBe(0.75);
    expect(computeShareOfVoice(0, 2).share).toBe(0);
  });

  it("returns null (not enough data) instead of 0 when nobody is mentioned", () => {
    const result = computeShareOfVoice(0, 0);
    expect(result.share).toBeNull();
  });
});

describe("citation share (provider citations only)", () => {
  it("computes owned share of genuine provider citations", () => {
    const result = computeCitationShare({
      providerCitations: [
        { isOwnedDomain: true, isCompetitorDomain: false },
        { isOwnedDomain: false, isCompetitorDomain: true },
        { isOwnedDomain: false, isCompetitorDomain: false },
      ],
    });
    expect(result.providerCitationCount).toBe(3);
    expect(result.ownedCitationCount).toBe(1);
    expect(result.competitorCitationCount).toBe(1);
    expect(result.share).toBeCloseTo(0.333, 3);
  });

  it("returns null (no provider citations) instead of 0", () => {
    const result = computeCitationShare({ providerCitations: [] });
    expect(result.share).toBeNull();
    expect(result.providerCitationCount).toBe(0);
  });
});

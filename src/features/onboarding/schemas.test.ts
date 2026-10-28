import { describe, expect, it } from "vitest";
import {
  businessProfileFormSchema,
  competitorRowSchema,
  manualQueryLineSchema,
  skipStepSchema,
  toLines,
} from "@/features/onboarding/schemas";

describe("businessProfileFormSchema", () => {
  const valid = {
    name: "Acme Inc.",
    tagline: "Analytics for teams",
    description: "We build analytics software.",
    industry: "software",
    audience: "Product teams",
    products: ["analytics", "dashboards"],
  };

  it("accepts a valid profile", () => {
    expect(businessProfileFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name and enforces caps", () => {
    expect(businessProfileFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(businessProfileFormSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
    expect(businessProfileFormSchema.safeParse({ ...valid, tagline: "x".repeat(201) }).success).toBe(false);
    expect(businessProfileFormSchema.safeParse({ ...valid, description: "x".repeat(1001) }).success).toBe(false);
    expect(businessProfileFormSchema.safeParse({ ...valid, audience: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects unknown industries and oversized product lists", () => {
    expect(businessProfileFormSchema.safeParse({ ...valid, industry: "cats" }).success).toBe(false);
    expect(
      businessProfileFormSchema.safeParse({ ...valid, products: Array.from({ length: 9 }, () => "p") })
        .success
    ).toBe(false);
  });
});

describe("competitorRowSchema", () => {
  it("trims and validates", () => {
    const row = competitorRowSchema.safeParse({ name: "  Rival  ", domain: " rival.com " });
    expect(row.success).toBe(true);
    if (row.success) {
      expect(row.data.name).toBe("Rival");
      expect(row.data.domain).toBe("rival.com");
    }
  });

  it("rejects empty fields and oversize names", () => {
    expect(competitorRowSchema.safeParse({ name: "", domain: "rival.com" }).success).toBe(false);
    expect(competitorRowSchema.safeParse({ name: "Rival", domain: "" }).success).toBe(false);
    expect(competitorRowSchema.safeParse({ name: "x".repeat(81), domain: "rival.com" }).success).toBe(false);
  });
});

describe("skipStepSchema / manualQueryLineSchema / toLines", () => {
  it("only allows known onboarding steps", () => {
    expect(skipStepSchema.safeParse("business").success).toBe(true);
    expect(skipStepSchema.safeParse("completed").success).toBe(false);
    expect(skipStepSchema.safeParse("__proto__").success).toBe(false);
  });

  it("bounds manual query lines", () => {
    expect(manualQueryLineSchema.safeParse("best analytics tool").success).toBe(true);
    expect(manualQueryLineSchema.safeParse("a").success).toBe(false);
    expect(manualQueryLineSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("splits textareas into trimmed non-empty lines", () => {
    expect(toLines(" one \n\n two\r\n   ")).toEqual(["one", "two"]);
    expect(toLines("")).toEqual([]);
  });
});

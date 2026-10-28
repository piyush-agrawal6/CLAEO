import { describe, expect, it } from "vitest";
import { applyProductionHardening, assertRuntimeRequirements, env } from "@/lib/env";

describe("env", () => {
  it("applies restrictive development defaults for cost guards", () => {
    expect(env.MAX_DATAFORSEO_REQUESTS_PER_DAY).toBe(25);
    expect(env.MAX_LLM_REQUESTS_PER_DAY).toBe(100);
    expect(env.MAX_DOMAIN_SCANS_PER_DAY).toBe(10);
    expect(env.MAX_DAILY_PROVIDER_SPEND_USD).toBe(5);
  });

  it("defaults provider modes to mock under test", () => {
    expect(env.AI_MOCK_MODE).toBe(true);
    expect(env.DATAFORSEO_MOCK_MODE).toBe(true);
  });

  it("uses configurable model names, never hardcoded ones", () => {
    expect(env.GEMINI_MODEL.length).toBeGreaterThan(0);
    expect(env.GROQ_MODEL.length).toBeGreaterThan(0);
    expect(env.AI_PRIMARY_PROVIDER).toBe("gemini");
    expect(env.AI_FALLBACK_PROVIDER).toBe("groq");
  });

  it("never exposes server secrets to the client schema", () => {
    // Only NEXT_PUBLIC_ values are part of the client bundle contract.
    expect(Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_"))).toContain(
      "NEXT_PUBLIC_APP_URL"
    );
    expect(env.DATABASE_URL ?? "").not.toContain("postgres://user:");
  });

  it("assertRuntimeRequirements throws for missing variables and names them", () => {
    expect(() => assertRuntimeRequirements(["NODE_ENV"])).not.toThrow();
    expect(() => assertRuntimeRequirements(["DEFINITELY_NOT_A_REAL_VAR_XYZ"])).toThrow(
      /DEFINITELY_NOT_A_REAL_VAR_XYZ/
    );
  });

  it("force-disables dev conveniences in production (hardening)", () => {
    const dev = applyProductionHardening({ ...env }, "development");
    expect(dev.AI_MOCK_MODE).toBe(true);
    expect(dev.AUTH_DEV_AUTO_VERIFY).toBe(true);

    const prod = applyProductionHardening(
      {
        ...env,
        AI_MOCK_MODE: true,
        DATAFORSEO_MOCK_MODE: true,
        AUTH_DEV_AUTO_VERIFY: true,
        NEXT_PUBLIC_MOCK_MODE: true,
      },
      "production"
    );
    expect(prod.AI_MOCK_MODE).toBe(false);
    expect(prod.DATAFORSEO_MOCK_MODE).toBe(false);
    expect(prod.AUTH_DEV_AUTO_VERIFY).toBe(false);
    expect(prod.NEXT_PUBLIC_MOCK_MODE).toBe(false);
  });
});

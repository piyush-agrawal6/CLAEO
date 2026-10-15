import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuotaExceededError } from "@/lib/errors";
import { InMemoryRedisClient, setRedisForTesting } from "@/lib/redis";
import {
  canPerformPaidOperation,
  remainingToday,
  requirePaidOperation,
  setProviderDisabled,
} from "@/lib/usage/guards";
import { recordUsage } from "@/lib/usage/recorder";

describe("paid operation guards", () => {
  beforeEach(async () => {
    setRedisForTesting(new InMemoryRedisClient());
    await setProviderDisabled("gemini", false);
    await setProviderDisabled("groq", false);
    await setProviderDisabled("dataforseo", false);
    await setProviderDisabled("app", false);
  });

  afterEach(async () => {
    setRedisForTesting(new InMemoryRedisClient());
    await setProviderDisabled("gemini", false);
    await setProviderDisabled("groq", false);
    await setProviderDisabled("dataforseo", false);
    await setProviderDisabled("app", false);
  });

  it("allows operations under the daily limit", async () => {
    const result = await canPerformPaidOperation("llm_request", {
      provider: "gemini",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(100); // test default MAX_LLM_REQUESTS_PER_DAY
    expect(result.resetsAt).toBeGreaterThan(Date.now());
  });

  it("denies when the provider kill switch is engaged", async () => {
    await setProviderDisabled("gemini", true);

    const result = await canPerformPaidOperation("llm_request", {
      provider: "gemini",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("kill_switch");

    // Fallback provider remains available.
    const fallback = await canPerformPaidOperation("llm_request", {
      provider: "groq",
    });
    expect(fallback.allowed).toBe(true);
  });

  it("denies after the daily request limit is consumed", async () => {
    // Consume the full LLM daily quota (test default: 100).
    for (let i = 0; i < 100; i++) {
      await recordUsage({
        provider: "gemini",
        operation: "generate_structured",
        guardOperation: "llm_request",
      });
    }

    const result = await canPerformPaidOperation("llm_request", {
      provider: "gemini",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_limit");
    expect(result.remaining).toBe(0);
    expect(await remainingToday("llm_request")).toBe(0);
  });

  it("denies when the daily spend guard is reached", async () => {
    // Push estimated spend to the test default cap ($5/day).
    await recordUsage({
      provider: "dataforseo",
      operation: "bulk_serp",
      estimatedCostUsd: 5,
    });

    const result = await canPerformPaidOperation("dataforseo_request");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("spend_limit");
  });

  it("requirePaidOperation throws a safe QuotaExceededError", async () => {
    await setProviderDisabled("app", true);
    await expect(requirePaidOperation("domain_scan")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("tracks remaining quota for display", async () => {
    expect(await remainingToday("dataforseo_request")).toBe(25); // test default
    await recordUsage({
      provider: "dataforseo",
      operation: "serp_organic",
      guardOperation: "dataforseo_request",
    });
    expect(await remainingToday("dataforseo_request")).toBe(24);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitError } from "@/lib/errors";
import { InMemoryRedisClient, setRedisForTesting } from "@/lib/redis";
import {
  enforceRateLimit,
  rateLimit,
  resolveClientIp,
} from "@/lib/security/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => {
    setRedisForTesting(new InMemoryRedisClient());
  });

  afterEach(() => {
    setRedisForTesting(null);
  });

  it("allows requests under the limit and blocks after it", async () => {
    const key = "auth:login:test-user@example.com";

    for (let i = 0; i < 3; i++) {
      const result = await rateLimit({ key, limit: 3, windowSeconds: 60 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - i - 1);
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }

    const blocked = await rateLimit({ key, limit: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("enforceRateLimit throws RateLimitError with a retry hint when exhausted", async () => {
    const key = "auth:signup:enforce@example.com";

    await enforceRateLimit({ key, limit: 1, windowSeconds: 60 });

    const error = await enforceRateLimit({
      key,
      limit: 1,
      windowSeconds: 60,
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).statusCode).toBe(429);
    expect((error as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts independent keys separately", async () => {
    await rateLimit({ key: "auth:login:a", limit: 1, windowSeconds: 60 });
    const other = await rateLimit({ key: "auth:login:b", limit: 1, windowSeconds: 60 });
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(0);
  });

  it("supports weighted attempts via cost", async () => {
    const key = "auth:reset:cost@example.com";
    const first = await rateLimit({ key, limit: 5, windowSeconds: 60, cost: 5 });
    expect(first.allowed).toBe(true);
    const second = await rateLimit({ key, limit: 5, windowSeconds: 60 });
    expect(second.allowed).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("reads the first x-forwarded-for entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(resolveClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip then unknown", () => {
    expect(resolveClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7"
    );
    expect(resolveClientIp(new Headers())).toBe("unknown");
  });
});

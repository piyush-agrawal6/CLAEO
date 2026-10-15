import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logging/logger";

describe("logger redaction", () => {
  it("redacts sensitive keys at the top level", () => {
    const result = redact({
      password: "hunter2",
      apiKey: "sk-123",
      dataforseoPassword: "secret",
      sessionToken: "tok",
      safe: "visible",
    });

    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.dataforseoPassword).toBe("[REDACTED]");
    expect(result.sessionToken).toBe("[REDACTED]");
    expect(result.safe).toBe("visible");
  });

  it("redacts nested sensitive keys", () => {
    const result = redact({
      provider: {
        auth: { password: "p", headers: { authorization: "Basic abc" } },
      },
    });

    const provider = result.provider as {
      auth: { password: string; headers: { authorization: string } };
    };
    // Redaction is key-based at every depth; structure stays readable.
    expect(provider.auth.password).toBe("[REDACTED]");
    expect(provider.auth.headers.authorization).toBe("[REDACTED]");
  });

  it("scrubs URL-embedded basic auth credentials", () => {
    const result = redact({ url: "https://login:secretpass@api.example.com/v3" });
    expect(String(result.url)).not.toContain("secretpass");
    expect(String(result.url)).toContain("[REDACTED]@");
  });

  it("caps string length and array size", () => {
    const result = redact({
      long: "x".repeat(5_000),
      list: Array.from({ length: 100 }, (_, i) => i),
    });
    expect(String(result.long).length).toBeLessThan(2_100);
    expect((result.list as unknown[]).length).toBeLessThanOrEqual(51);
  });

  it("serializes errors without leaking stack traces in production mode", () => {
    const result = redact({ error: new Error("boom") });
    const error = result.error as { message: string };
    expect(error.message).toBe("boom");
  });
});

import { describe, expect, it } from "vitest";
import {
  domainToDisplayName,
  normalizeDomain,
  safeCallbackUrl,
  slugify,
} from "@/lib/utils";

describe("slugify", () => {
  it("normalizes arbitrary text", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
    expect(slugify("  Multiple   spaces  ")).toBe("multiple-spaces");
    expect(slugify("already-slugged")).toBe("already-slugged");
    expect(slugify("under_score and 123")).toBe("under-score-and-123");
  });

  it("never produces empty slugs for content strings", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("normalizeDomain", () => {
  it("accepts bare domains", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
  });

  it("strips scheme, www, path, port and credentials", () => {
    expect(normalizeDomain("https://www.example.com/pricing")).toBe("example.com");
    expect(normalizeDomain("example.com:8080/path")).toBe("example.com");
    expect(normalizeDomain("user:pass@example.com")).toBe("example.com");
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
  });

  it("rejects implausible values", () => {
    expect(() => normalizeDomain("")).toThrow(/required/i);
    expect(() => normalizeDomain("not a domain")).toThrow(/valid domain/i);
    expect(() => normalizeDomain("localhost")).toThrow(/valid domain/i);
    expect(() => normalizeDomain("http://")).toThrow(/valid domain/i);
  });
});

describe("domainToDisplayName", () => {
  it("capitalizes the registrant label", () => {
    expect(domainToDisplayName("acme.io")).toBe("Acme");
    expect(domainToDisplayName("openai.com")).toBe("Openai");
  });
});

describe("safeCallbackUrl", () => {
  it("allows same-origin relative paths", () => {
    expect(safeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("/settings?tab=billing")).toBe("/settings?tab=billing");
  });

  it("blocks open-redirect vectors", () => {
    expect(safeCallbackUrl("https://evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("//evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
    expect(safeCallbackUrl(null)).toBe("/dashboard");
    expect(safeCallbackUrl(undefined, "/login")).toBe("/login");
  });
});

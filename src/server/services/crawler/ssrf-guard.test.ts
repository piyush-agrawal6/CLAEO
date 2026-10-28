import { describe, expect, it } from "vitest";
import {
  SsrfBlockedError,
  assertSafeUrl,
  type LookupFn,
} from "@/server/services/crawler/ssrf-guard";

const publicLookup: LookupFn = async () => ["93.184.216.34"];
const privateLookup: LookupFn = async () => ["127.0.0.1"];
const mixedLookup: LookupFn = async () => ["93.184.216.34", "10.0.0.5"];
const metadataLookup: LookupFn = async () => ["169.254.169.254"];
const failingLookup: LookupFn = async () => {
  throw new Error("ENOTFOUND");
};

async function expectBlocked(url: string, lookup: LookupFn, pattern: RegExp) {
  await expect(assertSafeUrl(url, lookup)).rejects.toThrow(SsrfBlockedError);
  await expect(assertSafeUrl(url, lookup)).rejects.toThrow(pattern);
}

describe("assertSafeUrl", () => {
  it("allows plain public http/https URLs", async () => {
    const url = await assertSafeUrl("https://example.com/page?x=1", publicLookup);
    expect(url.hostname).toBe("example.com");
    expect((await assertSafeUrl("http://example.com/", publicLookup)).protocol).toBe("http:");
  });

  it("refuses non-http protocols", async () => {
    await expectBlocked("ftp://example.com/file", publicLookup, /protocol ftp/);
    await expectBlocked("file:///etc/passwd", publicLookup, /protocol file/);
    await expectBlocked("gopher://example.com/", publicLookup, /protocol gopher/);
    await expectBlocked("not a url at all", publicLookup, /not a valid absolute URL/);
  });

  it("refuses non-default ports", async () => {
    await expectBlocked("http://example.com:8080/", publicLookup, /port 8080/);
    await expectBlocked("https://example.com:22/", publicLookup, /port 22/);
    // Scheme defaults are fine (port === "").
    await assertSafeUrl("https://example.com:443/", publicLookup);
    await assertSafeUrl("http://example.com:80/", publicLookup);
  });

  it("refuses localhost hostnames before any DNS work", async () => {
    await expectBlocked("http://localhost/admin", async () => {
      throw new Error("lookup should not be called");
    }, /localhost/);
    await expectBlocked("http://foo.localhost/", async () => {
      throw new Error("lookup should not be called");
    }, /localhost/);
  });

  it("checks IP literals directly without DNS", async () => {
    await expectBlocked("http://127.0.0.1/", publicLookup, /private or reserved/);
    await expectBlocked("http://169.254.169.254/latest/meta-data/", publicLookup, /private or reserved/);
    await expectBlocked("http://10.1.2.3/", publicLookup, /private or reserved/);
    await expectBlocked("http://[::1]/", publicLookup, /private or reserved/);
    // Public IP literal passes.
    await assertSafeUrl("http://93.184.216.34/", publicLookup);
  });

  it("refuses hostnames that resolve to private addresses", async () => {
    await expectBlocked("https://internal.example/", privateLookup, /resolves to private/);
    await expectBlocked("https://metadata.example/", metadataLookup, /169\.254\.169\.254/);
    // Mixed public+private answers are still refused (rebinding-safe).
    await expectBlocked("https://mixed.example/", mixedLookup, /resolves to private/);
  });

  it("treats DNS verification failure as a refusal", async () => {
    await expectBlocked("https://nxdomain.example/", failingLookup, /could not resolve/);
    await expectBlocked("https://empty.example/", async () => [], /no addresses/);
  });
});

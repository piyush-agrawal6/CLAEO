import { describe, expect, it, vi } from "vitest";
import {
  CRAWLER_USER_AGENT,
  crawlWebsite,
  isSameSite,
  normalizeUrl,
  type CrawlConfig,
} from "@/server/services/crawler/crawl";
import { SsrfBlockedError } from "@/server/services/crawler/ssrf-guard";
import type { LookupFn } from "@/server/services/crawler/ssrf-guard";

const PUBLIC_IP: LookupFn = async () => ["93.184.216.34"];
const PRIVATE_IP: LookupFn = async () => ["10.0.0.7"];

interface PageSpec {
  status?: number;
  contentType?: string;
  body?: string;
  redirect?: string;
  /** Thrown instead of a response (network failure). */
  throws?: string;
}

function makeFetch(routes: Record<string, PageSpec>) {
  const calls: Array<{ url: string; userAgent: unknown }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, userAgent: (init?.headers as Record<string, string>)?.["user-agent"] });
    const spec = routes[url];
    if (!spec) {
      return new Response("not found", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    }
    if (spec.throws) throw new TypeError(spec.throws);
    if (spec.redirect) {
      return new Response(null, {
        status: spec.status ?? 302,
        headers: { location: spec.redirect },
      });
    }
    return new Response(spec.body ?? "", {
      status: spec.status ?? 200,
      headers: { "content-type": spec.contentType ?? "text/html; charset=utf-8" },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const baseConfig: CrawlConfig = {
  maxPages: 10,
  maxBytesPerPage: 500_000,
  maxRedirects: 5,
  maxDurationMs: 60_000,
  pageTimeoutMs: 5_000,
};

const html = (body: string) => `<html><body>${body}</body></html>`;

describe("normalizeUrl / isSameSite", () => {
  it("canonicalizes fragments, default ports and trailing slashes", () => {
    expect(normalizeUrl("https://Example.com:443/a/?x=1#frag")).toBe("https://example.com/a?x=1");
    expect(normalizeUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("treats www and apex as the same site", () => {
    expect(isSameSite("www.example.com", "example.com")).toBe(true);
    expect(isSameSite("example.com", "evil.com")).toBe(false);
  });
});

describe("crawlWebsite", () => {
  it("crawls same-site pages breadth-first up to the page cap", async () => {
    const { impl, calls } = makeFetch({
      "https://example.com/": {
        body: html('<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="https://other.com/x">x</a>'),
      },
      "https://example.com/a": { body: html("<h1>A</h1>") },
      "https://example.com/b": { body: html("<h1>B</h1>") },
      "https://example.com/c": { body: html("<h1>C</h1>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: { ...baseConfig, maxPages: 2 },
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    expect(result.pagesCrawled).toBe(2);
    expect(result.pagesCapHit).toBe(true);
    expect(result.durationCapHit).toBe(false);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.url).toBe("https://example.com/");
    expect(result.pages[0]?.title).toBeNull();
    // External host never fetched.
    expect(calls.some((call) => call.url.includes("other.com"))).toBe(false);
    // Crawler identifies itself.
    expect(calls[0]?.userAgent).toBe(CRAWLER_USER_AGENT);
  });

  it("de-duplicates normalized URLs (fragments, trailing slashes)", async () => {
    const { impl, calls } = makeFetch({
      "https://example.com/": { body: html('<a href="/a">1</a><a href="/a#team">2</a><a href="/a/">3</a>') },
      "https://example.com/a": { body: html("<p>only once</p>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const aCalls = calls.filter((call) => call.url.startsWith("https://example.com/a"));
    expect(aCalls).toHaveLength(1);
    expect(result.pagesCrawled).toBe(2);
  });

  it("follows same-site redirects through the SSRF guard (www upgrade)", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { status: 301, redirect: "https://www.example.com/" },
      "https://www.example.com/": { body: html("<h1>Welcome</h1><a href='/next'>n</a>") },
      "https://www.example.com/next": { body: html("<p>next</p>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    expect(result.pagesCrawled).toBe(2);
    expect(result.pages[0]?.url).toBe("https://www.example.com/");
    expect(result.pages[0]?.headings.h1).toEqual(["Welcome"]);
  });

  it("refuses redirect hops to unsafe ports and records them as blocked", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/evil">e</a>') },
      "https://example.com/evil": { status: 302, redirect: "http://example.com:8080/admin" },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    expect(result.pagesBlocked).toBe(1);
    expect(result.blockedUrls[0]?.url).toBe("https://example.com/evil");
    expect(result.blockedUrls[0]?.reason).toMatch(/port 8080/);
    expect(result.pagesCrawled).toBe(1); // only the root succeeded
  });

  it("records off-site redirects as page errors and keeps crawling", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/away">a</a><a href="/fine">f</a>') },
      "https://example.com/away": { status: 302, redirect: "https://attacker.example/landing" },
      "https://example.com/fine": { body: html("<p>fine</p>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const away = result.pages.find((page) => page.url === "https://example.com/away");
    expect(away?.error).toMatch(/redirected off-site/);
    expect(result.pages.some((page) => page.url === "https://example.com/fine" && !page.error)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("redirected off-site"))).toBe(true);
  });

  it("caps redirect hops and fails the loop loudly", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/loop">l</a>') },
      "https://example.com/loop": { status: 302, redirect: "/loop" },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: { ...baseConfig, maxRedirects: 2 },
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const loop = result.pages.find((page) => page.url === "https://example.com/loop");
    expect(loop?.error).toMatch(/too many redirects/);
  });

  it("skips non-HTML responses without reading their bodies", async () => {
    const rootHtml = html('<a href="/file">f</a>');
    const pdfBody = "%%PDF-1.4 ".repeat(1000); // would be ~10 KB if read
    const { impl } = makeFetch({
      "https://example.com/": { body: rootHtml },
      "https://example.com/file": { contentType: "application/pdf", body: pdfBody },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const file = result.pages.find((page) => page.url === "https://example.com/file");
    expect(file?.error).toBe("not an HTML page — skipped");
    expect(file?.text).toBe("");
    // Only the HTML root page's bytes were counted — the PDF body was
    // canceled before being read.
    expect(result.bytesFetched).toBe(new TextEncoder().encode(rootHtml).length);
  });

  it("records HTTP error pages honestly", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/missing">m</a>') },
      "https://example.com/missing": { status: 404, body: html("<h1>Not found</h1>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const missing = result.pages.find((page) => page.url === "https://example.com/missing");
    expect(missing?.statusCode).toBe(404);
    expect(missing?.error).toBe("HTTP 404");
  });

  it("refuses to crawl when the START url resolves to a private address", async () => {
    const { impl } = makeFetch({});
    await expect(
      crawlWebsite({
        startUrl: "https://internal.example/",
        config: baseConfig,
        deps: { fetch: impl, lookup: PRIVATE_IP },
      })
    ).rejects.toThrow(SsrfBlockedError);
    expect(impl).not.toHaveBeenCalled(); // blocked before any fetch
  });

  it("enforces the per-page byte cap while streaming", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html(`<p>${"x".repeat(200_000)}</p>`) },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: { ...baseConfig, maxBytesPerPage: 1_000 },
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const page = result.pages[0]!;
    expect(result.bytesFetched).toBe(1_000);
    expect(page.text.length).toBeLessThanOrEqual(1_000);
    expect(page.error).toMatch(/truncated at 1000 bytes/);
  });

  it("enforces the wall-clock duration cap", async () => {
    let clock = 0;
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/slow">s</a><a href="/also">a</a>') },
      "https://example.com/slow": { body: html("<p>slow</p>") },
      "https://example.com/also": { body: html("<p>also</p>") },
    });
    const slowFetch: typeof fetch = async (input, init) => {
      clock += 5_000; // each fetch "takes" 5 s
      return impl(input, init);
    };

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: { ...baseConfig, maxDurationMs: 1_000 },
      deps: { fetch: slowFetch, lookup: PUBLIC_IP, now: () => clock },
    });

    expect(result.durationCapHit).toBe(true);
    expect(result.pagesCrawled).toBe(1); // deadline hit after the first page
  });

  it("records network failures per page and continues", async () => {
    const { impl } = makeFetch({
      "https://example.com/": { body: html('<a href="/broken">b</a><a href="/ok">o</a>') },
      "https://example.com/broken": { throws: "fetch failed" },
      "https://example.com/ok": { body: html("<p>ok</p>") },
    });

    const result = await crawlWebsite({
      startUrl: "https://example.com/",
      config: baseConfig,
      deps: { fetch: impl, lookup: PUBLIC_IP },
    });

    const broken = result.pages.find((page) => page.url === "https://example.com/broken");
    expect(broken?.error).toMatch(/fetch failed/);
    expect(result.pages.some((page) => page.url === "https://example.com/ok" && !page.error)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

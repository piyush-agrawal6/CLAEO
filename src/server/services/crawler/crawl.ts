import { env } from "@/lib/env";
import { extractPage } from "@/server/services/crawler/extract";
import {
  SsrfBlockedError,
  assertSafeUrl,
  type LookupFn,
} from "@/server/services/crawler/ssrf-guard";

/**
 * Onboarding website crawler.
 *
 * A deliberately small, SSRF-guarded, bounded crawler:
 *  - fetches HTML only, same site only (www-insensitive), default ports
 *  - every URL (including every redirect hop) passes the SSRF guard first
 *  - caps: pages, bytes per page, redirect hops, wall-clock duration and
 *    per-request timeout (all env-configurable, all enforced here)
 *  - never executes scripts and never renders HTML — output is plain,
 *    length-capped strings treated as untrusted data downstream
 */

export interface CrawlConfig {
  maxPages: number;
  maxBytesPerPage: number;
  maxRedirects: number;
  maxDurationMs: number;
  pageTimeoutMs: number;
}

export function getCrawlerConfigFromEnv(): CrawlConfig {
  return {
    maxPages: env.CRAWLER_MAX_PAGES,
    maxBytesPerPage: env.CRAWLER_MAX_BYTES_PER_PAGE,
    maxRedirects: env.CRAWLER_MAX_REDIRECTS,
    maxDurationMs: env.CRAWLER_MAX_DURATION_MS,
    pageTimeoutMs: env.CRAWLER_PAGE_TIMEOUT_MS,
  };
}

export interface CrawlPageResult {
  url: string;
  statusCode: number | null;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  headings: { h1: string[]; h2: string[] };
  linkCount: number;
  /** Visible text, capped at maxBytesPerPage worth of characters. */
  text: string;
  durationMs: number;
  /** Page-level failure (network, HTTP error, unsafe redirect target). */
  error: string | null;
}

export interface CrawlResult {
  pages: CrawlPageResult[];
  pagesCrawled: number;
  /** Discovered same-site URLs the SSRF guard refused. */
  pagesBlocked: number;
  blockedUrls: { url: string; reason: string }[];
  bytesFetched: number;
  durationMs: number;
  pagesCapHit: boolean;
  durationCapHit: boolean;
  /** Non-fatal warnings (per-page failures also appear in `pages`). */
  warnings: string[];
}

export interface CrawlDeps {
  fetch?: typeof fetch;
  lookup?: LookupFn;
  now?: () => number;
}

export interface CrawlOptions {
  startUrl: string;
  config: CrawlConfig;
  deps?: CrawlDeps;
}

export const CRAWLER_USER_AGENT = "QuerySideCrawler/1.0 (+https://queryside.com)";

/** "www."-insensitive same-site check used for scope enforcement. */
export function isSameSite(hostnameA: string, hostnameB: string): boolean {
  const strip = (host: string) => host.toLowerCase().replace(/^www\./, "");
  return strip(hostnameA) === strip(hostnameB);
}

/** Canonicalizes a URL for visited-set de-duplication. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

interface FetchedPage {
  finalUrl: string;
  response: Response;
}

/** Validates every hop, follows redirects manually, enforces same-site scope. */
async function fetchWithValidatedRedirects(
  startUrl: string,
  originHost: string,
  config: CrawlConfig,
  deps: CrawlDeps
): Promise<FetchedPage> {
  const fetchImpl = deps.fetch ?? fetch;
  let current = startUrl;

  for (let hop = 0; hop <= config.maxRedirects; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new Error(`redirect produced an invalid URL: ${current}`);
    }
    // Scope first (cheap), then SSRF validation (may hit DNS).
    if (!isSameSite(url.hostname, originHost)) {
      throw new Error(`redirected off-site to ${url.hostname}`);
    }
    const safeUrl = await assertSafeUrl(url, deps.lookup);

    const response = await fetchImpl(safeUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(config.pageTimeoutMs),
      headers: {
        "user-agent": CRAWLER_USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      try {
        await response.body?.cancel();
      } catch {
        /* body may already be consumed or null */
      }
      if (!location) return { finalUrl: safeUrl.toString(), response };
      current = new URL(location, safeUrl).toString();
      continue;
    }
    return { finalUrl: safeUrl.toString(), response };
  }
  throw new Error(`too many redirects (limit ${config.maxRedirects})`);
}

async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const body = response.body;
  if (!body) return { text: "", bytes: 0, truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    if (total + value.byteLength > maxBytes) {
      const remaining = maxBytes - total;
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      total = maxBytes;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8").decode(buffer), bytes: total, truncated };
}

function describeError(error: unknown): string {
  if (error instanceof SsrfBlockedError) return error.reason;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Crawls the same site as `startUrl`, breadth-first, up to the configured
 * caps. Throws {@link SsrfBlockedError} when the START URL itself is unsafe;
 * blocked discovered links and per-page failures are recorded and skipped so
 * one bad URL never fails the whole crawl.
 */
export async function crawlWebsite(options: CrawlOptions): Promise<CrawlResult> {
  const { config, deps = {} } = options;
  const now = deps.now ?? Date.now;

  const origin = new URL(options.startUrl);
  const originHost = origin.hostname;
  const start = normalizeUrl(options.startUrl);

  const startedAt = now();
  const deadline = startedAt + config.maxDurationMs;

  const visited = new Set<string>();
  const enqueued = new Set<string>([start]);
  const queue: string[] = [start];

  const pages: CrawlPageResult[] = [];
  const blockedUrls: { url: string; reason: string }[] = [];
  const warnings: string[] = [];

  let pagesCrawled = 0;
  let bytesFetched = 0;
  let pagesCapHit = false;
  let durationCapHit = false;

  while (queue.length > 0) {
    if (pagesCrawled >= config.maxPages) {
      pagesCapHit = true;
      break;
    }
    if (now() >= deadline) {
      durationCapHit = true;
      break;
    }

    const currentUrl = queue.shift() ?? start;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const pageStartedAt = now();
    let fetched: FetchedPage;
    try {
      fetched = await fetchWithValidatedRedirects(currentUrl, originHost, config, deps);
      visited.add(normalizeUrl(fetched.finalUrl));
    } catch (error) {
      const message = describeError(error);
      if (error instanceof SsrfBlockedError && currentUrl === start && pagesCrawled === 0) {
        // The origin itself is unsafe: refuse the whole crawl loudly.
        throw error;
      }
      if (error instanceof SsrfBlockedError) {
        blockedUrls.push({ url: currentUrl, reason: message });
      } else {
        warnings.push(`${currentUrl}: ${message}`);
        pages.push({
          url: currentUrl,
          statusCode: null,
          contentType: null,
          title: null,
          metaDescription: null,
          headings: { h1: [], h2: [] },
          linkCount: 0,
          text: "",
          durationMs: now() - pageStartedAt,
          error: message,
        });
        pagesCrawled += 1;
      }
      continue;
    }

    pagesCrawled += 1;
    const response = fetched.response;
    const contentType = response.headers.get("content-type");
    const durationMs = now() - pageStartedAt;

    if (contentType && !contentType.toLowerCase().includes("html")) {
      try {
        await response.body?.cancel();
      } catch {
        /* null or consumed */
      }
      pages.push({
        url: fetched.finalUrl,
        statusCode: response.status,
        contentType,
        title: null,
        metaDescription: null,
        headings: { h1: [], h2: [] },
        linkCount: 0,
        text: "",
        durationMs,
        error: "not an HTML page — skipped",
      });
      continue;
    }

    const read = await readBodyCapped(response, config.maxBytesPerPage);
    bytesFetched += read.bytes;

    if (!response.ok) {
      pages.push({
        url: fetched.finalUrl,
        statusCode: response.status,
        contentType,
        title: null,
        metaDescription: null,
        headings: { h1: [], h2: [] },
        linkCount: 0,
        text: "",
        durationMs,
        error: `HTTP ${response.status}`,
      });
      continue;
    }

    const data = extractPage(read.text, new URL(fetched.finalUrl));
    pages.push({
      url: fetched.finalUrl,
      statusCode: response.status,
      contentType,
      title: data.title,
      metaDescription: data.metaDescription,
      headings: data.headings,
      linkCount: data.links.length,
      text: data.text,
      durationMs,
      error: read.truncated ? `response truncated at ${config.maxBytesPerPage} bytes` : null,
    });

    // Discover more same-site pages (bounded frontier).
    for (const link of data.links) {
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        continue;
      }
      if (!isSameSite(parsed.hostname, originHost)) continue;
      let normalized: string;
      try {
        normalized = normalizeUrl(parsed.toString());
      } catch {
        continue;
      }
      if (visited.has(normalized) || enqueued.has(normalized)) continue;
      if (enqueued.size >= config.maxPages * 10) break; // keep the frontier bounded
      enqueued.add(normalized);
      queue.push(normalized);
    }
  }

  return {
    pages,
    pagesCrawled,
    pagesBlocked: blockedUrls.length,
    blockedUrls,
    bytesFetched,
    durationMs: now() - startedAt,
    pagesCapHit,
    durationCapHit,
    warnings,
  };
}

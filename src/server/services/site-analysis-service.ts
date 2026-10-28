import { logger } from "@/lib/logging/logger";
import { updateDomainStatus } from "@/server/repositories/domain-repository";
import {
  finishCrawlJob,
  insertCrawlJob,
  insertSitePages,
} from "@/server/repositories/onboarding-repository";
import {
  crawlWebsite,
  getCrawlerConfigFromEnv,
  type CrawlConfig,
  type CrawlDeps,
} from "@/server/services/crawler/crawl";
import {
  inferBusinessProfile,
  type BusinessProfileSuggestion,
} from "@/server/services/discovery/inference";
import type { Domain } from "@/lib/db/schema";

/**
 * Domain analysis: SSRF-guarded crawl + mocked business-profile inference.
 *
 * The crawl always runs against `https://{normalizedDomain}/` with the
 * env-capped configuration. Outcomes are honest:
 * - "failed"  → the crawl itself could not proceed (unsafe start URL,
 *               network failure); the caller keeps the user on the analyze
 *               step with a manual fallback
 * - "completed" with `suggestion: null` → crawl worked but inference did
 *               not; onboarding still advances (manual entry guaranteed)
 */

export interface DomainAnalysisOutcome {
  status: "completed" | "failed";
  jobId: string | null;
  /** Crawl-level failure summary, or null on success. */
  error: string | null;
  pagesCrawled: number;
  pagesRead: number;
  pagesBlocked: number;
  bytesFetched: number;
  durationMs: number;
  suggestion: BusinessProfileSuggestion | null;
  /** Set when the crawl succeeded but inference failed. */
  suggestionError: string | null;
  /** True when suggestions came from the mock fixture (always, in Phase 2). */
  mocked: boolean;
}

/** Pages fed to inference (non-error HTML with text), tightly bounded. */
const MAX_EVIDENCE_PAGES = 5;
const MAX_EVIDENCE_CHARS_PER_PAGE = 8_000;

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runDomainAnalysis(input: {
  workspaceId: string;
  domain: Pick<Domain, "id" | "normalizedDomain">;
  config?: CrawlConfig;
  /** Test hook: inject fetch/DNS (defaults to the real implementations). */
  deps?: CrawlDeps;
}): Promise<DomainAnalysisOutcome> {
  const { workspaceId, domain } = input;
  const config = input.config ?? getCrawlerConfigFromEnv();
  const startUrl = `https://${domain.normalizedDomain}/`;

  const job = await insertCrawlJob({
    workspaceId,
    domainId: domain.id,
    startUrl,
    maxPages: config.maxPages,
    maxBytesPerPage: config.maxBytesPerPage,
    maxRedirects: config.maxRedirects,
    maxDurationMs: config.maxDurationMs,
  });
  await updateDomainStatus(workspaceId, domain.id, "analyzing");

  try {
    const result = await crawlWebsite({ startUrl, config, deps: input.deps });

    await insertSitePages(
      job.id,
      domain.id,
      result.pages.map((page) => ({
        url: page.url,
        statusCode: page.statusCode,
        contentType: page.contentType,
        title: page.title,
        metaDescription: page.metaDescription,
        headings: page.headings,
        linkCount: page.linkCount,
        textContent: page.text,
        durationMs: page.durationMs,
        error: page.error,
      }))
    );

    const pagesRead = result.pages.filter((page) => !page.error && page.text.length > 0).length;
    const crawlError =
      result.pages.length === 0
        ? "No HTML pages could be read from the site."
        : pagesRead === 0
          ? "Pages were fetched but contained no readable text."
          : null;
    await finishCrawlJob(job.id, {
      status: "completed",
      pagesCrawled: result.pagesCrawled,
      pagesBlocked: result.pagesBlocked,
      bytesFetched: result.bytesFetched,
      durationMs: result.durationMs,
      error: crawlError,
    });
    await updateDomainStatus(workspaceId, domain.id, pagesRead > 0 ? "ready" : "error");

    // Mocked inference from the crawl evidence — best effort by design.
    let suggestion: BusinessProfileSuggestion | null = null;
    let suggestionError: string | null = null;
    if (pagesRead > 0) {
      try {
        const evidencePages = result.pages
          .filter((page) => !page.error && page.text.length > 0)
          .slice(0, MAX_EVIDENCE_PAGES)
          .map((page) => ({
            url: page.url,
            title: page.title,
            metaDescription: page.metaDescription,
            text: page.text.slice(0, MAX_EVIDENCE_CHARS_PER_PAGE),
          }));
        const inference = await inferBusinessProfile(workspaceId, {
          pages: evidencePages,
          normalizedDomain: domain.normalizedDomain,
        });
        suggestion = inference.data;
      } catch (error) {
        suggestionError = describeError(error);
        logger.warn("Business-profile inference failed; continuing manually", {
          domainId: domain.id,
          error: suggestionError,
        });
      }
    }

    return {
      status: "completed",
      jobId: job.id,
      error: crawlError,
      pagesCrawled: result.pagesCrawled,
      pagesRead,
      pagesBlocked: result.pagesBlocked,
      bytesFetched: result.bytesFetched,
      durationMs: result.durationMs,
      suggestion,
      suggestionError,
      mocked: suggestion !== null,
    };
  } catch (error) {
    const message = describeError(error);
    await finishCrawlJob(job.id, {
      status: "failed",
      pagesCrawled: 0,
      pagesBlocked: 0,
      bytesFetched: 0,
      durationMs: 0,
      error: message,
    });
    await updateDomainStatus(workspaceId, domain.id, "error");
    return {
      status: "failed",
      jobId: job.id,
      error: message,
      pagesCrawled: 0,
      pagesRead: 0,
      pagesBlocked: 0,
      bytesFetched: 0,
      durationMs: 0,
      suggestion: null,
      suggestionError: null,
      mocked: false,
    };
  }
}

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  crawlJobs,
  onboardingStates,
  sitePages,
  type CrawlJob,
  type CrawlJobStatus,
  type NewSitePage,
  type OnboardingState,
  type OnboardingStep,
  type SitePage,
} from "@/lib/db/schema";
import { MAX_TEXT_CHARS } from "@/server/services/crawler/extract";

/**
 * Onboarding state + crawl persistence.
 *
 * SECURITY: every read/write is keyed by `workspaceId` (or by ids that were
 * themselves resolved workspace-scoped) so rows can never cross workspaces.
 */

// ---------------------------------------------------------------------------
// Onboarding state
// ---------------------------------------------------------------------------

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(onboardingStates)
    .where(eq(onboardingStates.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertOnboardingState(values: {
  workspaceId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  domainId: string | null;
}): Promise<OnboardingState> {
  const db = getDb();
  const rows = await db
    .insert(onboardingStates)
    .values({
      workspaceId: values.workspaceId,
      currentStep: values.currentStep,
      completedSteps: values.completedSteps,
      domainId: values.domainId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: onboardingStates.workspaceId,
      set: {
        currentStep: values.currentStep,
        completedSteps: values.completedSteps,
        domainId: values.domainId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Crawl jobs + crawled pages
// ---------------------------------------------------------------------------

export async function insertCrawlJob(values: {
  workspaceId: string;
  domainId: string;
  startUrl: string;
  maxPages: number;
  maxBytesPerPage: number;
  maxRedirects: number;
  maxDurationMs: number;
}): Promise<CrawlJob> {
  const db = getDb();
  const [job] = await db.insert(crawlJobs).values(values).returning();
  return job!;
}

export async function finishCrawlJob(
  id: string,
  values: {
    status: Extract<CrawlJobStatus, "completed" | "failed">;
    pagesCrawled: number;
    pagesBlocked: number;
    bytesFetched: number;
    durationMs: number;
    error: string | null;
  }
): Promise<CrawlJob | null> {
  const db = getDb();
  const rows = await db
    .update(crawlJobs)
    .set({ ...values, finishedAt: new Date() })
    .where(eq(crawlJobs.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Batch-inserts crawled pages; text is capped again here (defense in depth). */
export async function insertSitePages(
  crawlJobId: string,
  domainId: string,
  pages: Array<Omit<NewSitePage, "crawlJobId" | "domainId">>
): Promise<void> {
  if (pages.length === 0) return;
  const db = getDb();
  const values = pages.map((page) => ({
    ...page,
    textContent: page.textContent ? page.textContent.slice(0, MAX_TEXT_CHARS) : page.textContent,
    crawlJobId,
    domainId,
  }));
  await db.insert(sitePages).values(values).onConflictDoNothing();
}

export async function getLatestCrawlJob(domainId: string): Promise<CrawlJob | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.domainId, domainId))
    .orderBy(desc(crawlJobs.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSitePages(crawlJobId: string): Promise<SitePage[]> {
  const db = getDb();
  return db.select().from(sitePages).where(eq(sitePages.crawlJobId, crawlJobId));
}

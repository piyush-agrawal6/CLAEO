import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { domains } from "@/lib/db/schema/domain";
import { workspaces } from "@/lib/db/schema/workspace";

/**
 * Phase 2: onboarding state machine + website discovery.
 *
 * Every table in this file is NEW (additive migration — existing tables are
 * untouched). All foreign keys cascade from workspace/domain so deleting a
 * workspace or domain cleans up its crawl data.
 *
 * Honesty rules that shaped this schema:
 * - No metric columns (volume/CPC/traffic/mention-rate) are stored for
 *   suggestions — priorities are qualitative labels only.
 * - `crawl_jobs` stores the caps actually applied to each run so the UI can
 *   report factual limits (pages/bytes/duration), not estimates.
 * - `site_pages.textContent` is untrusted input: capped at write time and
 *   always rendered as data (never as instructions or HTML).
 */

/** Ordered onboarding steps. `website` is the entry, `completed` the exit. */
export const onboardingSteps = [
  "website",
  "analyzing",
  "business",
  "competitors",
  "queries",
  "completed",
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

export const onboardingStates = pgTable(
  "onboarding_states",
  {
    /** One row per workspace: onboarding is a workspace-level flow. */
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    currentStep: text("current_step").$type<OnboardingStep>().notNull().default("website"),
    /** Steps the user has finished (saved or explicitly skipped). */
    completedSteps: jsonb("completed_steps")
      .$type<OnboardingStep[]>()
      .notNull()
      .$defaultFn(() => []),
    /** The domain the user added during onboarding (null → back to `website`). */
    domainId: text("domain_id").references(() => domains.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("onboarding_states_domain_id_idx").on(table.domainId)]
);

export const crawlJobStatuses = ["running", "completed", "failed"] as const;
export type CrawlJobStatus = (typeof crawlJobStatuses)[number];

export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    status: text("status").$type<CrawlJobStatus>().notNull().default("running"),
    /** Where the crawl started, e.g. "https://example.com/". */
    startUrl: text("start_url").notNull(),
    /** Caps actually applied to this run (snapshot of env at start). */
    maxPages: integer("max_pages").notNull(),
    maxBytesPerPage: integer("max_bytes_per_page").notNull(),
    maxRedirects: integer("max_redirects").notNull(),
    maxDurationMs: integer("max_duration_ms").notNull(),
    /** Pages fetched (HTML and non-HTML alike). */
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    /** Discovered URLs refused by the SSRF guard (same-origin links only). */
    pagesBlocked: integer("pages_blocked").notNull().default(0),
    bytesFetched: integer("bytes_fetched").notNull().default(0),
    durationMs: integer("duration_ms"),
    /** Sanitized failure summary (start URL blocked / network error). */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("crawl_jobs_workspace_id_idx").on(table.workspaceId),
    index("crawl_jobs_domain_id_idx").on(table.domainId),
  ]
);

export const sitePages = pgTable(
  "site_pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    crawlJobId: text("crawl_job_id")
      .notNull()
      .references(() => crawlJobs.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    title: text("title"),
    metaDescription: text("meta_description"),
    /** Extracted headings: { h1: string[], h2: string[] } (each capped). */
    headings: jsonb("headings").$type<{ h1: string[]; h2: string[] }>(),
    /** Number of links discovered on the page (before same-host filtering). */
    linkCount: integer("link_count").notNull().default(0),
    /** Visible text, capped and sanitized at write time — untrusted data. */
    textContent: text("text_content"),
    durationMs: integer("duration_ms"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    /** Page-level failure (timeout, non-2xx without body, decode error). */
    error: text("error"),
  },
  (table) => [
    unique("site_pages_job_url_unique").on(table.crawlJobId, table.url),
    index("site_pages_crawl_job_id_idx").on(table.crawlJobId),
    index("site_pages_domain_id_idx").on(table.domainId),
  ]
);

export const businessProfileSources = ["crawl", "manual"] as const;
export type BusinessProfileSource = (typeof businessProfileSources)[number];

export const businessProfiles = pgTable(
  "business_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** One profile per workspace — the profile describes the business itself. */
    workspaceId: text("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Domain whose crawl produced the suggestion (null if purely manual). */
    domainId: text("domain_id").references(() => domains.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    industry: text("industry"),
    audience: text("audience"),
    /** Products/services as short labels (suggestions or user entries). */
    products: jsonb("products").$type<string[]>().notNull().$defaultFn(() => []),
    /**
     * Top terms extracted from the workspace's own crawled pages. These are
     * FACTS about the site content (frequency counts), never volume estimates.
     */
    keywords: jsonb("keywords").$type<string[]>().notNull().$defaultFn(() => []),
    /** "crawl" = untouched suggestion awaiting review; "manual" = user-confirmed. */
    source: text("source").$type<BusinessProfileSource>().notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("business_profiles_domain_id_idx").on(table.domainId)]
);

export type OnboardingState = typeof onboardingStates.$inferSelect;
export type NewOnboardingState = typeof onboardingStates.$inferInsert;
export type CrawlJob = typeof crawlJobs.$inferSelect;
export type NewCrawlJob = typeof crawlJobs.$inferInsert;
export type SitePage = typeof sitePages.$inferSelect;
export type NewSitePage = typeof sitePages.$inferInsert;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type NewBusinessProfile = typeof businessProfiles.$inferInsert;

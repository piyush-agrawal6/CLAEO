import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { competitors, domains, prompts } from "@/lib/db/schema/domain";
import { workspaces } from "@/lib/db/schema/workspace";
import type { ProviderErrorClass } from "@/lib/db/schema/types";

/**
 * Phase 3: intelligence scans — the real search-intelligence product.
 *
 * `intelligence_scans` is the BATCH entity (one user-triggered scan across
 * keyword metrics, SERPs and AI prompts). This is deliberately separate from
 * `visibility_runs`, which remains ONE observation of ONE prompt on ONE
 * engine (its prompt_id is not null — it structurally cannot represent a
 * batch). Runs link back via `visibility_runs.scan_id`.
 *
 * Honesty rules that shaped this schema:
 * - Every metric column that comes from a provider is NULLABLE: a missing
 *   provider value stays null — never back-filled or invented.
 * - `serp_snapshots.tracked_domain_rank` is null when the domain is ABSENT
 *   from the SERP. Absence is data; it is never converted to rank 100.
 * - Scores are persisted per scan with their formula version so historical
 *   scans keep the score calculated with the formula active at that time.
 * - `mocked` flags exist at scan and row level so sample data can never be
 *   mistaken for real provider data in the UI.
 * - `scan_operations` gives deterministic, idempotent, resumable work items:
 *   unique (scan, operation key) means a retry can never double-charge or
 *   duplicate a result, and cancellation only has to flip pending rows.
 */

export const scanStatuses = [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ScanStatus = (typeof scanStatuses)[number];

/** How the scan was started. Only manual scans exist in this phase. */
export const scanTriggers = ["manual"] as const;
export type ScanTrigger = (typeof scanTriggers)[number];

export const intelligenceScans = pgTable(
  "intelligence_scans",
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
    status: text("status").$type<ScanStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<ScanTrigger>().notNull().default("manual"),
    /** Market used for keyword/SERP requests (DataForSEO location code). */
    locationCode: integer("location_code").notNull().default(2840),
    /** Language used for keyword/SERP requests (provider language code). */
    languageCode: text("language_code").notNull().default("en"),
    /** Work items the scan planned to execute. */
    expectedOperations: integer("expected_operations").notNull().default(0),
    completedOperations: integer("completed_operations").notNull().default(0),
    failedOperations: integer("failed_operations").notNull().default(0),
    /** Sum of provider-reported actual cost where known, else estimate. */
    providerCostUsd: doublePrecision("provider_cost_usd").notNull().default(0),
    /** True only when every provider call in the scan was mock/sample data. */
    mocked: boolean("mocked").notNull().default(false),
    /** Sanitized failure summary for a failed scan; never provider bodies. */
    error: text("error"),

    /* ---- persisted scores (traceable via formula version) ---- */
    aiScore: doublePrecision("ai_score"),
    aiScoreFormulaVersion: text("ai_score_formula_version"),
    /** Expected (prompt × engine) observations the scan planned. */
    aiCoverageExpected: integer("ai_coverage_expected"),
    /** Valid completed observations that count toward the score. */
    aiCoverageCompleted: integer("ai_coverage_completed"),
    googleScore: doublePrecision("google_score"),
    googleScoreFormulaVersion: text("google_score_formula_version"),
    /** Tracked keywords the scan planned to check in the SERP. */
    googleCoverageExpected: integer("google_coverage_expected"),
    /** Keywords with actual SERP data that were scored (numberOfQueries). */
    googleCoverageCompleted: integer("google_coverage_completed"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("intelligence_scans_workspace_id_idx").on(table.workspaceId),
    index("intelligence_scans_domain_id_idx").on(table.domainId, table.createdAt),
    index("intelligence_scans_status_idx").on(table.status),
  ]
);

export const scanOperationKinds = ["keyword_metrics", "serp", "ai_prompt"] as const;
export type ScanOperationKind = (typeof scanOperationKinds)[number];

export const scanOperationStatuses = [
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
] as const;
export type ScanOperationStatus = (typeof scanOperationStatuses)[number];

/**
 * One unit of resumable scan work. `operationKey` is deterministic
 * (e.g. `serp:best crm`, `ai:{promptId}:{engine}`) and unique per scan —
 * the idempotency key that makes retries safe.
 */
export const scanOperations = pgTable(
  "scan_operations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scanId: text("scan_id")
      .notNull()
      .references(() => intelligenceScans.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ScanOperationKind>().notNull(),
    operationKey: text("operation_key").notNull(),
    /** Kind-specific inputs (keyword text, prompt id, engine key...). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    status: text("status").$type<ScanOperationStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Sanitized failure summary + classification; never raw provider data. */
    error: text("error"),
    errorClass: text("error_class").$type<ProviderErrorClass>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("scan_operations_scan_key_unique").on(table.scanId, table.operationKey),
    index("scan_operations_scan_status_idx").on(table.scanId, table.status),
  ]
);

/**
 * Real keyword metrics from DataForSEO for one scan.
 *
 * Every provider metric is nullable — if the provider omits a keyword or a
 * field, the value stays null (DataForSEO does not return data for keywords
 * it does not know, and does not charge for them).
 */
export const keywordMetrics = pgTable(
  "keyword_metrics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scanId: text("scan_id")
      .notNull()
      .references(() => intelligenceScans.id, { onDelete: "cascade" }),
    /** Seed prompt this keyword was derived from (null if prompt deleted). */
    promptId: text("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    /** The keyword text actually sent to the provider (lowercased by API). */
    keyword: text("keyword").notNull(),
    provider: text("provider").notNull().default("dataforseo"),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    searchVolume: integer("search_volume"),
    cpc: doublePrecision("cpc"),
    competition: doublePrecision("competition"),
    /** Provider competition level: LOW | MEDIUM | HIGH (null = unknown). */
    competitionLevel: text("competition_level"),
    /** Provider search-volume trend percent vs previous month/quarter/year. */
    trendMonthly: integer("trend_monthly"),
    trendQuarterly: integer("trend_quarterly"),
    trendYearly: integer("trend_yearly"),
    /** Provider main search intent: informational | navigational | commercial | transactional. */
    intent: text("intent"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
    cacheHit: boolean("cache_hit").notNull().default(false),
    mocked: boolean("mocked").notNull().default(false),
  },
  (table) => [
    unique("keyword_metrics_scan_keyword_unique").on(table.scanId, table.keyword),
    index("keyword_metrics_scan_id_idx").on(table.scanId),
    index("keyword_metrics_keyword_idx").on(table.keyword),
  ]
);

/**
 * One SERP snapshot per (scan, keyword) with normalized result rows.
 *
 * `trackedDomainRank` is NULL when the tracked domain does not appear —
 * absence is recorded as null, never as an arbitrary worst rank.
 */
export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scanId: text("scan_id")
      .notNull()
      .references(() => intelligenceScans.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    keyword: text("keyword").notNull(),
    provider: text("provider").notNull().default("dataforseo"),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    /** Rank of the tracked domain's best organic result; null = absent. */
    trackedDomainRank: integer("tracked_domain_rank"),
    trackedDomainUrl: text("tracked_domain_url"),
    /** SERP feature/item types observed (bounded, from provider metadata). */
    itemTypes: jsonb("item_types").$type<string[]>(),
    /** Total results reported by the provider for this SERP (if provided). */
    seResultsCount: integer("se_results_count"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
    cacheHit: boolean("cache_hit").notNull().default(false),
    mocked: boolean("mocked").notNull().default(false),
  },
  (table) => [
    unique("serp_snapshots_scan_keyword_unique").on(table.scanId, table.keyword),
    index("serp_snapshots_scan_id_idx").on(table.scanId),
  ]
);

/** A single normalized SERP result belonging to a snapshot. */
export const serpResults = pgTable(
  "serp_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => serpSnapshots.id, { onDelete: "cascade" }),
    /** Rank within its result-type group (provider rank_group). */
    rank: integer("rank"),
    /** Absolute position across the whole SERP (provider rank_absolute). */
    absoluteRank: integer("absolute_rank"),
    page: integer("page"),
    /** Provider item type: organic | paid | featured_snippet. */
    resultType: text("result_type").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    isTrackedDomain: boolean("is_tracked_domain").notNull().default(false),
    isCompetitor: boolean("is_competitor").notNull().default(false),
    /** Set when the row belongs to a tracked/discovered competitor. */
    competitorId: text("competitor_id").references(() => competitors.id, { onDelete: "set null" }),
  },
  (table) => [
    index("serp_results_snapshot_id_idx").on(table.snapshotId),
    index("serp_results_domain_idx").on(table.domain),
  ]
);

export type IntelligenceScan = typeof intelligenceScans.$inferSelect;
export type NewIntelligenceScan = typeof intelligenceScans.$inferInsert;
export type ScanOperation = typeof scanOperations.$inferSelect;
export type NewScanOperation = typeof scanOperations.$inferInsert;
export type KeywordMetric = typeof keywordMetrics.$inferSelect;
export type SerpSnapshot = typeof serpSnapshots.$inferSelect;
export type SerpResult = typeof serpResults.$inferSelect;

import { sql } from "drizzle-orm";
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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { competitors, domains, prompts } from "@/lib/db/schema/domain";
import { intelligenceScans } from "@/lib/db/schema/scans";

/**
 * AI visibility measurement.
 *
 * A "run" is one observation of one prompt on one engine. Individual runs are
 * OBSERVATIONS, not statistics: the UI must label single-sample results as
 * such and only claim mention rates once enough samples exist.
 */

export const runStatuses = ["queued", "running", "completed", "partial", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const visibilityRuns = pgTable(
  "visibility_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    /**
     * The batch scan that produced this observation (nullable: runs created
     * outside a scan keep working). Deleting a scan removes its observations.
     */
    scanId: text("scan_id").references(() => intelligenceScans.id, { onDelete: "cascade" }),
    /** Engine key as reported by the provider, e.g. "chatgpt". */
    engine: text("engine").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    /** True when produced by a mock provider — must be labeled in the UI. */
    mocked: boolean("mocked").notNull().default(false),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Sanitized failure summary; never contains provider credentials. */
    error: text("error"),
  },
  (table) => [
    index("visibility_runs_domain_id_idx").on(table.domainId),
    index("visibility_runs_prompt_id_idx").on(table.promptId),
    index("visibility_runs_status_idx").on(table.status),
    index("visibility_runs_domain_engine_idx").on(table.domainId, table.engine),
    index("visibility_runs_scan_id_idx").on(table.scanId),
    // Idempotency: a retried scan operation can never duplicate an
    // observation for the same (scan, prompt, engine).
    uniqueIndex("visibility_runs_scan_prompt_engine_unique")
      .on(table.scanId, table.promptId, table.engine)
      .where(sql`"scan_id" IS NOT NULL`),
  ]
);

export const sentimentValues = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof sentimentValues)[number];

export const visibilityResults = pgTable(
  "visibility_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id")
      .notNull()
      .references(() => visibilityRuns.id, { onDelete: "cascade" })
      .unique(),
    brandMentioned: boolean("brand_mentioned").notNull().default(false),
    /** Deterministic mention count in the visible answer (0 when absent). */
    mentionCount: integer("mention_count"),
    /** Bounded snippet around the first mention — evidence for the UI. */
    mentionContext: text("mention_context"),
    /** Position within the answer when meaningful, else null. */
    position: integer("position"),
    sentiment: text("sentiment").$type<Sentiment>(),
    answerText: text("answer_text"),
    /** 0-1 provider/model-reported or derived confidence. */
    confidence: doublePrecision("confidence"),
    /** Model actually used (env-derived, never hardcoded in logic). */
    model: text("model"),
    latencyMs: integer("latency_ms"),
    /** Provider-side request/task id when one was returned (for audits). */
    providerRequestId: text("provider_request_id"),
    /** Bounded token usage when the provider reports it. */
    tokenUsage: jsonb("token_usage").$type<{ input?: number; output?: number }>(),
    /** Provider-reported actual cost when known; null = not reported. */
    costUsd: doublePrecision("cost_usd"),
    /** Raw provider payload, retained only when useful and safe. */
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("visibility_results_run_id_idx").on(table.runId)]
);

export const citationTypes = ["forum", "comparison", "documentation", "news", "blog", "social", "other"] as const;
export type CitationType = (typeof citationTypes)[number];

/**
 * Provenance of a stored URL. CRITICAL product distinction:
 * - `provider` — the engine explicitly returned it as a cited/source document
 * - `extracted` — the URL merely appears inside the answer text; this is
 *   NEVER counted as a citation in citation metrics.
 */
export const citationKinds = ["provider", "extracted"] as const;
export type CitationKind = (typeof citationKinds)[number];

export const citations = pgTable(
  "citations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    visibilityResultId: text("visibility_result_id")
      .notNull()
      .references(() => visibilityResults.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    type: text("type").$type<CitationType>(),
    /** `provider` citation vs plain `extracted` URL — see citationKinds. */
    kind: text("kind").$type<CitationKind>().notNull().default("extracted"),
    /** 1-based order when the provider returns an ordered citation list. */
    position: integer("position"),
    /** True when the cited domain is the customer's own domain. */
    isOwnedDomain: boolean("is_owned_domain").notNull().default(false),
    /** True when the cited domain belongs to a tracked competitor. */
    isCompetitorDomain: boolean("is_competitor_domain").notNull().default(false),
  },
  (table) => [
    index("citations_result_id_idx").on(table.visibilityResultId),
    index("citations_domain_idx").on(table.domain),
    index("citations_kind_idx").on(table.kind),
  ]
);

export const competitorMentions = pgTable(
  "competitor_mentions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resultId: text("result_id")
      .notNull()
      .references(() => visibilityResults.id, { onDelete: "cascade" }),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    mentioned: boolean("mentioned").notNull().default(false),
    position: integer("position"),
  },
  (table) => [
    unique("competitor_mentions_result_competitor_unique").on(
      table.resultId,
      table.competitorId
    ),
    index("competitor_mentions_competitor_id_idx").on(table.competitorId),
  ]
);

export type VisibilityRun = typeof visibilityRuns.$inferSelect;
export type VisibilityResult = typeof visibilityResults.$inferSelect;
export type Citation = typeof citations.$inferSelect;

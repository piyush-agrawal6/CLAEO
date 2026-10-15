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
    /** Engine key as reported by the provider, e.g. "chatgpt". */
    engine: text("engine").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
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
    /** Position within the answer when meaningful, else null. */
    position: integer("position"),
    sentiment: text("sentiment").$type<Sentiment>(),
    answerText: text("answer_text"),
    /** 0-1 provider/model-reported or derived confidence. */
    confidence: doublePrecision("confidence"),
    /** Raw provider payload, retained only when useful and safe. */
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("visibility_results_run_id_idx").on(table.runId)]
);

export const citationTypes = ["forum", "comparison", "documentation", "news", "blog", "social", "other"] as const;
export type CitationType = (typeof citationTypes)[number];

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
  },
  (table) => [
    index("citations_result_id_idx").on(table.visibilityResultId),
    index("citations_domain_idx").on(table.domain),
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

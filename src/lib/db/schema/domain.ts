import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { workspaces } from "@/lib/db/schema/workspace";

/**
 * Tracked domains (the customer's own websites), their competitors and the
 * prompt set used for AI visibility measurement.
 */

export const domainStatuses = ["pending", "analyzing", "ready", "error"] as const;
export type DomainStatus = (typeof domainStatuses)[number];

export const domains = pgTable(
  "domains",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** User-facing form, e.g. "https://www.example.com". */
    domain: text("domain").notNull(),
    /** Canonical bare form used for matching, e.g. "example.com". */
    normalizedDomain: text("normalized_domain").notNull(),
    name: text("name"),
    description: text("description"),
    category: text("category"),
    industry: text("industry"),
    country: text("country"),
    language: text("language"),
    status: text("status").$type<DomainStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("domains_workspace_normalized_unique").on(
      table.workspaceId,
      table.normalizedDomain
    ),
    index("domains_workspace_id_idx").on(table.workspaceId),
  ]
);

export const competitors = pgTable(
  "competitors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    discoveredAutomatically: boolean("discovered_automatically").notNull().default(false),
    /** 0-1 confidence of the automatic suggestion. Estimated, not factual. */
    confidence: doublePrecision("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("competitors_domain_normalized_unique").on(table.domainId, table.normalizedDomain),
    index("competitors_domain_id_idx").on(table.domainId),
  ]
);

export const promptIntents = [
  "informational",
  "commercial",
  "transactional",
  "comparison",
  "brand",
] as const;
export type PromptIntent = (typeof promptIntents)[number];

export const funnelStages = ["awareness", "consideration", "decision", "brand"] as const;
export type FunnelStage = (typeof funnelStages)[number];

export const promptSources = ["generated", "gsc", "manual", "imported"] as const;
export type PromptSource = (typeof promptSources)[number];

export const prompts = pgTable(
  "prompts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Lowercased, whitespace-collapsed form used for de-duplication. */
    normalizedText: text("normalized_text").notNull(),
    intent: text("intent").$type<PromptIntent>(),
    funnelStage: text("funnel_stage").$type<FunnelStage>(),
    /** 1-5 subjective importance assigned during discovery. */
    importance: integer("importance"),
    /** 0-1 estimated business value — labeled "estimated" in the UI. */
    businessValue: doublePrecision("business_value"),
    source: text("source").$type<PromptSource>().notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("prompts_domain_normalized_unique").on(table.domainId, table.normalizedText),
    index("prompts_domain_id_idx").on(table.domainId),
  ]
);

/** AI engines we track. Seeded via migration; enable/disable per engine. */
export const aiEngines = pgTable(
  "ai_engines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("ai_engines_key_unique").on(table.key)]
);

export type Competitor = typeof competitors.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type AiEngine = typeof aiEngines.$inferSelect;

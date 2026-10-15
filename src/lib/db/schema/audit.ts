import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { domains, prompts } from "@/lib/db/schema/domain";

/**
 * Page-level AEO/SEO audits and the prioritized Action Center.
 *
 * Scores are derived from transparent, documented rules (see
 * `lib/scoring/` in later phases). Where a value is an estimate, the UI must
 * label it as such.
 */

export const issueSeverities = ["critical", "high", "medium", "low", "info"] as const;
export type IssueSeverity = (typeof issueSeverities)[number];

export const pageAudits = pgTable(
  "page_audits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** 0-100 composite score. */
    score: doublePrecision("score"),
    seoScore: doublePrecision("seo_score"),
    aiReadabilityScore: doublePrecision("ai_readability_score"),
    entityClarityScore: doublePrecision("entity_clarity_score"),
    citationPotentialScore: doublePrecision("citation_potential_score"),
    answerExtractabilityScore: doublePrecision("answer_extractability_score"),
    agentAccessibilityScore: doublePrecision("agent_accessibility_score"),
    /** Check results that feed the scores (deterministic findings). */
    findings: jsonb("findings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("page_audits_domain_id_idx").on(table.domainId),
    index("page_audits_domain_url_idx").on(table.domainId, table.url),
  ]
);

export const auditIssues = pgTable(
  "audit_issues",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pageAuditId: text("page_audit_id")
      .notNull()
      .references(() => pageAudits.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").$type<IssueSeverity>().notNull().default("medium"),
    title: text("title").notNull(),
    description: text("description"),
    recommendation: text("recommendation"),
  },
  (table) => [index("audit_issues_page_audit_id_idx").on(table.pageAuditId)]
);

export const recommendationStatuses = ["open", "in_progress", "dismissed", "done"] as const;
export type RecommendationStatus = (typeof recommendationStatuses)[number];

export const recommendationPriorities = ["critical", "high", "medium", "low"] as const;
export type RecommendationPriority = (typeof recommendationPriorities)[number];

export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    priority: text("priority").$type<RecommendationPriority>().notNull().default("medium"),
    /** 0-1 estimated impact — labeled "estimated" in the UI. */
    impact: doublePrecision("impact"),
    /** Estimated effort: small | medium | large. */
    effort: text("effort"),
    title: text("title").notNull(),
    explanation: text("explanation"),
    action: text("action"),
    /** Supporting evidence (competitor mentions, citations, prompts). */
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    status: text("status").$type<RecommendationStatus>().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("recommendations_domain_id_idx").on(table.domainId),
    index("recommendations_domain_status_idx").on(table.domainId, table.status),
  ]
);

export type PageAudit = typeof pageAudits.$inferSelect;
export type AuditIssue = typeof auditIssues.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;

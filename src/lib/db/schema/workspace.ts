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
import { users } from "@/lib/db/schema/auth";
import type { ProviderErrorClass } from "@/lib/db/schema/types";

/**
 * Workspace tenancy, membership, plans, billing, usage and audit trails.
 *
 * Every product resource (domains, prompts, scans...) belongs to a workspace.
 * Authorization always flows: user -> workspace membership -> resource.
 */

export const workspacePlans = ["free", "starter", "pro", "growth", "agency"] as const;
export type WorkspacePlan = (typeof workspacePlans)[number];

export const workspaceRoles = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").$type<WorkspacePlan>().notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("workspaces_slug_unique").on(table.slug)]
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId),
    index("workspace_members_user_id_idx").on(table.userId),
  ]
);

/**
 * One row per billable provider operation. Doubles as the finance ledger for
 * cost analysis (`estimatedCost` is an estimate, clearly labeled as such in
 * the UI — never presented as an invoiced amount).
 */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    units: integer("units").notNull().default(1),
    estimatedCost: doublePrecision("estimated_cost").notNull().default(0),
    /**
     * Phase 3 provider-request ledger fields. Correlation ids are stored as
     * plain text (deliberately NOT foreign keys): the ledger is append-only
     * audit/finance data that must never cascade-delete with the resource it
     * describes, and FKs here would create schema module cycles.
     */
    domainId: text("domain_id"),
    /** Intelligence scan that triggered the request, when applicable. */
    scanId: text("scan_id"),
    /** Individual visibility run that triggered the request, when applicable. */
    runId: text("run_id"),
    /** True when served from cache — no provider request was made. */
    cacheHit: boolean("cache_hit").notNull().default(false),
    success: boolean("success").notNull().default(true),
    errorClass: text("error_class").$type<ProviderErrorClass>(),
    /** Provider-reported actual cost when known (null = not reported). */
    actualCostUsd: doublePrecision("actual_cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("usage_records_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("usage_records_provider_created_idx").on(table.provider, table.createdAt),
    index("usage_records_scan_id_idx").on(table.scanId),
  ]
);

/** Stripe is wired near the end of the MVP; columns exist from day one. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" })
      .unique(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    plan: text("plan").$type<WorkspacePlan>().notNull().default("free"),
    status: text("status").notNull().default("inactive"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: timestamp("cancel_at_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
);

/** Security-relevant events (sign-in, member changes, admin actions...). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt)]
);

export type UsageRecord = typeof usageRecords.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

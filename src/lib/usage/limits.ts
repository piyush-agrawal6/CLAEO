import { env } from "@/lib/env";
import type { WorkspacePlan } from "@/lib/db/schema";

/**
 * Central plan definitions and cost-guard configuration.
 *
 * Cost control is a PRODUCT requirement: every paid operation must pass
 * through `canPerformPaidOperation()` before touching a provider.
 */

/* ------------------------------- providers ------------------------------- */

export const paidProviders = ["dataforseo", "gemini", "groq"] as const;
export type PaidProvider = (typeof paidProviders)[number];

export const operationKinds = [
  "dataforseo_request",
  "llm_request",
  "domain_scan",
] as const;
export type OperationKind = (typeof operationKinds)[number];

/** Which provider budget an operation consumes. */
export const operationProvider: Record<OperationKind, PaidProvider | "app"> = {
  dataforseo_request: "dataforseo",
  llm_request: "gemini", // provider actually billed is resolved at call site
  domain_scan: "app",
};

export interface GlobalLimits {
  dataforseoRequestsPerDay: number;
  llmRequestsPerDay: number;
  domainScansPerDay: number;
  dailySpendUsd: number;
}

export function getGlobalLimits(): GlobalLimits {
  return {
    dataforseoRequestsPerDay: env.MAX_DATAFORSEO_REQUESTS_PER_DAY,
    llmRequestsPerDay: env.MAX_LLM_REQUESTS_PER_DAY,
    domainScansPerDay: env.MAX_DOMAIN_SCANS_PER_DAY,
    dailySpendUsd: env.MAX_DAILY_PROVIDER_SPEND_USD,
  };
}

export function limitForOperation(operation: OperationKind): number {
  const limits = getGlobalLimits();
  switch (operation) {
    case "dataforseo_request":
      return limits.dataforseoRequestsPerDay;
    case "llm_request":
      return limits.llmRequestsPerDay;
    case "domain_scan":
      return limits.domainScansPerDay;
  }
}

/* --------------------------------- plans --------------------------------- */

export interface PlanLimits {
  domains: number;
  prompts: number;
  /** Number of AI engines available for tracking. */
  engines: number;
  /** Minimum hours between visibility refreshes per domain. */
  refreshIntervalHours: number;
  scansPerDay: number;
  seats: number;
  actionCenter: boolean;
  searchConsole: boolean;
}

/**
 * Per-plan entitlements. Values are the product's current targets; billing
 * enforcement activates in the billing phase, but limits are already used by
 * onboarding guards.
 */
export const PLAN_LIMITS: Record<WorkspacePlan, PlanLimits> = {
  free: {
    domains: 1,
    prompts: 10,
    engines: 1,
    refreshIntervalHours: 168, // weekly
    scansPerDay: 1,
    seats: 1,
    actionCenter: false,
    searchConsole: false,
  },
  starter: {
    domains: 1,
    prompts: 30,
    engines: 3,
    refreshIntervalHours: 72,
    scansPerDay: 3,
    seats: 1,
    actionCenter: false,
    searchConsole: false,
  },
  pro: {
    domains: 3,
    prompts: 100,
    engines: 5,
    refreshIntervalHours: 24,
    scansPerDay: 10,
    seats: 3,
    actionCenter: true,
    searchConsole: true,
  },
  growth: {
    domains: 10,
    prompts: 300,
    engines: 6,
    refreshIntervalHours: 24,
    scansPerDay: 30,
    seats: 10,
    actionCenter: true,
    searchConsole: true,
  },
  agency: {
    domains: 25,
    prompts: 1000,
    engines: 6,
    refreshIntervalHours: 24,
    scansPerDay: 100,
    seats: 25,
    actionCenter: true,
    searchConsole: true,
  },
};

export function getPlanLimits(plan: WorkspacePlan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/* ------------------------------ cache policy ------------------------------ */

/** TTLs (seconds) for expensive, cacheable operations. */
export const CACHE_TTL = {
  /** Homepage crawl + metadata extraction. */
  homepageCrawl: 24 * 60 * 60,
  /** Business classification (unless the site changes materially). */
  businessClassification: 7 * 24 * 60 * 60,
  /** Competitor discovery suggestions. */
  competitorDiscovery: 7 * 24 * 60 * 60,
  /** Page audits. */
  pageAudit: 24 * 60 * 60,
  /** Provider-level response cache (safety net; domain results are in DB). */
  providerResponse: 6 * 60 * 60,
  /** Public visibility checker results per domain. */
  publicScan: 24 * 60 * 60,
} as const;

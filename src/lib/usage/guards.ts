import { QuotaExceededError } from "@/lib/errors";
import { metrics } from "@/lib/logging/metrics";
import { cacheGet, cacheSet, getRedis } from "@/lib/redis";
import {
  getGlobalLimits,
  limitForOperation,
  type OperationKind,
  type PaidProvider,
} from "@/lib/usage/limits";

/**
 * Application-level budget protection.
 *
 * EVERY paid provider call must pass through `canPerformPaidOperation()`
 * before any external request is made. Checks, in order:
 *
 *  1. admin kill switch (instant provider shutdown)
 *  2. daily operation limit (env-configured, conservative defaults)
 *  3. daily estimated spend guard
 *
 * Counters live in Redis (in-memory fallback in dev) and are incremented by
 * `recordUsage()` after a call completes, including failed calls, so a
 * misbehaving integration cannot retry itself into bankruptcy.
 */

export type GuardDenialReason = "kill_switch" | "daily_limit" | "spend_limit";

export interface OperationCheck {
  allowed: boolean;
  reason?: GuardDenialReason;
  remaining?: number;
  /** Unix epoch ms when the daily counter resets. */
  resetsAt?: number;
}

const KILL_SWITCH_PREFIX = "killswitch:";
const COUNTER_PREFIX = "usage:";

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function nextUtcMidnightMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/* ------------------------------ kill switches ----------------------------- */

export async function isProviderDisabled(provider: PaidProvider | "app" | "public_scans"): Promise<boolean> {
  const value = await cacheGet<boolean | string>(`${KILL_SWITCH_PREFIX}${provider}`);
  return value === true || value === "true";
}

export async function setProviderDisabled(
  provider: PaidProvider | "app" | "public_scans",
  disabled: boolean
): Promise<void> {
  await cacheSet(`${KILL_SWITCH_PREFIX}${provider}`, disabled, 30 * 24 * 60 * 60);
}

/* -------------------------------- guards --------------------------------- */

export interface OperationCheckOptions {
  /** Billed provider override (e.g., llm_request billed to groq fallback). */
  provider?: PaidProvider;
  /** Reserved for workspace/plan-level enforcement in the billing phase. */
  workspaceId?: string;
}

export async function canPerformPaidOperation(
  operation: OperationKind,
  options: OperationCheckOptions = {}
): Promise<OperationCheck> {
  const provider = options.provider ?? "app";

  // 1. Kill switches.
  if (await isProviderDisabled(provider)) {
    metrics.increment("usage.denied", { operation, reason: "kill_switch" });
    return { allowed: false, reason: "kill_switch" };
  }

  const day = utcDayKey();
  const counterKey = `${COUNTER_PREFIX}${operation}:daily:${day}`;
  const limit = limitForOperation(operation);

  // 2. Daily operation limit. `get` (not incr) so a denied check costs nothing.
  const used = Number((await getRedis().get<number | string>(counterKey)) ?? 0) || 0;
  if (used >= limit) {
    metrics.increment("usage.denied", { operation, reason: "daily_limit" });
    return {
      allowed: false,
      reason: "daily_limit",
      remaining: 0,
      resetsAt: nextUtcMidnightMs(),
    };
  }

  // 3. Daily estimated spend guard (approximate by design).
  const spendKey = `${COUNTER_PREFIX}spend:daily:${day}`;
  const spent = Number((await getRedis().get<number | string>(spendKey)) ?? 0) || 0;
  const spendLimit = getGlobalLimits().dailySpendUsd;
  if (spendLimit > 0 && spent >= spendLimit) {
    metrics.increment("usage.denied", { operation, reason: "spend_limit" });
    return {
      allowed: false,
      reason: "spend_limit",
      remaining: 0,
      resetsAt: nextUtcMidnightMs(),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - used),
    resetsAt: nextUtcMidnightMs(),
  };
}

/** Throwing variant for call sites that cannot handle a denial themselves. */
export async function requirePaidOperation(
  operation: OperationKind,
  options?: OperationCheckOptions
): Promise<void> {
  const check = await canPerformPaidOperation(operation, options);
  if (!check.allowed) {
    if (check.reason === "kill_switch") {
      throw new QuotaExceededError(
        "provider",
        "This operation is temporarily disabled by an administrator."
      );
    }
    throw new QuotaExceededError(
      "budget",
      "The daily usage limit for this operation has been reached. Please try again tomorrow or upgrade your plan."
    );
  }
}

/** Remaining calls for an operation today (UI/admin display). */
export async function remainingToday(operation: OperationKind): Promise<number> {
  const day = utcDayKey();
  const used =
    Number((await getRedis().get<number | string>(`${COUNTER_PREFIX}${operation}:daily:${day}`)) ?? 0) || 0;
  return Math.max(0, limitForOperation(operation) - used);
}

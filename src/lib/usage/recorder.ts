import { getDb } from "@/lib/db";
import { usageRecords } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";
import { getRedis } from "@/lib/redis";
import { utcDayKey } from "@/lib/usage/guards";

/**
 * Usage recording.
 *
 * Every billable operation (successful or not) records:
 * - an increment of the Redis daily counter used by cost guards
 * - a durable `usage_records` row for per-workspace reporting and finance
 *
 * Recording failures must never break the calling flow: they are logged and
 * counted instead.
 */

export interface RecordUsageInput {
  workspaceId?: string | null;
  /** e.g. "dataforseo" | "gemini" | "groq" */
  provider: string;
  /** e.g. "serp_organic" | "generate_structured" */
  operation: string;
  /** Kind used for cost-guard counters, when it maps to one. */
  guardOperation?: "dataforseo_request" | "llm_request" | "domain_scan";
  units?: number;
  /** Estimated cost in USD. Clearly an estimate — never an invoice. */
  estimatedCostUsd?: number;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const units = input.units ?? 1;
  const estimatedCostUsd = input.estimatedCostUsd ?? 0;
  const day = utcDayKey();

  // Redis counters (guards + rough spend). Failure is non-fatal.
  try {
    const redis = getRedis();
    if (input.guardOperation) {
      await redis.incrWithTtl(`usage:${input.guardOperation}:daily:${day}`, 48 * 60 * 60);
    }
    if (estimatedCostUsd > 0) {
      const key = `usage:spend:daily:${day}`;
      const current = Number((await redis.get<number | string>(key)) ?? 0) || 0;
      await redis.set(key, current + estimatedCostUsd, { ex: 48 * 60 * 60 });
    }
    metrics.increment("usage.recorded", { provider: input.provider });
  } catch (error) {
    logger.warn("Failed to update usage counters", { error, provider: input.provider });
  }

  // Durable row. Skip entirely when no database is configured (local dev).
  if (!env.DATABASE_URL) return;
  try {
    const db = getDb();
    await db.insert(usageRecords).values({
      workspaceId: input.workspaceId ?? null,
      provider: input.provider,
      operation: input.operation,
      units,
      estimatedCost: estimatedCostUsd,
    });
  } catch (error) {
    logger.warn("Failed to persist usage record", {
      error,
      provider: input.provider,
      operation: input.operation,
    });
  }
}

/** Today's counters for the internal provider-usage page and health output. */
export async function getDailyCountersSnapshot(): Promise<{
  day: string;
  dataforseoRequests: number;
  llmRequests: number;
  domainScans: number;
  estimatedSpendUsd: number;
}> {
  const redis = getRedis();
  const day = utcDayKey();
  const readNumber = async (key: string): Promise<number> => {
    const value = await redis.get<number | string>(key);
    return Number(value ?? 0) || 0;
  };
  return {
    day,
    dataforseoRequests: await readNumber(`usage:dataforseo_request:daily:${day}`),
    llmRequests: await readNumber(`usage:llm_request:daily:${day}`),
    domainScans: await readNumber(`usage:domain_scan:daily:${day}`),
    estimatedSpendUsd: await readNumber(`usage:spend:daily:${day}`),
  };
}

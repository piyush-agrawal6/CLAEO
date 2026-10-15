import { RateLimitError } from "@/lib/errors";
import { getRedis } from "@/lib/redis";
import { metrics } from "@/lib/logging/metrics";

/**
 * Fixed-window rate limiting backed by Redis (in-memory fallback in dev).
 *
 * Used to protect:
 * - authentication actions (per IP and per email)
 * - public tools (per IP and per domain) in later phases
 * - any endpoint that burns paid provider credits
 */

export interface RateLimitOptions {
  /** Namespace + identifier, e.g. `auth:login:ip:1.2.3.4`. */
  key: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /** Requests consumed by this attempt (default 1). */
  cost?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Unix epoch seconds when the window resets. */
  resetAt: number;
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds, cost = 1 } = options;
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const redisKey = `rl:${key}:${bucket}`;
  const resetAt = (bucket + 1) * windowSeconds;

  let count: number;
  try {
    count = await getRedis().incrWithTtl(redisKey, windowSeconds * 2, cost);
  } catch {
    // Fail open on infrastructure errors, but record the anomaly.
    metrics.increment("ratelimit.error");
    return { allowed: true, remaining: limit, resetAt };
  }

  const allowed = count <= limit;
  metrics.increment("ratelimit.check", { allowed: String(allowed) });

  return {
    allowed,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/** Same as {@link rateLimit} but throws `RateLimitError` when exhausted. */
export async function enforceRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await rateLimit(options);
  if (!result.allowed) {
    const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
    throw new RateLimitError("Too many attempts. Please wait a moment and try again.", retryAfter);
  }
  return result;
}

/** Extract the caller IP from proxy headers (first entry of x-forwarded-for). */
export function resolveClientIp(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headersList.get("x-real-ip") ?? "unknown";
}

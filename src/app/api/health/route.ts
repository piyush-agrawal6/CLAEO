import { metrics } from "@/lib/logging/metrics";
import { getDailyCountersSnapshot } from "@/lib/usage/recorder";
import { env } from "@/lib/env";
import { pingDb } from "@/lib/db";
import { isRedisConfigured } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health/liveness endpoint.
 *
 * Public output is intentionally minimal and free of infrastructure details:
 * only boolean check results, never connection strings, hostnames, keys or
 * version numbers of dependencies. Detailed metrics are dev-only.
 */

const startedAt = Date.now();

interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: "ok" | "not_configured" | "error";
    redis: "upstash" | "in_memory_fallback";
  };
  mockProviders: boolean;
  metrics?: Record<string, unknown>;
  usage?: Awaited<ReturnType<typeof getDailyCountersSnapshot>>;
}

export async function GET(): Promise<Response> {
  let database: HealthResponse["checks"]["database"] = "not_configured";

  if (env.DATABASE_URL) {
    try {
      database = (await pingDb()) ? "ok" : "error";
    } catch {
      database = "error";
    }
  }

  const isProd = env.NODE_ENV === "production";
  const body: HealthResponse = {
    status: database === "error" ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    checks: {
      database,
      redis: isRedisConfigured() ? "upstash" : "in_memory_fallback",
    },
    mockProviders: env.AI_MOCK_MODE || env.DATAFORSEO_MOCK_MODE,
  };

  // Detailed telemetry only outside production (internal/dev use).
  if (!isProd) {
    body.metrics = metrics.snapshot();
    body.usage = await getDailyCountersSnapshot().catch(() => undefined);
  }

  return Response.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

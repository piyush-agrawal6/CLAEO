import { ConfigurationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { HttpDataForSeoClient } from "@/lib/providers/dataforseo/client";
import { MockDataForSeoClient } from "@/lib/providers/dataforseo/mock";
import type { DataForSeoClient } from "@/lib/providers/dataforseo/types";

export * from "@/lib/providers/dataforseo/types";
export * from "@/lib/providers/dataforseo/costs";
export * from "@/lib/providers/dataforseo/cache";

/**
 * DataForSEO client factory.
 *
 * - `DATAFORSEO_MOCK_MODE=true` (dev default, force-disabled in production)
 *   or NODE_ENV=test → deterministic fixtures, zero spend.
 * - Otherwise the real client requires credentials and raises a clear
 *   configuration error when they are missing — it NEVER silently mocks.
 */
let sharedClient: DataForSeoClient | null = null;

export function getDataForSeoClient(): DataForSeoClient {
  if (env.DATAFORSEO_MOCK_MODE || env.NODE_ENV === "test") {
    return new MockDataForSeoClient();
  }
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    throw new ConfigurationError(
      "DataForSEO is not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, " +
        "or set DATAFORSEO_MOCK_MODE=true for development (sample data)."
    );
  }
  if (!sharedClient) {
    sharedClient = new HttpDataForSeoClient();
  }
  return sharedClient;
}

import { ConfigurationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { MockSearchVisibilityProvider } from "@/lib/providers/search/mock";
import type { SearchVisibilityProvider } from "@/lib/providers/search/types";

export * from "@/lib/providers/search/types";

/**
 * Search-visibility provider factory.
 *
 * Phase 0/1: only the deterministic mock is available (no credits spent).
 * The DataForSEO adapter is implemented in the DataForSEO phase; until then
 * requesting a real provider raises a clear configuration error instead of
 * fabricating data.
 */
export function getSearchVisibilityProvider(): SearchVisibilityProvider {
  if (env.DATAFORSEO_MOCK_MODE || env.NODE_ENV === "test") {
    return new MockSearchVisibilityProvider();
  }
  throw new ConfigurationError(
    "The real search-visibility provider is not wired yet (DataForSEO phase). " +
      "Set DATAFORSEO_MOCK_MODE=true for development."
  );
}

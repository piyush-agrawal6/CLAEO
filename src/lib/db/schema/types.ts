/**
 * Shared schema-level type constants.
 *
 * This module has no imports (pure constants) so any schema file can import
 * it without risking a module cycle. Follows the project convention: TS
 * const arrays + `text` columns typed via `$type<>()` (no pgEnum).
 */

/**
 * Provider failure classification (stored on the usage ledger and scan
 * operations so observability can answer "which provider fails most?").
 *
 * Mirrors the product error taxonomy in `lib/errors` / the DataForSEO
 * client: configuration problems, auth, rate limits, provider-side quota,
 * our own local quota/spend caps, timeouts, network, malformed responses and
 * generic provider errors.
 */
export const providerErrorClasses = [
  "CONFIGURATION",
  "AUTHENTICATION",
  "RATE_LIMIT",
  "PROVIDER_QUOTA",
  "LOCAL_QUOTA",
  "SPEND_CAP",
  "TIMEOUT",
  "NETWORK",
  "BAD_RESPONSE",
  "PROVIDER_ERROR",
] as const;
export type ProviderErrorClass = (typeof providerErrorClasses)[number];

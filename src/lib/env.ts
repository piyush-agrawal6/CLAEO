import { z } from "zod";

/**
 * Environment validation.
 *
 * Design goals:
 * - Importing this module must NEVER throw during `next build`, so nothing
 *   here is "required" at import time — critical values are asserted lazily
 *   via {@link assertRuntimeRequirements} when a feature actually needs them.
 * - Missing optional values fall back to safe, restrictive development
 *   defaults (most importantly: all provider mock modes default to ON).
 * - No secret is ever exposed to the client; only NEXT_PUBLIC_* values are
 *   available in the browser bundle.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  });

const optionalString = z.string().trim().optional();

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: optionalString,

  // Auth
  AUTH_SECRET: optionalString,
  AUTH_URL: optionalString,
  AUTH_DEV_AUTO_VERIFY: booleanish.default(true),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Email
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  // Redis
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  // DataForSEO
  DATAFORSEO_LOGIN: optionalString,
  DATAFORSEO_PASSWORD: optionalString,
  DATAFORSEO_MOCK_MODE: booleanish.default(true),
  DATAFORSEO_BASE_URL: z.string().url().default("https://api.dataforseo.com"),
  DATAFORSEO_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),

  // AI providers
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().min(1).default("gemini-2.0-flash"),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: z.string().min(1).default("llama-3.3-70b-versatile"),
  AI_PRIMARY_PROVIDER: z.enum(["gemini", "groq"]).default("gemini"),
  AI_FALLBACK_PROVIDER: z.enum(["gemini", "groq"]).default("groq"),
  AI_MOCK_MODE: booleanish.default(true),

  // Billing
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  // Analytics integrations (later phases)
  GA4_API_SECRET: optionalString,
  GA4_MEASUREMENT_ID: optionalString,

  // Cost guards
  MAX_DATAFORSEO_REQUESTS_PER_DAY: z.coerce.number().int().min(0).default(25),
  MAX_LLM_REQUESTS_PER_DAY: z.coerce.number().int().min(0).default(100),
  MAX_DOMAIN_SCANS_PER_DAY: z.coerce.number().int().min(0).default(10),
  MAX_DAILY_PROVIDER_SPEND_USD: z.coerce.number().min(0).default(5),

  // Scan engine caps (Phase 3). Bounds are Zod-enforced so a hostile env
  // value cannot turn a scan into an unbounded provider spend. Dev defaults
  // keep one default scan at roughly $0.02 in DataForSEO data (plus up to 20
  // counter-bounded AI requests) and total dev spend under ~$0.25 without
  // explicit approval (see docs/PROVIDER_COSTS.md).
  MAX_DATAFORSEO_REQUESTS_PER_SCAN: z.coerce.number().int().min(0).max(50).default(5),
  MAX_AI_REQUESTS_PER_SCAN: z.coerce.number().int().min(0).max(100).default(20),
  MAX_PROVIDER_SPEND_PER_SCAN_USD: z.coerce.number().min(0).max(10).default(0.1),
  MAX_KEYWORDS_PER_SEARCH_SCAN: z.coerce.number().int().min(1).max(20).default(10),
  MAX_SERP_KEYWORDS_PER_SCAN: z.coerce.number().int().min(0).max(20).default(5),
  MAX_AI_PROMPTS_PER_SCAN: z.coerce.number().int().min(0).max(50).default(10),
  MAX_AI_ENGINES_PER_SCAN: z.coerce.number().int().min(1).max(6).default(2),
  MAX_STORED_AI_ANSWER_CHARS: z.coerce.number().int().min(500).max(200_000).default(20_000),
  /** Wall-clock budget for one scan worker pass; scans resume across passes. */
  SCAN_WORKER_TIME_BUDGET_MS: z.coerce.number().int().min(1_000).max(120_000).default(8_000),

  // Test safety: live provider checks in the test suite are opt-in only and
  // FORCE-DISABLED in production by src/lib/env.ts hardening.
  ALLOW_LIVE_PROVIDER_TESTS: booleanish.default(false),

  // Website crawler (SSRF-guarded; every cap is bounded by Zod so a hostile
  // env value cannot turn the crawler into an unbounded fetcher).
  CRAWLER_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(10),
  CRAWLER_MAX_BYTES_PER_PAGE: z.coerce.number().int().min(1_000).max(2_000_000).default(500_000),
  CRAWLER_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
  CRAWLER_MAX_DURATION_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  CRAWLER_PAGE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("QuerySide"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_MOCK_MODE: booleanish.default(false),
});

export type Env = z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;

/**
 * NEXT_PUBLIC_ vars must be referenced statically for Next.js build-time
 * inlining, so they are mapped explicitly instead of spreading process.env.
 */
const clientRuntimeEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE,
};

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

const serverResult = serverSchema.safeParse(process.env);
const clientResult = clientSchema.safeParse(clientRuntimeEnv);

if (!serverResult.success) {
  // Fail fast and loud on malformed environment values. Only variable names
  // and validation messages are printed — never values.
  throw new Error(
    `[env] Invalid server environment: ${formatIssues(serverResult.error)}`
  );
}
if (!clientResult.success) {
  throw new Error(
    `[env] Invalid client environment: ${formatIssues(clientResult.error)}`
  );
}

/**
 * Development-only conveniences are FORCE-disabled in production, regardless
 * of what the environment says. Production must never serve mock/fabricated
 * data or auto-verify accounts — if real providers are not wired yet, the
 * app fails loudly instead (by design).
 */
export function applyProductionHardening<E extends Env>(input: E, nodeEnv: Env["NODE_ENV"]): E {
  if (nodeEnv !== "production") return input;
  return {
    ...input,
    AI_MOCK_MODE: false,
    DATAFORSEO_MOCK_MODE: false,
    AUTH_DEV_AUTO_VERIFY: false,
    NEXT_PUBLIC_MOCK_MODE: false,
    ALLOW_LIVE_PROVIDER_TESTS: false,
  };
}

export const env: Env = applyProductionHardening(
  { ...serverResult.data, ...clientResult.data },
  serverResult.data.NODE_ENV
);

/**
 * Runtime requirements for features that cannot work without them.
 * Called at the point of use (database init, auth init) rather than at
 * import time so builds never depend on runtime secrets.
 */
export function assertRuntimeRequirements(requirements: readonly string[]): void {
  const missing = requirements.filter((key) => {
    const value = process.env[key];
    return !value || value.trim() === "";
  });
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `See .env.example.`
    );
  }
}

/** True when the process is running a production build. */
export const isProduction = env.NODE_ENV === "production";
/** True when running under Vitest. */
export const isTest = env.NODE_ENV === "test";

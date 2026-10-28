import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { aiEngines, type EngineMode } from "@/lib/db/schema";
import { GeminiAdapter } from "@/lib/providers/ai/gemini";
import { GroqAdapter } from "@/lib/providers/ai/groq";
import { MockAiAdapter } from "@/lib/providers/ai/mock";
import type { AiEngineAdapter, AiEngineKey } from "@/lib/providers/ai/types";

/**
 * AI engine registry resolution.
 *
 * Reads the seeded `ai_engines` table (the source of truth for WHAT can be
 * measured) and resolves each engine to a runtime status for THIS deployment:
 *
 * - `real`        a configured real adapter will answer genuine questions
 * - `mock`        deterministic sample data only (dev/E2E; must be labeled)
 * - `unavailable` cannot be measured — with an honest reason:
 *                  planned = no legitimate source wired yet ("coming soon"),
 *                  not_configured = adapter exists but the API key is missing,
 *                  disabled = switched off (or mock-only outside mock mode)
 *
 * Planned engines are NEVER scannable: we do not show them as actively
 * supported, and they can never contribute data or metrics.
 */

export type EngineRuntimeStatus = "real" | "mock" | "unavailable";
export type EngineUnavailableReason = "planned" | "not_configured" | "disabled";

export interface ResolvedAiEngine {
  key: AiEngineKey;
  name: string;
  mode: EngineMode;
  enabled: boolean;
  status: EngineRuntimeStatus;
  /** Billed provider for real calls (null for planned/disabled engines). */
  provider: "gemini" | "groq" | null;
  model: string | null;
  supportsCitations: boolean;
  sourceDescription: string | null;
  adapter: AiEngineAdapter | null;
  unavailableReason?: EngineUnavailableReason;
}

function isMockEnvironment(): boolean {
  return env.AI_MOCK_MODE || env.NODE_ENV === "test";
}

function realAdapterFor(key: AiEngineKey): AiEngineAdapter | null {
  if (key === "gemini" && env.GEMINI_API_KEY) {
    return new GeminiAdapter({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  }
  if (key === "llama" && env.GROQ_API_KEY) {
    return new GroqAdapter({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL });
  }
  return null;
}

/**
 * Billed-provider budget per engine key (NOT the vendor column — the DB
 * `provider` field is display metadata like "google" / "openai").
 */
const ENGINE_PAID_PROVIDER: Record<string, "gemini" | "groq" | null> = {
  gemini: "gemini",
  llama: "groq",
};

function paidProviderOf(key: string): "gemini" | "groq" | null {
  return ENGINE_PAID_PROVIDER[key] ?? null;
}

function resolveEngine(row: {
  key: string;
  name: string;
  mode: EngineMode;
  enabled: boolean;
  provider: string | null;
  supportsCitations: boolean;
  sourceDescription: string | null;
}): ResolvedAiEngine {
  const key = row.key as AiEngineKey;
  const base = {
    key,
    name: row.name,
    mode: row.mode,
    enabled: row.enabled,
    supportsCitations: row.supportsCitations,
    sourceDescription: row.sourceDescription,
    model: null as string | null,
    provider: paidProviderOf(row.key),
  };

  if (!row.enabled || row.mode === "disabled") {
    return { ...base, status: "unavailable", adapter: null, unavailableReason: "disabled" };
  }
  if (row.mode === "planned") {
    return { ...base, status: "unavailable", adapter: null, unavailableReason: "planned" };
  }

  // Mock-only engines can only serve sample data, and only in mock mode.
  if (row.mode === "mock") {
    if (isMockEnvironment()) {
      return {
        ...base,
        status: "mock",
        model: `mock-${key}`,
        adapter: new MockAiAdapter(key, base.provider ?? "gemini"),
      };
    }
    return { ...base, status: "unavailable", adapter: null, unavailableReason: "disabled" };
  }

  // mode === "real"
  if (isMockEnvironment()) {
    return {
      ...base,
      status: "mock",
      model: `mock-${key}`,
      adapter: new MockAiAdapter(key, base.provider ?? "gemini"),
    };
  }
  const adapter = realAdapterFor(key);
  if (adapter) {
    // base.provider is the billed budget derived from the engine key.
    return { ...base, status: "real", model: adapter.model, adapter };
  }
  return { ...base, status: "unavailable", adapter: null, unavailableReason: "not_configured" };
}

/** Deterministic ordering: configured primary provider first, then fallback. */
function priorityCompare(a: ResolvedAiEngine, b: ResolvedAiEngine): number {
  const order = (engine: ResolvedAiEngine): number => {
    if (engine.provider === env.AI_PRIMARY_PROVIDER) return 0;
    if (engine.provider === env.AI_FALLBACK_PROVIDER) return 1;
    return 2;
  };
  const diff = order(a) - order(b);
  return diff !== 0 ? diff : a.key.localeCompare(b.key);
}

/** Every registry engine, resolved for this deployment (for UI + scans). */
export async function listAiEngines(): Promise<ResolvedAiEngine[]> {
  const rows = await getDb().select().from(aiEngines);
  return rows.map(resolveEngine).sort(priorityCompare);
}

/**
 * Engines a scan may actually query, capped at `limit`
 * (MAX_AI_ENGINES_PER_SCAN). Planned/unavailable engines are excluded —
 * they contribute nothing and are never presented as supported.
 */
export async function listScannableAiEngines(limit: number): Promise<ResolvedAiEngine[]> {
  const engines = await listAiEngines();
  return engines
    .filter((engine) => engine.adapter !== null && (engine.status === "real" || engine.status === "mock"))
    .slice(0, Math.max(0, limit));
}

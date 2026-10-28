import { z } from "zod";
import type { CitationType, Sentiment } from "@/lib/db/schema";

/**
 * AI-search visibility provider abstraction.
 *
 * Different engines answer very differently (ChatGPT, Perplexity, Gemini,
 * Google AI Mode, Claude, Copilot). Business logic NEVER sees vendor-shaped
 * payloads: providers must return the normalized observation below.
 */

export const engineKeys = [
  "chatgpt",
  "gemini",
  "perplexity",
  "google_ai_mode",
  "claude",
  "copilot",
  /** Open-model engine served through the Groq API (never presented as a consumer assistant). */
  "llama",
] as const;
export type EngineKey = (typeof engineKeys)[number];

export interface VisibilityQuery {
  engine: EngineKey;
  /** The prompt/question asked to the engine. */
  prompt: string;
  /** The customer's domain (used to detect brand mentions). */
  normalizedDomain: string;
  /** Candidate brand names to detect (company name + variants). */
  brandNames: string[];
  /** Competitor brand names to detect mentions for. */
  competitorNames: string[];
  /** Market/country hint for localized results. */
  country?: string;
}

export interface CitationObservation {
  url: string;
  domain: string;
  title?: string;
  type?: CitationType;
}

export interface CompetitorObservation {
  name: string;
  mentioned: boolean;
  position?: number;
}

/** Engine-agnostic observation of one prompt on one engine. */
export interface VisibilityObservation {
  engine: EngineKey;
  prompt: string;
  brandMentioned: boolean;
  position?: number;
  sentiment?: Sentiment;
  answerText?: string;
  /** 0-1 confidence, provider-reported or derived. */
  confidence?: number;
  citations: CitationObservation[];
  competitors: CompetitorObservation[];
  /** Raw provider payload — retained only when useful and safe. */
  rawData?: Record<string, unknown>;
  observedAt: Date;
  /** True when produced by a mock provider. */
  mocked: boolean;
}

export interface SearchVisibilityProvider {
  readonly id: string;
  isAvailable(): boolean;
  /** Engines this provider can actually serve. */
  supportedEngines(): EngineKey[];
  queryVisibility(query: VisibilityQuery): Promise<VisibilityObservation>;
}

/** Zod schema for normalizing provider-agnostic observations. */
export const visibilityObservationSchema = z.object({
  engine: z.enum(engineKeys),
  prompt: z.string(),
  brandMentioned: z.boolean(),
  position: z.number().int().nonnegative().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).nullable().optional(),
  answerText: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  citations: z
    .array(
      z.object({
        url: z.string(),
        domain: z.string(),
        title: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
      })
    )
    .default([]),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        mentioned: z.boolean(),
        position: z.number().int().nonnegative().nullable().optional(),
      })
    )
    .default([]),
});

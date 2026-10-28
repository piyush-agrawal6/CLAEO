import { z } from "zod";
import {
  aiPostJson,
  executeAiRequest,
  extractErrorMessageField,
} from "@/lib/providers/ai/http";
import { AiProviderError } from "@/lib/providers/ai/types";
import type {
  AiAnswer,
  AiEngineAdapter,
  AiAnswerRequest,
} from "@/lib/providers/ai/types";

/**
 * REAL Gemini adapter (Google AI).
 *
 * Endpoint (official docs, ai.google.dev → "generateContent"):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header: x-goog-api-key: <GEMINI_API_KEY>
 *   body:   { contents: [{ parts: [{ text }] }] }
 *
 * The prompt sent is the TRACKED QUERY exactly as configured — no brand or
 * domain context is injected, so a brand mention is genuine evidence.
 *
 * Citations: this integration reads plain answer text only. URLs that appear
 * in the text are stored as `extracted` URLs, NEVER as provider citations
 * (supportsCitations stays false until grounding/citation metadata is wired).
 */

const geminiResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z
                  .array(z.object({ text: z.string().optional() }).passthrough())
                  .optional()
                  .default([]),
              })
              .passthrough()
              .optional(),
            modelVersion: z.string().optional(),
          })
          .passthrough()
      )
      .optional()
      .default([]),
    usageMetadata: z
      .object({
        promptTokenCount: z.number().optional(),
        candidatesTokenCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

export interface GeminiAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GeminiAdapter implements AiEngineAdapter {
  readonly engine = "gemini" as const;
  readonly provider = "gemini" as const;
  readonly mock = false;
  readonly supportsCitations = false;
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number | undefined;

  constructor(options: GeminiAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs;
  }

  async ask(request: AiAnswerRequest): Promise<AiAnswer> {
    const { json, latencyMs } = await executeAiRequest({
      engine: this.engine,
      provider: this.provider,
      operation: "generate_content",
      ctx: request.ctx,
      call: () =>
        aiPostJson({
          engine: this.engine,
          url: `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
          headers: { "x-goog-api-key": this.apiKey },
          body: {
            contents: [{ role: "user", parts: [{ text: request.prompt }] }],
            // Low temperature keeps repeated measurements comparable.
            generationConfig: { temperature: 0.2 },
          },
          timeoutMs: this.timeoutMs,
          extractErrorMessage: extractErrorMessageField,
        }),
    });

    const parsed = geminiResponseSchema.parse(json);
    const answerText = (parsed.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!answerText) {
      throw new AiProviderError(this.engine, "BAD_RESPONSE", "Gemini returned no answer text.");
    }

    const usage = parsed.usageMetadata;
    return {
      answerText,
      model: parsed.candidates?.[0]?.modelVersion ?? this.model,
      latencyMs,
      tokenUsage:
        usage?.promptTokenCount != null || usage?.candidatesTokenCount != null
          ? { input: usage?.promptTokenCount, output: usage?.candidatesTokenCount }
          : null,
      actualCostUsd: null, // Gemini does not report a per-call cost
      mocked: false,
    };
  }
}

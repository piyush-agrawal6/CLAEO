import { z } from "zod";
import {
  aiPostJson,
  executeAiRequest,
  extractErrorMessageField,
} from "@/lib/providers/ai/http";
import { AiProviderError } from "@/lib/providers/ai/types";
import type { AiAnswer, AiEngineAdapter, AiAnswerRequest } from "@/lib/providers/ai/types";

/**
 * REAL Groq adapter serving Llama (open model).
 *
 * Endpoint (official docs, console.groq.com → OpenAI-compatible API):
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   header: Authorization: Bearer <GROQ_API_KEY>
 *   body:   { model, messages: [{ role: "user", content }] }
 *
 * Honesty: this engine is registered as "Llama 3.3 70B (Groq)" — a real
 * open-model response. It is NEVER presented as ChatGPT, Perplexity or any
 * consumer assistant.
 */

const groqResponseSchema = z
  .object({
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({ content: z.string().nullish() })
              .passthrough()
              .optional(),
          })
          .passthrough()
      )
      .optional()
      .default([]),
    usage: z
      .object({
        prompt_tokens: z.number().nullish(),
        completion_tokens: z.number().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

export interface GroqAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GroqAdapter implements AiEngineAdapter {
  readonly engine = "llama" as const;
  readonly provider = "groq" as const;
  readonly mock = false;
  readonly supportsCitations = false;
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number | undefined;

  constructor(options: GroqAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs;
  }

  async ask(request: AiAnswerRequest): Promise<AiAnswer> {
    const { json, latencyMs } = await executeAiRequest({
      engine: this.engine,
      provider: this.provider,
      operation: "chat_completions",
      ctx: request.ctx,
      call: () =>
        aiPostJson({
          engine: this.engine,
          url: `${this.baseUrl}/chat/completions`,
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: {
            model: this.model,
            messages: [{ role: "user", content: request.prompt }],
            temperature: 0.2,
          },
          timeoutMs: this.timeoutMs,
          extractErrorMessage: extractErrorMessageField,
        }),
    });

    const parsed = groqResponseSchema.parse(json);
    const answerText = (parsed.choices?.[0]?.message?.content ?? "").trim();
    if (!answerText) {
      throw new AiProviderError(this.engine, "BAD_RESPONSE", "Groq returned no answer text.");
    }

    const usage = parsed.usage;
    return {
      answerText,
      model: parsed.model ?? this.model,
      latencyMs,
      tokenUsage:
        usage?.prompt_tokens != null || usage?.completion_tokens != null
          ? { input: usage?.prompt_tokens ?? undefined, output: usage?.completion_tokens ?? undefined }
          : null,
      actualCostUsd: null, // Groq does not report a per-call cost
      mocked: false,
    };
  }
}

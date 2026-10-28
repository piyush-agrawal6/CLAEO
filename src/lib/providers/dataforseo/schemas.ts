import { z } from "zod";

/**
 * Zod schemas for the two verified DataForSEO endpoints. Provider responses
 * are UNTRUSTED: every field we read is validated, everything else is
 * ignored (`.passthrough()` keeps unknown fields from breaking us).
 *
 * Shapes verified against official docs (Oct 2026):
 * - dataforseo_labs/google/keyword_overview/live → tasks[].result[].items[]
 *   { keyword, keyword_info{search_volume,cpc,competition,competition_level,
 *     search_volume_trend{monthly,quarterly,yearly}},
 *     search_intent_info{main_intent} }
 * - serp/google/organic/live/regular → tasks[].result[] { keyword, item_types,
 *   se_results_count, datetime, items[] { type, rank_group, rank_absolute,
 *   page, domain, title, url } }
 */

const nullableNumber = z.number().nullish().transform((v) => v ?? null);
const nullableString = z.string().nullish().transform((v) => v ?? null);

/** Common envelope fields shared by every DataForSEO v3 response. */
const envelope = z.object({
  version: z.string().nullish(),
  status_code: z.number(),
  status_message: z.string().nullish(),
  time: z.string().nullish(),
  /** Total cost of all tasks, USD (provider-reported actual). */
  cost: nullableNumber,
  tasks_count: z.number().nullish(),
  tasks_error: z.number().nullish(),
});

/* --------------------------- keyword overview ----------------------------- */

export const keywordOverviewItemSchema = z
  .object({
    keyword: z.string(),
    keyword_info: z
      .object({
        search_volume: nullableNumber,
        cpc: nullableNumber,
        competition: nullableNumber,
        competition_level: nullableString,
        search_volume_trend: z
          .object({
            monthly: nullableNumber,
            quarterly: nullableNumber,
            yearly: nullableNumber,
          })
          .nullish()
          .transform((v) => v ?? null),
      })
      .nullish()
      .transform((v) => v ?? null),
    search_intent_info: z
      .object({
        main_intent: nullableString,
      })
      .nullish()
      .transform((v) => v ?? null),
  })
  .passthrough();

export const keywordOverviewResponseSchema = envelope.extend({
  tasks: z
    .array(
      z
        .object({
          id: z.string().nullish(),
          status_code: z.number(),
          status_message: z.string().nullish(),
          cost: nullableNumber,
          result: z
            .array(
              z
                .object({
                  items_count: z.number().nullish(),
                  items: z.array(keywordOverviewItemSchema).nullish().default([]),
                })
                .passthrough()
            )
            .nullish()
            .default([]),
        })
        .passthrough()
    )
    .default([]),
});

export type KeywordOverviewResponse = z.infer<typeof keywordOverviewResponseSchema>;

/* ------------------------------- SERP live -------------------------------- */

export const serpItemSchema = z
  .object({
    type: z.string(),
    rank_group: nullableNumber,
    rank_absolute: nullableNumber,
    page: nullableNumber,
    domain: nullableString,
    title: nullableString,
    url: nullableString,
  })
  .passthrough();

export const serpLiveRegularResponseSchema = envelope.extend({
  tasks: z
    .array(
      z
        .object({
          id: z.string().nullish(),
          status_code: z.number(),
          status_message: z.string().nullish(),
          cost: nullableNumber,
          result: z
            .array(
              z
                .object({
                  keyword: z.string().nullish(),
                  item_types: z.array(z.string()).nullish().default([]),
                  se_results_count: nullableNumber,
                  datetime: nullableString,
                  items: z.array(serpItemSchema).nullish().default([]),
                })
                .passthrough()
            )
            .nullish()
            .default([]),
        })
        .passthrough()
    )
    .default([]),
});

export type SerpLiveRegularResponse = z.infer<typeof serpLiveRegularResponseSchema>;

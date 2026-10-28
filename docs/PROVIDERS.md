# Providers

Two provider families feed QuerySide:

1. **Search/visibility providers** — query AI engines and SEO data sources
   (`src/lib/providers/search/`, DataForSEO adapter in `src/lib/providers/dataforseo/`
   when built).
2. **AI providers** — LLM calls for classification, extraction and generation
   (`src/lib/ai/`).

Both follow the same contract: business logic depends on an **interface**, never
on a vendor SDK; a **factory** resolves the concrete implementation from
environment; **mock mode is the default**; requesting a real provider that is
not wired yet throws a `ConfigurationError` instead of fabricating results.

## Search-visibility providers

```ts
// src/lib/providers/search/types.ts
interface SearchVisibilityProvider {
  readonly id: string;
  isAvailable(): boolean;
  supportedEngines(): EngineKey[];          // chatgpt, gemini, perplexity, …
  queryVisibility(query: VisibilityQuery): Promise<VisibilityObservation>;
}
```

`VisibilityObservation` is the normalized, engine-agnostic fact record:
brand mentioned or not, position, sentiment, answer snippet, citations,
competitor mentions, confidence, `observedAt`, and a `mocked` flag. It is
validated with `visibilityObservationSchema` before persisting.

| Implementation | Status | Condition |
| --- | --- | --- |
| `MockSearchVisibilityProvider` | ✅ built | `DATAFORSEO_MOCK_MODE=true` or test env |
| DataForSEO / engine adapters | ✅ shipped (Phase 3) | real HTTP client + Gemini/Groq adapters behind mock-mode factories — see `DATAFORSEO.md`, `AI_VISIBILITY.md` and `SCAN_ENGINE.md` |

The mock is deterministic (FNV-1a seed over engine+prompt+domain) so dashboards
and tests are stable, always sets `mocked: true`, and is force-disabled in
production by env hardening.

## AI providers

See [AI_LAYER.md](AI_LAYER.md) — `AIService` owns provider resolution,
guarding, validation and fallback.

## Factory pattern

```ts
// src/lib/providers/search/index.ts
export function getSearchVisibilityProvider(): SearchVisibilityProvider {
  if (env.DATAFORSEO_MOCK_MODE || env.NODE_ENV === "test") {
    return new MockSearchVisibilityProvider();
  }
  throw new ConfigurationError("The real provider is not wired yet …");
}
```

Why throw instead of degrading silently? Because serving mock data in a
production-shaped flow is indistinguishable from real data to a user — that is
the one thing this product must never do. A loud configuration error is
recoverable; fabricated metrics are not.

## Rules for adding a vendor

1. Implement the existing interface in its own module — features do not change.
2. Read credentials/model names from `lib/env.ts` (never hardcoded).
3. Run `canPerformPaidOperation()` **before** the external call and
   `recordUsage()` **after** (in `AIService`/service layer, not the adapter).
4. Validate/normalize responses with Zod; map vendor errors to `ProviderError`
   /`ProviderUnavailableError` without leaking raw bodies.
5. Wrap any untrusted content with `wrapUntrustedContent()` before it reaches
   a prompt.
6. Ship a deterministic mock + fixtures so tests never need the vendor.

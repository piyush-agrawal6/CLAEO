import { safeCallbackUrl } from "@/lib/utils";

/**
 * Post-authentication redirect resolution.
 *
 * Rules (see docs/GOOGLE_OAUTH.md):
 * - every candidate destination passes through `safeCallbackUrl` first —
 *   open redirects are impossible regardless of where callbackUrl came from
 * - an onboarding destination is always honored (deep links into setup)
 * - incomplete onboarding -> /onboarding, carrying a sanitized callbackUrl
 *   so setup can resume at the original destination afterwards
 * - completed onboarding -> the sanitized callback (default /dashboard)
 */
export function resolvePostAuthRedirect(input: {
  callbackUrl?: string | null;
  onboardingComplete: boolean;
}): string {
  const safe = safeCallbackUrl(input.callbackUrl);

  if (safe === "/onboarding" || safe.startsWith("/onboarding?") || safe.startsWith("/onboarding/")) {
    return safe;
  }
  if (input.onboardingComplete) {
    return safe;
  }
  if (safe === "/dashboard") {
    return "/onboarding";
  }
  return `/onboarding?callbackUrl=${encodeURIComponent(safe)}`;
}

/**
 * Next.js navigation control-flow errors (`redirect()`/`forward()`/`permanentRedirect()`).
 *
 * Server actions must let these propagate — swallowing one turns a successful
 * redirect into a rendered error state. `auth` helpers throw them on success,
 * so every action that calls `signIn`/`signOut`/`redirect` rethrows them.
 */
export function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

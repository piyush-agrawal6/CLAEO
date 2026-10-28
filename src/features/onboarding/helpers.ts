import { safeCallbackUrl } from "@/lib/utils";

/**
 * Shared redirect helpers for the onboarding flow (server-side only).
 *
 * All destinations are sanitized through `safeCallbackUrl` — an onboarding
 * completion can never produce an open redirect.
 */

/** Where to send the user back to after an intermediate step. */
export function onboardingHref(callbackUrl: string): string {
  const safe = safeCallbackUrl(callbackUrl, "/dashboard");
  return safe === "/dashboard" ? "/onboarding" : `/onboarding?callbackUrl=${encodeURIComponent(safe)}`;
}

/**
 * Final destination once onboarding completes:
 * the original deep link if there was one, else the domain overview
 * (the natural payoff of the setup flow), else the dashboard.
 */
export function completionDestination(callbackUrl: string, domainId: string | null): string {
  // An empty callbackUrl means "no deep link" (the wizard passes "" so that a
  // plain onboarding lands on the domain overview rather than the dashboard).
  const safe = safeCallbackUrl(callbackUrl, "");
  if (safe) return safe;
  return domainId ? `/domains/${domainId}` : "/dashboard";
}

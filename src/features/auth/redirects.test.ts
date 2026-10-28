import { describe, expect, it } from "vitest";
import { isNextNavigationError, resolvePostAuthRedirect } from "@/features/auth/redirects";

describe("resolvePostAuthRedirect", () => {
  it("routes incomplete onboarding to /onboarding when no callback is given", () => {
    expect(resolvePostAuthRedirect({ callbackUrl: undefined, onboardingComplete: false })).toBe(
      "/onboarding"
    );
    expect(resolvePostAuthRedirect({ callbackUrl: null, onboardingComplete: false })).toBe(
      "/onboarding"
    );
  });

  it("routes completed onboarding to the default destination", () => {
    expect(resolvePostAuthRedirect({ callbackUrl: undefined, onboardingComplete: true })).toBe(
      "/dashboard"
    );
    expect(resolvePostAuthRedirect({ callbackUrl: "/dashboard", onboardingComplete: true })).toBe(
      "/dashboard"
    );
  });

  it("honors a sanitized deep link once onboarding is complete", () => {
    expect(resolvePostAuthRedirect({ callbackUrl: "/settings", onboardingComplete: true })).toBe(
      "/settings"
    );
    expect(
      resolvePostAuthRedirect({ callbackUrl: "/settings?tab=billing", onboardingComplete: true })
    ).toBe("/settings?tab=billing");
  });

  it("carries a sanitized deep link into onboarding when incomplete", () => {
    expect(resolvePostAuthRedirect({ callbackUrl: "/domains/new", onboardingComplete: false })).toBe(
      "/onboarding?callbackUrl=%2Fdomains%2Fnew"
    );
  });

  it("always honors an onboarding destination (resumable deep links)", () => {
    expect(
      resolvePostAuthRedirect({ callbackUrl: "/onboarding?callbackUrl=%2Fdomains", onboardingComplete: true })
    ).toBe("/onboarding?callbackUrl=%2Fdomains");
    expect(resolvePostAuthRedirect({ callbackUrl: "/onboarding", onboardingComplete: false })).toBe(
      "/onboarding"
    );
  });

  it("never allows open redirects", () => {
    expect(resolvePostAuthRedirect({ callbackUrl: "https://evil.example", onboardingComplete: true })).toBe(
      "/dashboard"
    );
    expect(resolvePostAuthRedirect({ callbackUrl: "https://evil.example", onboardingComplete: false })).toBe(
      "/onboarding"
    );
    expect(resolvePostAuthRedirect({ callbackUrl: "//evil.example", onboardingComplete: true })).toBe(
      "/dashboard"
    );
    expect(resolvePostAuthRedirect({ callbackUrl: "javascript:alert(1)", onboardingComplete: true })).toBe(
      "/dashboard"
    );
  });
});

describe("isNextNavigationError", () => {
  it("recognizes Next.js redirect digests", () => {
    const error = Object.assign(new Error("redirect"), {
      digest: "NEXT_REDIRECT;/onboarding;307;",
    });
    expect(isNextNavigationError(error)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isNextNavigationError(new Error("boom"))).toBe(false);
    expect(isNextNavigationError({ digest: "SERVER_ERROR" })).toBe(false);
    expect(isNextNavigationError(null)).toBe(false);
    expect(isNextNavigationError(undefined)).toBe(false);
    expect(isNextNavigationError("NEXT_REDIRECT")).toBe(false);
  });
});

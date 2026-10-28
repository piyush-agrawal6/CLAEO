import { describe, expect, it } from "vitest";
import { completionDestination, onboardingHref } from "@/features/onboarding/helpers";

/**
 * Security tests for onboarding redirects: no destination may ever escape
 * the app origin (open-redirect prevention), and completion must prefer the
 * preserved deep link, else the domain overview, else the dashboard.
 */
describe("onboardingHref", () => {
  it("passes through an in-app path", () => {
    expect(onboardingHref("/settings")).toBe("/onboarding?callbackUrl=%2Fsettings");
  });

  it("drops the param for the dashboard default", () => {
    expect(onboardingHref("/dashboard")).toBe("/onboarding");
  });

  it("sanitizes hostile callbackUrls to a bare /onboarding", () => {
    expect(onboardingHref("")).toBe("/onboarding");
    expect(onboardingHref("https://evil.example/phish")).toBe("/onboarding");
    expect(onboardingHref("//evil.example")).toBe("/onboarding");
    expect(onboardingHref("/\\evil.example")).toBe("/onboarding");
  });
});

describe("completionDestination", () => {
  it("honors a preserved same-origin deep link", () => {
    expect(completionDestination("/settings", "dom_1")).toBe("/settings");
  });

  it("falls back to the domain overview when no deep link exists", () => {
    expect(completionDestination("", "dom_1")).toBe("/domains/dom_1");
  });

  it("falls back to the dashboard when there is no domain either", () => {
    expect(completionDestination("", null)).toBe("/dashboard");
  });

  it("never returns an off-origin URL", () => {
    expect(completionDestination("https://evil.example", "dom_1")).toBe("/domains/dom_1");
    expect(completionDestination("//evil.example", null)).toBe("/dashboard");
  });
});

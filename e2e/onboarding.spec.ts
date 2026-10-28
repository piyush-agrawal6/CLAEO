import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 onboarding & discovery E2E.
 *
 * Deterministic and free of paid credits and external fetches:
 * - auth uses dev auto-verification (no RESEND key) + a standard sign-in
 * - each test uses its own email domain, so parallel signups never race on
 *   the workspace-slug uniqueness check (name is derived from the domain)
 * - the SSRF case adds a domain from the reserved `.invalid` TLD: it passes
 *   domain validation, the DNS pre-check refuses it before any socket opens,
 *   and the honest-failure + manual-fallback path is exercised end to end
 * - DATAFORSEO_MOCK_MODE and AI_MOCK_MODE stay true; nothing is billed
 */

const stamp = Date.now();

test.beforeEach(async ({}, testInfo) => {
  // Each wizard step is a server action that can take several seconds against
  // a cold dev server compiling on demand + a remote development database;
  // the default 60s budget starves mid-wait even though every step succeeds.
  // Assertions and flows are unchanged — only the clock is given room for
  // the slowest honest environment (run the suite with --workers=1 so the
  // cold compiles are paid once instead of by two browsers at once).
  testInfo.setTimeout(240_000);
});

async function signUp(page: Page, email: string) {
  // Submits EXACTLY ONCE, and only after hydration is VERIFIED. A click on a
  // not-yet-hydrated form falls back to a native submit that Next.js serves
  // with a plain page render — the signup action never runs, no account is
  // created, and the client-only success panel can never appear. React
  // attaches its instance keys to the form inputs when hydration completes,
  // so waiting for that makes the click deterministic however slow the dev
  // server's compile. Completion is then proven server-side by the subsequent
  // sign-in (never by re-submitting: the suite shares one per-IP budget of
  // 5 sign-ups per 15min — hardcoded in src/features/auth/actions.ts and
  // deliberately not weakened for tests — so a retry would push another test
  // over the cap and collide with the just-created account).
  await page.goto("/signup");
  await page.waitForFunction(
    () => {
      const el = document.querySelector("input#name");
      return el ? Object.keys(el).some((k) => k.startsWith("__react")) : false;
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.getByLabel("Name").fill("E2E Onboarding");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Sup3r-Secret-Pass!");
  await page.getByRole("button", { name: "Create account" }).click();
  // Fast path only: the hydrated action swaps in a success panel. Its absence
  // is not an error — the caller's sign-in is the source of truth.
  await page
    .getByRole("link", { name: "Continue to sign in" })
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForTimeout(1_000);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Sup3r-Secret-Pass!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Sign up (auto-verified in dev) and sign in; lands on the onboarding wizard. */
async function signUpAndSignIn(page: Page, email: string) {
  await signUp(page, email);
  await signIn(page, email);
  await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
}

test.describe("Phase 2 onboarding wizard", () => {
  test("fresh signup lands on the website step", async ({ page }) => {
    await signUpAndSignIn(page, `onb-step-${stamp}@e2e-step.com`);

    await expect(page.getByRole("heading", { name: "Set up QuerySide" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add website" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
  });

  test("deep link callbackUrl is preserved into the wizard", async ({ page }) => {
    await signUpAndSignIn(page, `onb-deeplink-${stamp}@e2e-deeplink.com`);

    await page.goto("/onboarding?callbackUrl=%2Fsettings");
    // Still on the wizard (not yet complete), and the sanitized callback is
    // carried forward for the completion redirect.
    await expect(page.getByRole("heading", { name: "Set up QuerySide" })).toBeVisible();
    await expect(page.locator('input[name="callbackUrl"]').first()).toHaveValue("/settings");
  });

  test("SSRF-blocked crawl fails honestly and always offers the manual fallback", async ({ page }) => {
    await signUpAndSignIn(page, `onb-blocked-${stamp}@e2e-blocked.com`);

    // The .invalid TLD is reserved (RFC 2606) and can never resolve, so the
    // SSRF guard's DNS pre-check refuses it before any socket is opened.
    await page.getByLabel("Website URL or domain").fill("definitely-not-a-real-site.invalid");
    await page.getByRole("button", { name: "Add website" }).click();

    await expect(page.getByRole("heading", { name: "Analyze your website" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Analyze website" }).click();

    // Honest failure: the refusal reason is surfaced, never swallowed.
    await expect(page.getByText(/local|private|refus|block|not allowed|resolve/i).first()).toBeVisible({
      timeout: 30_000,
    });
    // The manual fallback is reachable no matter what the crawl did.
    await expect(
      page.getByRole("button", { name: "Skip analysis — enter details manually" })
    ).toBeVisible();
  });

  test("manual fallback walks business → competitors → queries → completion", async ({ page }) => {
    await signUpAndSignIn(page, `onb-manual-${stamp}@e2e-manual.com`);

    await page.getByLabel("Website URL or domain").fill("example.com");
    await page.getByRole("button", { name: "Add website" }).click();
    await expect(page.getByRole("heading", { name: "Analyze your website" })).toBeVisible({
      timeout: 20_000,
    });

    // Skip the crawl entirely — setup must never depend on it.
    await page.getByRole("button", { name: "Skip analysis — enter details manually" }).click();

    // Business profile (name is the only required field).
    await expect(page.getByRole("heading", { name: "Your business profile" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByLabel("Business name").fill("Acme E2E");
    await page.getByRole("button", { name: "Save and continue" }).click();

    // Competitors — zero entries allowed.
    await expect(page.getByRole("heading", { name: "Your competitors" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Save and continue" }).click();

    // Queries — priorities are qualitative QuerySide Priority labels only.
    await expect(page.getByRole("heading", { name: "Suggested queries" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Save and finish setup" }).click();

    // Completion routes out of the wizard (default: domain overview).
    await page.waitForURL(/\/(dashboard|domains|settings)/, { timeout: 20_000 });
  });

  test("completed workspace passes straight through /onboarding", async ({ page }) => {
    await signUpAndSignIn(page, `onb-passthru-${stamp}@e2e-passthru.com`);

    await page.getByLabel("Website URL or domain").fill("example.com");
    await page.getByRole("button", { name: "Add website" }).click();
    await expect(page.getByRole("heading", { name: "Analyze your website" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Skip analysis — enter details manually" }).click();
    await expect(page.getByRole("heading", { name: "Your business profile" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByLabel("Business name").fill("Pass Thru Inc");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByRole("heading", { name: "Your competitors" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByRole("heading", { name: "Suggested queries" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Save and finish setup" }).click();
    await page.waitForURL(/\/(dashboard|domains|settings)/, { timeout: 20_000 });

    // Returning to /onboarding no longer re-enters the wizard.
    await page.goto("/onboarding");
    await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 15_000 });
  });
});

import { expect, test } from "@playwright/test";

/**
 * Phase 0/1 smoke tests.
 *
 * These deliberately avoid any flow that requires a database or paid
 * provider, so they can run in any environment without spending credits.
 * Full signup -> onboarding -> scan E2E flows are added in later phases.
 */

test.describe("public pages", () => {
  test("landing page renders and links to signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Primary conversion CTA (hero + final CTA + nav all link to /signup).
    // Assert the destination URL rather than marketing copy, which changes
    // more often than the route it points at.
    const signupLinks = page.locator('a[href="/signup"]');
    await expect(signupLinks.first()).toBeVisible();
    await expect(signupLinks.first()).toHaveAttribute("href", "/signup");
  });

  test("login page renders form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("login page offers Continue with Google", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("signup page offers Continue with Google", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("Google sign-in button starts the Auth.js flow", async ({ page }) => {
    // The button always renders. Without GOOGLE_CLIENT_ID/SECRET the action
    // fails fast with a friendly /login?error=Configuration; with credentials
    // it navigates to Google. Assert either outcome so the test stays correct
    // whether or not provider credentials are present.
    await page.goto("/login");
    await page.getByRole("button", { name: /continue with google/i }).click();

    await page.waitForURL(/\/login\?error=Configuration|accounts\.google\.com/, {
      timeout: 20_000,
      // The assertion is that the flow STARTED (the URL proves it). Google's
      // own page is external and its full "load" — heavy subresources, may be
      // slow or blocked on CI networks — says nothing we need to verify.
      waitUntil: "domcontentloaded",
    });
    if (page.url().includes("error=Configuration")) {
      await expect(page.getByText(/not available right now/i)).toBeVisible();
    }
  });

  test("health endpoint reports status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { status: string };
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("protected dashboard redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

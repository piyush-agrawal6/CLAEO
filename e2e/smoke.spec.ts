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
    await expect(page.getByRole("link", { name: /get started|sign up/i }).first()).toBeVisible();
  });

  test("login page renders form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("health endpoint reports status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { status: string };
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("protected dashboard redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

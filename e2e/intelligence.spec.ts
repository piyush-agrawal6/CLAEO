import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 intelligence E2E (mock providers — zero spend, zero network).
 *
 * Deterministic end-to-end: signup → manual onboarding → add fixture
 * prompts → run a scan from the launcher (two-step confirm) → scores,
 * observations, actions, citations all render from persisted evidence →
 * plan rate limit denies a second same-day scan.
 *
 * The fixture triggers make assertions exact:
 * - a prompt containing "fixture-nobrand" → the brand is never mentioned
 *   → an "absent from AI answers" recommendation must exist;
 * - a prompt containing "fixture-absent" → the domain is absent from the
 *   mock SERP → an "absent from results" row + serp_absent action.
 *
 * DATAFORSEO_MOCK_MODE / AI_MOCK_MODE stay true; nothing is billed.
 */

const stamp = Date.now();

/**
 * One scan runs INLINE in the server action (up to 3 worker passes with a
 * wall-clock budget). On a remote dev database the passes can spend their
 * budget before every operation completes — the launcher then offers
 * "Resume scan", which continues the SAME scan idempotently. Drive it to
 * completion the way a user would.
 */
/**
 * Drives the scan to completion the way a user would, tolerating every
 * transient launcher state (idle → armed → in-flight → active → done).
 *
 * Completion is detected via the RSC-rendered status badge ("completed" in
 * the domain card / scan history) — a persisted fact — rather than the
 * client-side success alert, because the inline action can outlive the
 * client's wait window on a remote dev database.
 */
async function runScanToCompletion(page: Page) {
  const completedBadge = page.getByText("completed", { exact: true }).first();
  const confirm = page.getByRole("button", { name: /confirm — start paid checks/i });
  const resume = page.getByRole("button", { name: /resume scan/i });
  const run = page.getByRole("button", { name: "Run scan" });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await completedBadge.isVisible().catch(() => false)) return;

    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => {});
    } else if (await resume.isVisible().catch(() => false)) {
      await resume.click().catch(() => {});
    } else if (await run.isVisible().catch(() => false)) {
      await run.click().catch(() => {});
    }
    await page.waitForTimeout(2_000);
  }
  throw new Error("Scan did not reach the completed state");
}

async function signUp(page: Page, email: string) {
  // Submits EXACTLY ONCE, and only after hydration is VERIFIED (see
  // onboarding.spec.ts for the full rationale): a pre-hydration click falls
  // back to a native submit that renders the page without ever running the
  // signup action, so retries are both useless and dangerous — the suite's
  // sign-ups share one per-IP budget of 5 per 15 minutes.
  await page.goto("/signup");
  await page.waitForFunction(
    () => {
      const el = document.querySelector("input#name");
      return el ? Object.keys(el).some((k) => k.startsWith("__react")) : false;
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.getByLabel("Name").fill("E2E Intelligence");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Sup3r-Secret-Pass!");
  await page.getByRole("button", { name: "Create account" }).click();
  // Fast path only: the hydrated action swaps in a success panel. Its absence
  // is not an error — the subsequent sign-in is the source of truth.
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

async function completeManualOnboarding(page: Page) {
  await page.getByLabel("Website URL or domain").fill("example.com");
  await page.getByRole("button", { name: "Add website" }).click();
  await expect(page.getByRole("heading", { name: "Analyze your website" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Skip analysis — enter details manually" }).click();
  await expect(page.getByRole("heading", { name: "Your business profile" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel("Business name").fill("Acme E2E Intelligence");
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
}

test.describe("Phase 3 intelligence (mock providers)", () => {
  test("scan → scores → actions → citations → plan cap, all from real evidence", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const email = `intel-${stamp}@e2e-intel.com`;
    await signUp(page, email);
    await signIn(page, email);
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
    await completeManualOnboarding(page);

    /* ---- add the two fixture prompts ---- */
    await page.goto("/prompts");
    await expect(page.getByRole("heading", { name: "Tracked prompts" })).toBeVisible();

    await page
      .getByLabel(/question|prompt/i)
      .first()
      .fill("fixture-nobrand: best crm software?");
    await page.getByRole("button", { name: /add prompt/i }).click();
    await expect(page.getByText("fixture-nobrand: best crm software?")).toBeVisible({
      timeout: 20_000,
    });

    await page
      .getByLabel(/question|prompt/i)
      .first()
      .fill("fixture-absent crm reporting");
    await page.getByRole("button", { name: /add prompt/i }).click();
    await expect(page.getByText("fixture-absent crm reporting")).toBeVisible({
      timeout: 20_000,
    });

    /* ---- run a scan from the dashboard launcher (two-step confirm) ---- */
    await page.goto("/dashboard");
    // Mock-provider dev indicator is visible (env NEXT_PUBLIC_MOCK_MODE=true).
    await expect(page.getByText(/mock providers active/i)).toBeVisible();

    await runScanToCompletion(page);

    // Recent scans: one completed, labeled sample data, with cost $0.0000.
    const scanRow = page.getByText(/completed/).first();
    await expect(scanRow).toBeVisible();
    await expect(page.getByText(/sample data/).first()).toBeVisible();
    await expect(page.getByText(/\$0\.0000/)).toBeVisible();

    // The AI visibility score is a real number (mock answers succeeded).
    // Scores render with coverage + the persisted formula version — all
    // read straight from the completed scan's evidence.
    await expect(page.getByText(/Coverage: \d+ of \d+ observations/).first()).toBeVisible();
    await expect(page.getByText("Formula: ai_visibility_v1")).toBeVisible();

    /* ---- full report ---- */
    await page.goto("/ai-visibility");
    await expect(
      page.getByRole("heading", { name: /AI visibility — example\.com/ })
    ).toBeVisible();
    await expect(page.getByText("AI answers, prompt by prompt")).toBeVisible();
    // The fixture-nobrand prompt is deterministically never mentioned.
    await expect(
      page.getByText("fixture-nobrand: best crm software?").first()
    ).toBeVisible();
    await expect(page.getByText("not mentioned").first()).toBeVisible();
    // The fixture-absent keyword is deterministically absent from the SERP.
    await expect(page.getByText("absent from results").first()).toBeVisible();
    // Planned engines are listed as coming soon, never silently omitted.
    await expect(page.getByText("coming soon").first()).toBeVisible();

    /* ---- action center: evidence-based recs, manual state transitions ---- */
    await page.goto("/actions");
    await expect(page.getByRole("heading", { name: "Action center" })).toBeVisible();
    const absentRec = page
      .locator("li")
      .filter({ hasText: /absent from AI answers for “fixture-nobrand/ });
    await expect(absentRec).toBeVisible({ timeout: 20_000 });
    await absentRec.getByRole("button", { name: /dismiss/i }).click();
    // The dismissed item moves into the resolved section, never vanishes.
    const resolved = page.locator("details").filter({ hasText: /Resolved/ });
    await expect(resolved).toBeVisible({ timeout: 20_000 });

    /* ---- citations: extracted-only, provider section honest-empty ---- */
    await page.goto("/citations");
    await expect(page.getByRole("heading", { name: "Citations" })).toBeVisible();
    await expect(page.getByText(/No provider citations were returned/i).first()).toBeVisible();
    await expect(page.getByText(/industry-week\.example/).first()).toBeVisible();

    /* ---- plan cap: free plan allows 1 scan/day ---- */
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Run scan" }).click();
    await page.getByRole("button", { name: /confirm — start paid checks/i }).click();
    await expect(page.getByText(/1 scan\(s\) per day/i)).toBeVisible({ timeout: 30_000 });
  });

  test("intelligence pages are auth-gated", async ({ page }) => {
    for (const path of ["/ai-visibility", "/prompts", "/competitors", "/citations", "/actions"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

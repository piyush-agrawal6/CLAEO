import { test } from "@playwright/test";

/** TEMP DIAGNOSTIC — delete after use. */
test("diag page stability", async ({ page }) => {
  const events: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) events.push(`${Date.now()} NAV ${frame.url()}`);
  });
  page.on("load", () => events.push(`${Date.now()} LOAD`));
  page.on("console", (msg) => {
    const t = msg.text();
    if (/reload|refresh|Fast Refresh|Full Reload|compiled/i.test(t)) {
      events.push(`${Date.now()} CONSOLE: ${t.slice(0, 120)}`);
    }
  });

  const start = Date.now();
  await page.goto("/signup");
  events.push(`${Date.now()} GOTO-DONE`);

  let firstReactAt = -1;
  let goneAfterReact = 0;
  let checks = 0;
  while (Date.now() - start < 30_000) {
    const snap = await page.evaluate(() => {
      const el = document.querySelector("input#name");
      const nav = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming | undefined;
      return {
        react: el ? Object.keys(el).some((k) => k.startsWith("__react")) : false,
        navType: nav?.type ?? "?",
        inputVal: (document.querySelector("input#name") as HTMLInputElement | null)?.value ?? "",
        ready: document.readyState,
      };
    });
    checks += 1;
    if (snap.react && firstReactAt < 0) firstReactAt = Date.now() - start;
    if (firstReactAt >= 0 && !snap.react) goneAfterReact += 1;
    if (checks === 1 || snap.navType !== "navigate" || checks % 20 === 0) {
      events.push(
        `${Date.now()} t=${Date.now() - start}ms react=${snap.react} navType=${snap.navType} ready=${snap.ready} val="${snap.inputVal}"`
      );
    }
    await page.waitForTimeout(250);
  }

  console.log(`FIRST-REACT-AT: ${firstReactAt}ms  REACT-KEYS-VANISHED-COUNT: ${goneAfterReact}`);
  events.forEach((e) => console.log("EVENT:", e));
});

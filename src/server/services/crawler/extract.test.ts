import { describe, expect, it } from "vitest";
import {
  MAX_HEADINGS_PER_LEVEL,
  MAX_LINKS,
  MAX_TEXT_CHARS,
  decodeEntities,
  extractPage,
} from "@/server/services/crawler/extract";

const BASE = new URL("https://example.com/about");

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Acme &amp; Co — Analytics for teams</title>
    <meta name="description" content="Acme helps product teams understand their users." />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="canonical" href="https://example.com/about" />
    <script>var track = "ignore me"; </script>
    <style>.hide { display: none }</style>
  </head>
  <body>
    <h1>Welcome to Acme</h1>
    <h1>Duplicate h1</h1>
    <h2>Why Acme</h2>
    <h2>Pricing that scales</h2>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/about#team">About fragment</a>
      <a href="https://example.com/pricing">Pricing</a>
      <a href="https://other.com/x">External</a>
      <a href="mailto:hi@example.com">Mail</a>
      <a href="javascript:void(0)">JS</a>
      <a href="#top">In-page</a>
      <a href="/contact">Contact</a>
    </nav>
    <p>We build &lt;b&gt;bold&lt;/b&gt; analytics &#215; fast &nbsp; dashboards for &#x41; teams.</p>
    <script>document.write("not content")</script>
  </body>
</html>`;

describe("decodeEntities", () => {
  it("decodes named and numeric entities exactly once", () => {
    expect(decodeEntities("A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41; &nbsp;")).toBe(
      'A & B <c> "d" \'e\' A  '
    );
    expect(decodeEntities("&amp;lt;")).toBe("&lt;"); // no double decoding
  });
});

describe("extractPage", () => {
  it("extracts title, meta description, canonical, headings, links and text", () => {
    const page = extractPage(SAMPLE_HTML, BASE);

    expect(page.title).toBe("Acme & Co — Analytics for teams");
    expect(page.metaDescription).toBe("Acme helps product teams understand their users.");
    expect(page.canonical).toBe("https://example.com/about");
    expect(page.headings.h1).toEqual(["Welcome to Acme", "Duplicate h1"]);
    expect(page.headings.h2).toEqual(["Why Acme", "Pricing that scales"]);
    expect(page.links).toEqual([
      "https://example.com/",
      "https://example.com/about", // fragment + duplicate collapsed
      "https://example.com/pricing",
      "https://other.com/x",
      "https://example.com/contact",
    ]);
    expect(page.text).toContain("We build <b>bold</b> analytics × fast dashboards for A teams.");
    expect(page.text).not.toContain("ignore me");
    expect(page.text).not.toContain("not content");
    expect(page.text).not.toContain("<h1"); // raw tags are stripped
  });

  it("caps headings, links and text", () => {
    const manyHeadings = Array.from({ length: 10 }, (_, i) => `<h1>H${i}</h1>`).join("");
    const manyLinks = Array.from(
      { length: MAX_LINKS + 20 },
      (_, i) => `<a href="/p${i}">x</a>`
    ).join("");
    const longText = `<p>${"word ".repeat(MAX_TEXT_CHARS)}</p>`;

    const page = extractPage(
      `<html><body>${manyHeadings}${manyLinks}${longText}</body></html>`,
      BASE
    );
    expect(page.headings.h1).toHaveLength(MAX_HEADINGS_PER_LEVEL);
    expect(page.links.length).toBeLessThanOrEqual(MAX_LINKS);
    expect(page.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });

  it("handles missing pieces without fabricating values", () => {
    const page = extractPage("<html><body></body></html>", BASE);
    expect(page.title).toBeNull();
    expect(page.metaDescription).toBeNull();
    expect(page.canonical).toBeNull();
    expect(page.headings).toEqual({ h1: [], h2: [] });
    expect(page.links).toEqual([]);
    expect(page.text).toBe("");
  });

  it("resolves relative links against the page URL and skips unsafe schemes", () => {
    const page = extractPage(
      `<a href="child">c</a><a href="/root">r</a><a href="//other.example/x">p</a>` +
        `<a href="tel:+123">t</a><a href="data:text/html,x">d</a>`,
      BASE
    );
    expect(page.links).toEqual([
      "https://example.com/child",
      "https://example.com/root",
      "https://other.example/x",
    ]);
  });
});

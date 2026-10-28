/**
 * Minimal, dependency-free HTML extraction for the onboarding crawler.
 *
 * This is NOT a general-purpose parser — it pulls the handful of signals the
 * discovery layer needs (title, meta description, canonical, headings, links,
 * visible text) out of real-world HTML with regexes that are deliberately
 * conservative. Everything it returns is DATA: strings are entity-decoded,
 * whitespace-collapsed and length-capped. No HTML is ever preserved or
 * rendered from this output.
 */

export interface ExtractedPage {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  headings: { h1: string[]; h2: string[] };
  /** Absolute http(s) URLs, de-duplicated, capped. */
  links: string[];
  /** Visible text, whitespace-collapsed and capped. */
  text: string;
}

export const MAX_HEADINGS_PER_LEVEL = 5;
export const MAX_LINKS = 100;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 600;

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) {
    // Drop control characters and invalid points; keep tab/newline out too
    // (whitespace is collapsed downstream anyway).
    return code === 0x20 ? " " : "";
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Decodes common named + numeric HTML entities (single pass; &amp; last). */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

/** Removes tags, decodes entities and collapses whitespace. */
export function toPlainText(htmlFragment: string): string {
  return decodeEntities(htmlFragment.replace(/<[^>]*>/g, " "))
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

function stripNonTextBlocks(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}

const TAG_WITH_CONTENT = (tag: string) =>
  new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi");

function extractTagText(html: string, tag: string, maxItems: number): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(TAG_WITH_CONTENT(tag))) {
    const text = toPlainText(match[1] ?? "");
    if (!text) continue;
    out.push(cap(text, MAX_TITLE_CHARS));
    if (out.length >= maxItems) break;
  }
  return out;
}

const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseAttributes(tagHtml: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of tagHtml.matchAll(ATTRIBUTE_PATTERN)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name && !attrs.has(name)) attrs.set(name, value);
  }
  return attrs;
}

function firstMetaContent(html: string, name: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0] ?? "");
    if ((attrs.get("name") ?? "").toLowerCase() === name) {
      const content = attrs.get("content");
      if (content) return content;
    }
  }
  return null;
}

function firstLinkHref(html: string, rel: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0] ?? "");
    const relValue = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    if (relValue.includes(rel)) {
      const href = attrs.get("href");
      if (href) return href;
    }
  }
  return null;
}

function isCrawlableHref(href: string): boolean {
  const lower = href.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false; // relative resolved below
  return true;
}

function extractLinks(html: string, baseUrl: URL): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0] ?? "");
    const rawHref = attrs.get("href");
    if (!rawHref) continue;
    const href = decodeEntities(rawHref).trim();
    if (!href || href.startsWith("#")) continue;
    const lower = href.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("data:")) {
      continue;
    }
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!isCrawlableHref(absolute)) continue;
    // Drop the fragment — the crawler normalizes URLs itself.
    const withoutHash = absolute.split("#")[0] ?? absolute;
    if (seen.has(withoutHash)) continue;
    seen.add(withoutHash);
    links.push(withoutHash);
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

/** Extracts discovery signals from a decoded HTML document. */
export function extractPage(html: string, baseUrl: URL): ExtractedPage {
  const cleaned = stripNonTextBlocks(html);

  const titleFragment = extractTagText(cleaned, "title", 1)[0] ?? null;

  const metaDescriptionRaw = firstMetaContent(cleaned, "description");
  const metaDescription = metaDescriptionRaw
    ? cap(toPlainText(metaDescriptionRaw), MAX_DESCRIPTION_CHARS)
    : null;

  const canonicalRaw = firstLinkHref(cleaned, "canonical");
  let canonical: string | null = null;
  if (canonicalRaw) {
    try {
      const resolved = new URL(decodeEntities(canonicalRaw).trim(), baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        canonical = resolved.toString();
      }
    } catch {
      canonical = null;
    }
  }

  const headings = {
    h1: extractTagText(cleaned, "h1", MAX_HEADINGS_PER_LEVEL),
    h2: extractTagText(cleaned, "h2", MAX_HEADINGS_PER_LEVEL),
  };

  const links = extractLinks(cleaned, baseUrl);

  const text = cap(toPlainText(cleaned), MAX_TEXT_CHARS);

  return {
    title: titleFragment ? cap(titleFragment, MAX_TITLE_CHARS) : null,
    metaDescription,
    canonical,
    headings,
    links,
    text,
  };
}

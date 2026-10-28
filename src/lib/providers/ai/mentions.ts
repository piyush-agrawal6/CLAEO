import { normalizeDomain } from "@/lib/utils";

/**
 * Deterministic brand-mention and URL detection over AI answer text.
 *
 * These functions decide "was the brand mentioned?" — the core evidence of
 * the entire product — so they must be:
 * - deterministic (same text + target → same result, no LLM involvement);
 * - conservative (word-boundary matching avoids `acme` hitting `acmee`);
 * - auditable (they return the exact snippet used as evidence).
 */

export interface MentionEvidence {
  mentioned: boolean;
  /** Total matches across all target variants (0 when not mentioned). */
  count: number;
  /** Bounded snippet around the first match — UI evidence. */
  context: string | null;
}

const CONTEXT_RADIUS = 90;
const MAX_CONTEXT_CHARS = 240;

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary-ish pattern for a brand name: internal whitespace/hyphens
 * are flexible ("Acme Corp" matches "AcmeCorp", "acme-corp", "ACME  CORP"),
 * and matches must not be embedded inside a longer alphanumeric token.
 */
function brandPattern(name: string): RegExp | null {
  const core = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("[\\s_-]*");
  if (!core) return null;
  return new RegExp(`(?<![a-z0-9])${core}(?![a-z0-9])`, "gi");
}

export interface MentionTarget {
  /** Candidate brand names (company name + variants). */
  brandNames?: string[];
  /** The customer's domain (matched including subdomains). */
  domain?: string | null;
}

/** Detect brand mentions in an answer, returning count + evidence snippet. */
export function detectMention(answerText: string, target: MentionTarget): MentionEvidence {
  if (!answerText.trim()) return { mentioned: false, count: 0, context: null };

  const patterns: RegExp[] = [];
  for (const name of target.brandNames ?? []) {
    const pattern = brandPattern(name);
    if (pattern) patterns.push(pattern);
  }
  if (target.domain) {
    try {
      const domain = normalizeDomain(target.domain);
      // Full domain (e.g. "acme.io") — matches URLs and bare hostnames as-is.
      patterns.push(new RegExp(`(?<![a-z0-9])${escapeRegExp(domain)}(?![a-z0-9])`, "gi"));
    } catch {
      // Invalid domain: skip the domain variants, brand names still apply.
    }
  }
  if (patterns.length === 0 && !target.domain) return { mentioned: false, count: 0, context: null };

  // The domain's bare label ("acme" from "acme.io") is matched ONLY when it
  // reads like a proper-noun brand reference:
  // - not inside a hostname/path ("industry-week.example" is a URL fragment,
  //   not a brand mention — the full-domain pattern above covers real URLs);
  // - not a lowercase prose usage ("for example" must never count as a brand
  //   mention — mention evidence is the product's core claim, so we prefer a
  //   missed casual reference over a fabricated one). Explicit brand names
  //   (brandNames) are unaffected: those are intentional signals.
  const labelPatterns: RegExp[] = [];
  if (target.domain) {
    try {
      const label = normalizeDomain(target.domain).split(".")[0];
      if (label && label.length >= 3) {
        labelPatterns.push(
          new RegExp(`(?<![a-z0-9])${escapeRegExp(label)}(?![a-z0-9])`, "gi")
        );
      }
    } catch {
      // covered above — label variants are optional
    }
  }

  let count = 0;
  let firstIndex = -1;
  const recordMatch = (index: number) => {
    count++;
    if (firstIndex === -1 || index < firstIndex) firstIndex = index;
  };
  for (const pattern of patterns) {
    for (const match of answerText.matchAll(pattern)) {
      recordMatch(match.index ?? Infinity);
    }
  }
  for (const pattern of labelPatterns) {
    for (const match of answerText.matchAll(pattern)) {
      const index = match.index ?? 0;
      const matched = match[0];
      const before = index > 0 ? answerText[index - 1] : "";
      const after = answerText[index + matched.length] ?? "";
      // Inside a hostname/path ("industry-week.example") → URL fragment, not
      // a brand reference. Lowercase prose ("for example") → not a brand
      // reference either; matched[0] is a lowercase letter only when it has
      // different upper/lower case (digits/symbols are treated as neutral).
      if (before === "." || before === "/") continue;
      // "example.com" starting the label match: the full-domain pattern
      // already counts it — don't double-count the same mention.
      if (after === ".") continue;
      if (
        matched[0] === matched[0]?.toLowerCase() &&
        matched[0] !== matched[0]?.toUpperCase()
      ) {
        continue;
      }
      recordMatch(index);
    }
  }
  if (count === 0 || firstIndex === -1) return { mentioned: false, count: 0, context: null };

  const start = Math.max(0, firstIndex - CONTEXT_RADIUS);
  const end = Math.min(answerText.length, firstIndex + MAX_CONTEXT_CHARS - CONTEXT_RADIUS);
  const context = answerText
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTEXT_CHARS);
  // Matching is case-insensitive (patterns are built with the "gi" flags).
  return { mentioned: true, count, context: context.length > 0 ? context : null };
}

export interface ExtractedUrl {
  url: string;
  domain: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/**
 * Extract URLs that appear inside the answer TEXT. These are "extracted
 * URLs" — NEVER counted as provider citations (that provenance is stored
 * separately with kind='extracted').
 */
export function extractUrlsFromAnswer(answerText: string, limit = 10): ExtractedUrl[] {
  const seen = new Set<string>();
  const extracted: ExtractedUrl[] = [];
  if (!answerText.trim()) return extracted;

  for (const rawMatch of answerText.matchAll(URL_PATTERN)) {
    if (extracted.length >= limit) break;
    const candidate = rawMatch[0].replace(TRAILING_PUNCTUATION, "");
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    // Canonicalize (strip www) so the same page never appears twice.
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!url.hostname) continue;
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    extracted.push({ url: normalized, domain: url.hostname });
  }
  return extracted;
}

/** True when host is domain or a subdomain of it (both normalized). */
export function domainMatches(host: string, domain: string): boolean {
  const normalize = (value: string): string => value.trim().toLowerCase().replace(/^www\./, "");
  const h = normalize(host);
  const d = normalize(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

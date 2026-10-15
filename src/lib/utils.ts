import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class name combiner (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Convert an arbitrary string into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalize a user-supplied hostname/URL to a bare registrable domain.
 * Throws for values that are not plausible domains — used inside Zod
 * transforms so invalid input never reaches the database.
 */
export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Domain is required");
  }
  let host = trimmed;
  if (host.includes("://")) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      throw new Error("Enter a valid domain, for example example.com");
    }
  } else {
    // Strip a path or credentials the user may have pasted.
    host = host.split("/")[0]?.split("@").pop() ?? host;
    // Strip port.
    host = host.split(":")[0] ?? host;
  }
  host = host.replace(/^www\./, "");
  const domainPattern =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!domainPattern.test(host)) {
    throw new Error("Enter a valid domain, for example example.com");
  }
  return host;
}

/** Derive a display name from a domain: "acme.io" -> "Acme". */
export function domainToDisplayName(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Validate a post-login redirect target to prevent open-redirect attacks.
 * Only same-origin relative paths are allowed.
 */
export function safeCallbackUrl(url: string | null | undefined, fallback = "/dashboard"): string {
  if (!url) return fallback;
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return fallback;
  }
  return url;
}

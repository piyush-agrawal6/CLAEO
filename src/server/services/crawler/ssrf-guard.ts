import { promises as dns } from "dns";
import { isBlockedHostname, isBlockedIp, isIpLiteral } from "@/server/services/crawler/ip-rules";

/**
 * SSRF guard: every URL the crawler fetches MUST pass through
 * {@link assertSafeUrl} first — including each redirect hop.
 *
 * Policy:
 *  1. only http/https on default ports (80/443)
 *  2. no localhost-style hostnames
 *  3. IP literals are checked against the blocklist directly
 *  4. hostnames are resolved via DNS FIRST and every resolved address must
 *     be a public IP (a hostname that resolves to *any* private address is
 *     refused, even if it also resolves publicly)
 *
 * Known limitation (documented in docs/ONBOARDING.md): the fetch itself
 * re-resolves DNS, so a hostile authoritative server could in theory rebind
 * between check and fetch. Redirect hops are always re-validated, which
 * keeps the practical exposure minimal for this phase.
 */

export type LookupFn = (hostname: string) => Promise<string[]>;

/** Policy violation — the URL must not be fetched. */
export class SsrfBlockedError extends Error {
  readonly target: string;
  readonly reason: string;

  constructor(target: string, reason: string) {
    super(`Blocked URL ${target}: ${reason}`);
    this.name = "SsrfBlockedError";
    this.target = target;
    this.reason = reason;
  }
}

/** Default DNS lookup: all addresses for the hostname (A + AAAA). */
export const defaultLookup: LookupFn = async (hostname) => {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => entry.address);
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
/** "" means the scheme default (80 for http, 443 for https). */
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/**
 * Validates a URL against the SSRF policy. Resolves with the parsed URL on
 * success; throws {@link SsrfBlockedError} when the URL must not be fetched
 * (including when DNS cannot confirm the host is public).
 */
export async function assertSafeUrl(
  rawUrl: string | URL,
  lookup: LookupFn = defaultLookup
): Promise<URL> {
  let url: URL;
  try {
    url = typeof rawUrl === "string" ? new URL(rawUrl) : new URL(rawUrl.toString());
  } catch {
    throw new SsrfBlockedError(String(rawUrl), "not a valid absolute URL");
  }

  const display = url.toString();

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(display, `protocol ${url.protocol} is not allowed (http/https only)`);
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SsrfBlockedError(display, `port ${url.port || "(default)"} is not allowed (80/443 only)`);
  }

  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(display, "localhost-style hostnames are not allowed");
  }

  // IP literal: no DNS needed — check the address directly.
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(bare)) {
    if (isBlockedIp(bare)) {
      throw new SsrfBlockedError(display, `${bare} is a private or reserved address`);
    }
    return url;
  }

  // Hostname: DNS pre-check. Verification failure = refusal.
  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new SsrfBlockedError(display, `could not resolve ${hostname} (DNS failure)`);
  }
  if (addresses.length === 0) {
    throw new SsrfBlockedError(display, `DNS returned no addresses for ${hostname}`);
  }
  for (const address of addresses) {
    if (!isIpLiteral(address)) {
      throw new SsrfBlockedError(display, `DNS returned an invalid address for ${hostname}`);
    }
    if (isBlockedIp(address)) {
      throw new SsrfBlockedError(
        display,
        `${hostname} resolves to private or reserved address ${address}`
      );
    }
  }
  return url;
}

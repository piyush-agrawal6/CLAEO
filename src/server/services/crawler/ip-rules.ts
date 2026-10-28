import { isIP } from "net";

/**
 * IP classification rules for the SSRF guard.
 *
 * The safe default is "block": only addresses we can positively confirm as
 * PUBLIC internet addresses may be fetched. That covers the classic SSRF
 * targets:
 *  - loopback (127.0.0.0/8, ::1)             → the host machine itself
 *  - RFC1918 private ranges                   → internal networks
 *  - link-local (169.254.0.0/16, fe80::/10)   → includes cloud metadata
 *    endpoints such as 169.254.169.254
 *  - CGNAT (100.64.0.0/10)                    → includes 100.100.100.200
 *  - multicast/reserved/broadcast             → not fetchable endpoints
 *  - IPv4-mapped IPv6 (::ffff:a.b.c.d)        → checked against the v4 rules
 */

/** Returns true when the IPv4 literal is private/reserved/unusable. */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    if (value > 255) return false;
    octets.push(value);
  }
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // 10.0.0.0/8 — private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 — benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 — TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 — TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

/** Extracts the embedded IPv4 from a mapped IPv6 form, if any. */
function mappedIpv4(ip: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (dotted) return dotted[1] ?? null;
  // Hex-pair form: ::ffff:7f00:1 → 127.0.0.1
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const high = parseInt(hex[1]!, 16);
    const low = parseInt(hex[2]!, 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return null;
}

/** Returns true when the IPv6 literal is private/reserved/unusable. */
export function isPrivateIpv6(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "").split("%")[0]?.toLowerCase() ?? "";
  if (!bare.includes(":")) return false;

  const mapped = mappedIpv4(bare);
  if (mapped) return isPrivateIpv4(mapped);

  if (bare === "::" || bare === "::1") return true; // unspecified + loopback
  if (/^f[cd]/.test(bare)) return true; // fc00::/7 — unique local
  if (/^fe[89ab]/.test(bare)) return true; // fe80::/10 — link-local
  if (/^ff/.test(bare)) return true; // ff00::/8 — multicast
  return false;
}

/**
 * True when an IP literal must NOT be fetched.
 * Unparseable input counts as blocked (safe default).
 */
export function isBlockedIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const version = isIP(bare);
  if (version === 4) return isPrivateIpv4(bare);
  if (version === 6) return isPrivateIpv6(bare);
  return true; // not a valid IP literal → refuse
}

/** True when the value is an IPv4 or IPv6 literal. */
export function isIpLiteral(value: string): boolean {
  return isIP(value.replace(/^\[|\]$/g, "")) !== 0;
}

/**
 * Fast-path hostname refusals (checked before any DNS work).
 * Localhost-style names are never legitimate crawl targets.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  return host === "localhost" || host.endsWith(".localhost");
}

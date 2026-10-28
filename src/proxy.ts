import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * Request interceptor (Next.js 16 "proxy" convention, formerly middleware).
 *
 * Responsibilities:
 * 1. Nonce-based Content-Security-Policy for every HTML document. Next.js
 *    picks up the `x-nonce` request header and applies the nonce to its own
 *    inline scripts automatically.
 * 2. Fast redirects for protected page routes when unauthenticated.
 *
 * NOTE: this is defense in depth. Every server action / route handler still
 * performs its own authorization checks — the proxy alone is never trusted
 * for data security.
 */

const PROTECTED_PATHS = [
  "/dashboard",
  "/onboarding",
  "/domains",
  "/settings",
  "/admin",
  "/action-center",
  "/prompts",
  "/competitors",
  "/citations",
  "/site-audit",
  "/analytics",
] as const;

/** Auth pages that redirect already-signed-in users to the dashboard. */
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function buildCsp(nonce: string, isProduction: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // 'unsafe-inline' for style tags emitted by Next.js/Tailwind; scripts
    // stay nonce-locked above.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isProduction
      ? "connect-src 'self'"
      : "connect-src 'self' ws: http://localhost:* ws://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  return auth(async (req) => {
    const nonce = randomBytes(16).toString("base64");
    const isProduction = process.env.NODE_ENV === "production";

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("Content-Security-Policy", buildCsp(nonce, isProduction));

    const { pathname, search } = req.nextUrl;
    const hasSession = Boolean(req.auth?.user?.id);

    // Protected pages require a session (page layouts re-verify deeply).
    if (!hasSession && isProtectedPath(pathname)) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    // Signed-in users skip the auth pages.
    if (hasSession && isAuthPage(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return response;
    // `ctx` is required by next-auth's handler signature; route params do
    // not apply to the proxy, so an empty context is passed.
  })(request, { params: Promise.resolve({}) });
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and files that set their own
     * caching/headers.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};

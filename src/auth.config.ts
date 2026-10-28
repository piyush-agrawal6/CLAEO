import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js configuration shared between the full server config (`src/auth.ts`)
 * and the request interceptor (`src/proxy.ts`).
 *
 * - JWT sessions (required for the credentials provider).
 * - Custom pages so brand and copy stay consistent.
 * - `trustHost` so Vercel deployment URLs are honored (verified against
 *   AUTH_URL/origin checks elsewhere; tokens are single-use and hashed).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
    // Brand-new OAuth users land here (Auth.js `pages.newUser`), preserving
    // the original destination as `?callbackUrl=` for post-setup resume.
    newUser: "/onboarding",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  providers: [],
  callbacks: {
    /**
     * Verified-email gate — runs BEFORE any database write in the OAuth
     * flow (`@auth/core` calls this prior to `handleLoginOrRegister`).
     *
     * Google's raw OIDC profile carries `email_verified`; we only allow a
     * Google sign-in when it is strictly `true`. This is what makes the
     * per-provider `allowDangerousEmailAccountLinking` option safe: by
     * the time Auth.js considers linking an existing email/password
     * account to the Google profile, the email is guaranteed provider-
     * verified. Non-Google providers and the credentials flow are
     * unaffected (they do their own verification upstream).
     */
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const raw = profile as typeof profile & { email_verified?: unknown } | undefined;
        return raw?.email_verified === true;
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.sessionVersion = (token.sessionVersion as number) ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

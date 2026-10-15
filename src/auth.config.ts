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
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  providers: [],
  callbacks: {
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

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { createQuerysideAdapter } from "@/auth-adapter";
import { getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { verifyPassword } from "@/lib/security/password";
import { findUserByEmail } from "@/server/repositories/user-repository";

/**
 * Auth.js (next-auth v5) server configuration.
 *
 * - Credentials provider: email + password, bcrypt-verified, email must be
 *   verified before a session is issued.
 * - Optional Google OAuth (enabled only when credentials are configured).
 * - JWT sessions (30 days); `sessionVersion` in the token allows global
 *   invalidation after a password reset.
 */

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * Whether the Google provider can actually start a sign-in. The UI shows
 * the "Continue with Google" button unconditionally; without credentials
 * the attempt fails fast with a friendly `/login?error=Configuration`.
 */
export { googleConfigured as googleAuthConfigured };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The adapter manages OAuth accounts/sessions tables; credentials logins
  // use JWTs and do not write session rows. Without a configured database
  // (e.g. during builds) the adapter is simply not attached.
  //
  // `createQuerysideAdapter` wraps it so OAuth provisioning (user + account
  // + workspace + owner membership) happens in ONE transaction — see
  // `src/auth-adapter.ts`.
  adapter: env.DATABASE_URL
    ? createQuerysideAdapter(
        DrizzleAdapter(getDb(), {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
        })
      )
    : undefined,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          logger.warn("Credentials login rejected: malformed input");
          return null;
        }

        const user = await findUserByEmail(parsed.data.email);
        if (!user?.passwordHash) {
          // Constant-ish behavior for unknown users.
          return null;
        }

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) {
          logger.info("Credentials login rejected: bad password", { userId: user.id });
          return null;
        }

        if (!user.emailVerified) {
          logger.info("Credentials login rejected: email not verified", { userId: user.id });
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    ...(googleConfigured
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Account linking (documented in docs/GOOGLE_OAUTH.md):
            // Auth.js's default refuses to link a Google profile to an
            // existing email/password account (OAuthAccountNotLinked).
            // We enable linking here because the shared `signIn` callback
            // in `auth.config.ts` has ALREADY required Google's
            // `email_verified === true` on the raw OIDC profile before
            // handle-login ever reads this flag — linking happens only
            // for provider-verified emails, never on client claims.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
});

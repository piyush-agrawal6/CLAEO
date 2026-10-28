import type { Adapter, AdapterUser } from "next-auth/adapters";
import { provisionGoogleAccount } from "@/server/services/oauth-provisioning-service";

/**
 * Auth.js adapter wrapper that makes OAuth provisioning transactional.
 *
 * `@auth/core` `handle-login` for a brand-new OAuth user always calls
 * `createUser(profile)` immediately followed by `linkAccount(account)`
 * (with only our own `events` in between — we subscribe to none). We use
 * that ordering:
 *
 * - `createUser` persists NOTHING. It returns a stub whose generated id
 *   becomes `token.sub`; if `linkAccount` never runs (or fails), no rows
 *   exist — the sign-in simply fails and can be retried.
 * - `linkAccount` performs the single write transaction (user + account +
 *   workspace + owner membership), reconstructing the identity from the
 *   Google `id_token` on the account.
 *
 * For an existing user being linked (verified Google email matching an
 * email/password account), Auth.js skips `createUser` and calls
 * `linkAccount` directly — the service detects the existing user and only
 * attaches the provider account (never a duplicate user or workspace).
 *
 * Every other adapter method passes through to the Drizzle adapter
 * unchanged (email-verification/password-reset token tables, account
 * lookups, token updates...).
 */
export function createQuerysideAdapter(base: Adapter): Adapter {
  return {
    ...base,
    async createUser(profile: AdapterUser): Promise<AdapterUser> {
      if (!profile.email) {
        throw new Error("OAuth sign-in failed: the provider returned no email address.");
      }
      const id = crypto.randomUUID();
      return {
        ...profile,
        // Deliberately NOT persisted here — `linkAccount` writes the user
        // row from the verified identity token. The id must be ours, not
        // the provider's subject, because user ids are provider-independent.
        id,
        emailVerified: null,
      };
    },
    async linkAccount(account) {
      await provisionGoogleAccount(account);
      return account;
    },
  };
}

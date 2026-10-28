import { and, eq } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import { accounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { logger } from "@/lib/logging/logger";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import {
  defaultWorkspaceName,
  uniqueSlug,
  withSlugCollisionRetry,
} from "@/server/services/user-service";

/**
 * Transactional provisioning for OAuth (Google) sign-ins.
 *
 * Auth.js `handle-login` sequence for a brand-new OAuth user is always:
 *
 *   1. `adapter.createUser(profile)`  — we return a NON-PERSISTING stub
 *      whose id becomes the session subject (`token.sub`)
 *   2. `adapter.linkAccount(account)` — this service runs ONE transaction:
 *      user + provider account + default workspace + owner membership
 *
 * Because nothing is written in step 1, a failure in step 2 leaves no
 * partial state: the sign-in fails cleanly and can be retried.
 *
 * For an EXISTING user (email/password account linking the same verified
 * Google email), step 2 only attaches the provider account — no second
 * user or workspace is ever created.
 *
 * Verified-email policy: the Google identity is trusted ONLY when the
 * `id_token` claims say `email_verified === true`, and the token subject
 * must match the provider account id. The Auth.js `signIn` callback gates
 * the same claim on the raw profile before this code runs; the checks are
 * repeated here so the invariant holds even if the callback changes.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Shape of the account object Auth.js passes to `adapter.linkAccount`. */
export interface OAuthAccountInput {
  userId: string;
  type?: string | null;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface GoogleIdentity {
  /** Google's subject identifier — validated against `providerAccountId`. */
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface ProvisionGoogleAccountResult {
  userId: string;
  workspaceId: string | null;
  /** True when this call created the QuerySide user. */
  isNewUser: boolean;
  /** True when this call attached Google to an existing user. */
  linked: boolean;
}

/**
 * Decode + validate the Google identity carried by the OAuth `id_token`.
 *
 * The token arrives from Auth.js's code-for-token exchange with Google
 * over TLS — the same claims the `signIn` callback already inspected.
 * We decode (no JWKS fetch) and enforce:
 *   - a well-formed three-segment JWT payload
 *   - `sub === providerAccountId` (token/account binding)
 *   - a present, valid email
 *   - `email_verified === true` (strict boolean)
 */
export function decodeGoogleIdentity(account: OAuthAccountInput): GoogleIdentity {
  const token = account.id_token;
  if (!token) {
    throw new Error(
      `Google sign-in failed: identity token missing for provider account ${account.providerAccountId}.`
    );
  }

  const segments = token.split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new Error(
      `Google sign-in failed: identity token is malformed for provider account ${account.providerAccountId}.`
    );
  }

  let claims: Record<string, unknown>;
  try {
    const payload = Buffer.from(segments[1], "base64url").toString("utf8");
    claims = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Google sign-in failed: identity token payload could not be parsed for provider account ${account.providerAccountId}.`
    );
  }

  const sub = claims.sub;
  if (typeof sub !== "string" || sub !== account.providerAccountId) {
    throw new Error(
      "Google sign-in failed: identity token subject does not match the provider account."
    );
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) {
    throw new Error(
      "Google sign-in failed: the identity token contains no email address."
    );
  }

  if (claims.email_verified !== true) {
    throw new Error(
      "Google sign-in failed: Google did not mark this email address as verified."
    );
  }

  return {
    sub,
    email,
    name: typeof claims.name === "string" ? claims.name : null,
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
}

async function insertAccountRow(
  tx: Tx,
  account: OAuthAccountInput,
  userId: string
): Promise<void> {
  await tx.insert(accounts).values({
    userId,
    type: account.type ?? "oauth",
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refresh_token ?? null,
    access_token: account.access_token ?? null,
    expires_at: account.expires_at ?? null,
    token_type: account.token_type ?? null,
    scope: account.scope ?? null,
    id_token: account.id_token ?? null,
    session_state: account.session_state ?? null,
  });
}

async function createDefaultWorkspace(
  tx: Tx,
  userId: string,
  naming: { workspaceName: string; slug: string }
): Promise<string> {
  const [workspace] = await tx
    .insert(workspaces)
    .values({
      name: naming.workspaceName,
      slug: naming.slug,
      ownerId: userId,
      plan: "free",
    })
    .returning();
  if (!workspace) throw new Error("Workspace insert returned no row");

  await tx.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  return workspace.id;
}

/**
 * Persist a Google sign-in. Runs user, provider account, workspace and
 * membership writes in a SINGLE transaction; see module docstring for the
 * branch behavior (new user vs. linking an existing account).
 */
export async function provisionGoogleAccount(
  account: OAuthAccountInput
): Promise<ProvisionGoogleAccountResult> {
  const identity = decodeGoogleIdentity(account);
  const email = identity.email;

  // Workspace naming is resolved BEFORE the transactions (same pattern as
  // credentials signup): drizzle serializes queries per database session,
  // so an external query issued while a transaction is open would
  // deadlock. The slug is only used on paths that actually create a
  // workspace; a precomputed-but-unused slug costs one SELECT.
  const workspaceName = defaultWorkspaceName(email);
  const baseSlug = await uniqueSlug(workspaceName);

  const db = getDb();
  // Each attempt runs a FULL provisioning transaction; a slug collision
  // rolls it back entirely and the next attempt retries with the next
  // candidate slug (bounded — see `withSlugCollisionRetry`).
  const result = await withSlugCollisionRetry(baseSlug, async (slug) => {
    const naming = { workspaceName, slug };
    return db.transaction(async (tx): Promise<ProvisionGoogleAccountResult> => {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        // Linking an existing QuerySide account (e.g. email/password user
        // signing in with Google for the first time). Auth.js derived the
        // user id from the same email lookup — if the two ever disagree,
        // abort rather than attach the account to the wrong user.
        if (existingUser.id !== account.userId) {
          throw new Error(
            "Google sign-in failed: provider account does not match the target user."
          );
        }

        const [attached] = await tx
          .select({ userId: accounts.userId })
          .from(accounts)
          .where(
            and(
              eq(accounts.provider, account.provider),
              eq(accounts.providerAccountId, account.providerAccountId)
            )
          )
          .limit(1);
        if (attached) {
          // Already linked (idempotent re-entry) — nothing to do.
          const [membership] = await tx
            .select({ workspaceId: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.userId, existingUser.id))
            .limit(1);
          return {
            userId: existingUser.id,
            workspaceId: membership?.workspaceId ?? null,
            isNewUser: false,
            linked: false,
          };
        }

        await insertAccountRow(tx, account, existingUser.id);

        // Defensive heal: existing users always get a workspace at signup,
        // but never create a second one if membership already exists.
        const [membership] = await tx
          .select({ workspaceId: workspaceMembers.workspaceId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.userId, existingUser.id))
          .limit(1);
        const workspaceId =
          membership?.workspaceId ??
          (await createDefaultWorkspace(tx, existingUser.id, naming));

        return { userId: existingUser.id, workspaceId, isNewUser: false, linked: true };
      }

      // Brand-new Google user: one transaction for all four rows. The id
      // comes from the stub returned by our wrapped `createUser` so the
      // session subject (`token.sub`) matches the persisted user.
      const [user] = await tx
        .insert(users)
        .values({
          id: account.userId,
          name: identity.name,
          email,
          emailVerified: new Date(),
          image: identity.picture,
          passwordHash: null,
        })
        .returning();
      if (!user) throw new Error("Google sign-in failed: user insert returned no row.");

      await insertAccountRow(tx, account, user.id);
      const workspaceId = await createDefaultWorkspace(tx, user.id, naming);

      return { userId: user.id, workspaceId, isNewUser: true, linked: false };
    });
  });

  logger.info("Google account provisioned", {
    userId: result.userId,
    workspaceId: result.workspaceId,
    provider: account.provider,
    isNewUser: result.isNewUser,
    linked: result.linked,
  });

  if (result.isNewUser) {
    await recordAuditLog({
      userId: result.userId,
      workspaceId: result.workspaceId,
      action: "auth.oauth_signup",
      targetType: "user",
      targetId: result.userId,
      metadata: { provider: account.provider },
    }).catch(() => undefined);
  } else if (result.linked) {
    await recordAuditLog({
      userId: result.userId,
      workspaceId: result.workspaceId,
      action: "auth.account_linked",
      targetType: "user",
      targetId: result.userId,
      metadata: { provider: account.provider },
    }).catch(() => undefined);
  }

  return result;
}

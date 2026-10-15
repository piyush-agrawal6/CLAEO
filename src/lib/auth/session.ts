import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { AuthenticationError } from "@/lib/errors";
import {
  findUserById,
  type UserRow,
} from "@/server/repositories/user-repository";
import {
  getMembershipForUser,
  type MembershipWithWorkspace,
} from "@/server/repositories/workspace-repository";

/**
 * Session/authorization helpers.
 *
 * The JWT is only a starting point: every page/action that touches data
 * re-reads the user from the database and verifies:
 *  - the user still exists
 *  - the email is verified
 *  - the session version matches (password reset invalidates old sessions)
 *
 * Workspace resources are then always accessed through the membership
 * lookup below — never with an ID supplied by the client.
 */

export interface UserContext {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  sessionVersion: number;
}

function toUserContext(user: UserRow): UserContext {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified !== null,
    sessionVersion: user.sessionVersion,
  };
}

/** Returns the verified, live user for the current request, or null. */
export async function getUserContext(): Promise<UserContext | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return null;

  const user = await findUserById(sessionUserId);
  if (!user) return null;
  if (!user.emailVerified) return null;
  if (user.sessionVersion !== (session.user.sessionVersion ?? 0)) return null;
  return toUserContext(user);
}

/** Throwing variant for server actions and API routes. */
export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) {
    throw new AuthenticationError("You must be signed in to continue.");
  }
  return context;
}

export interface PageAuthContext {
  user: UserContext;
  membership: MembershipWithWorkspace | null;
}

/**
 * Page-level guard (layouts/pages). Redirects instead of throwing:
 * - no session  -> /login (with callbackUrl)
 * - unverified  -> /verify-email
 * - revoked     -> sign out, then /login
 */
export async function requirePageAuth(): Promise<PageAuthContext> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    await signOut({ redirect: false });
    redirect("/login");
  }

  if (!user.emailVerified) {
    redirect("/verify-email");
  }

  if (user.sessionVersion !== (session.user.sessionVersion ?? 0)) {
    await signOut({ redirect: false });
    redirect("/login");
  }

  const membership = await getMembershipForUser(user.id);
  return { user: toUserContext(user), membership };
}

/** Like {@link requirePageAuth} but guarantees a workspace membership. */
export async function requirePageWorkspace(): Promise<
  { user: UserContext; membership: MembershipWithWorkspace }
> {
  const context = await requirePageAuth();
  if (!context.membership) {
    // Should not happen (workspace is created at signup); fail explicitly.
    throw new AuthenticationError("No workspace is associated with this account.");
  }
  return { user: context.user, membership: context.membership };
}

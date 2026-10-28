import type { OAuthAccountInput } from "@/server/services/oauth-provisioning-service";

/**
 * Test-only fixtures for OAuth provisioning. Real Google round-trips never
 * run in CI — these build the exact shapes Auth.js produces after its
 * (mocked in tests) code-for-token exchange.
 */

export interface GoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}

/** Three-segment JWT whose middle segment base64url-decodes to `claims`. */
export function makeGoogleIdToken(claims: GoogleClaims): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

export function makeGoogleAccount(
  overrides: Partial<OAuthAccountInput> & { providerAccountId: string }
): OAuthAccountInput {
  return {
    userId: overrides.userId ?? crypto.randomUUID(),
    type: "oauth",
    provider: "google",
    id_token: overrides.id_token ?? null,
    ...overrides,
  };
}

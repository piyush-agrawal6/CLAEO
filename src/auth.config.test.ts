import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

/**
 * The verified-email gate. This callback runs BEFORE any Auth.js database
 * write in the OAuth flow — its result decides whether Google linking is
 * allowed at all (see docs/GOOGLE_OAUTH.md).
 */

type SignInParams = Parameters<NonNullable<NonNullable<typeof authConfig.callbacks>["signIn"]>>[0];
const signIn = authConfig.callbacks!.signIn!;

function googleParams(profile: Record<string, unknown> | undefined): SignInParams {
  return {
    user: { id: "u1", email: "person@gmail.com" },
    account: { provider: "google", providerAccountId: "sub-1", type: "oauth", userId: "u1" },
    profile,
  } as unknown as SignInParams;
}

function credentialsParams(): SignInParams {
  return {
    user: { id: "u2", email: "person@example.com" },
    account: { provider: "credentials", providerAccountId: "credentials", type: "credentials", userId: "u2" },
    credentials: { email: "person@example.com" },
    profile: undefined,
  } as unknown as SignInParams;
}

describe("authConfig.callbacks.signIn (Google verified-email gate)", () => {
  it("allows Google when the provider reports email_verified strictly true", async () => {
    await expect(signIn(googleParams({ email: "person@gmail.com", email_verified: true }))).resolves.toBe(
      true
    );
  });

  it("blocks Google when email_verified is false", async () => {
    await expect(signIn(googleParams({ email: "person@gmail.com", email_verified: false }))).resolves.toBe(
      false
    );
  });

  it("blocks Google when the claim is absent", async () => {
    await expect(signIn(googleParams({ email: "person@gmail.com" }))).resolves.toBe(false);
    await expect(signIn(googleParams(undefined))).resolves.toBe(false);
  });

  it("blocks non-boolean lookalikes (no loose truthiness)", async () => {
    await expect(signIn(googleParams({ email_verified: "true" }))).resolves.toBe(false);
    await expect(signIn(googleParams({ email_verified: 1 }))).resolves.toBe(false);
  });

  it("leaves the credentials flow and non-Google providers alone", async () => {
    await expect(signIn(credentialsParams())).resolves.toBe(true);
    await expect(
      signIn({
        ...googleParams(undefined),
        account: { provider: "some-other-oidc", providerAccountId: "x", type: "oidc", userId: "u1" },
      } as unknown as SignInParams)
    ).resolves.toBe(true);
  });
});

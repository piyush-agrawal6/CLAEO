import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { safeCallbackUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
    verified?: string;
    error?: string;
  }>;
}

const errorMessages: Record<string, string> = {
  VerificationLinkInvalid: "That verification link is no longer valid.",
  OAuthAccountNotLinked: "That sign-in method is not linked to your account.",
  AccessDenied:
    "Google could not confirm a verified email address for this account. Try signing up with email instead.",
  Configuration:
    "Sign-in with Google is not available right now. Use your email and password instead.",
  RateLimited: "Too many sign-in attempts. Please wait a moment and try again.",
  OAuthCallback: "There was a problem completing Google sign-in. Please try again.",
  default: "We could not sign you in. Please try again.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const notice = params.verified
    ? "Your email is verified. Sign in to continue."
    : undefined;

  const authError = params.error
    ? (errorMessages[params.error] ?? errorMessages.default)
    : undefined;

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to your QuerySide workspace.
        </p>
      </div>

      <LoginForm
        callbackUrl={safeCallbackUrl(params.callbackUrl)}
        notice={notice ?? authError}
      />
    </>
  );
}

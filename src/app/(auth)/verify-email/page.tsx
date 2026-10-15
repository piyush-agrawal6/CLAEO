import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircleIcon, MailCheckIcon } from "lucide-react";
import { Alert } from "@/components/common/alert";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { Button } from "@/components/ui/button";
import { verifyEmailAction } from "@/features/auth/actions";

export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false, follow: false },
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; email?: string; error?: string }>;
}

const errorMessages: Record<string, string> = {
  expired: "This verification link is invalid or has expired. Request a new one below.",
  invalid: "This verification link is malformed. Request a new one below.",
  rate_limited: "Too many attempts. Please wait a moment before trying again.",
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, email, error } = await searchParams;
  const errorMessage = error ? (errorMessages[error] ?? errorMessages.invalid) : null;

  if (token && email) {
    return (
      <>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
          <p className="text-muted-foreground text-sm">
            Confirm {email} to activate your account.
          </p>
        </div>

        {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

        <form action={verifyEmailAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />
          <Button type="submit" className="w-full">
            <MailCheckIcon className="size-4" />
            Confirm email address
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Wrong account?{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            Use a different email
          </Link>
        </p>
      </>
    );
  }

  // No token: instruction + resend form.
  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-muted-foreground text-sm">
          We sent you a verification link. Click it to activate your account.
        </p>
      </div>

      {errorMessage ? (
        <Alert variant="error">
          <span className="flex items-start gap-2">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorMessage}
          </span>
        </Alert>
      ) : null}

      <ResendVerificationForm defaultEmail={email} />
    </>
  );
}

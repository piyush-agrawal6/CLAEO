import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
        </div>
        <Alert variant="error">
          This reset link is missing its token. Request a new link to continue.
        </Alert>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-muted-foreground text-sm">
          Choose a strong password you have not used before.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </>
  );
}

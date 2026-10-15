import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we will send you a reset link.
        </p>
      </div>

      <ForgotPasswordForm />
    </>
  );
}

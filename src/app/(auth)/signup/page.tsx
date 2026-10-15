import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Create your workspace
        </h1>
        <p className="text-muted-foreground text-sm">
          Start with a free workspace. No credit card required.
        </p>
      </div>

      <SignupForm />
    </>
  );
}

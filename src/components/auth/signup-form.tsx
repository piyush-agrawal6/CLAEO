"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/common/alert";
import { AuthDivider, GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/features/auth/actions";
import { initialAuthFormState } from "@/features/auth/schemas";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialAuthFormState);

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert variant={state.devAutoVerified ? "info" : "success"}>{state.message}</Alert>
        {state.devAutoVerified ? (
          <Button asChild className="w-full">
            <Link href="/login">Continue to sign in</Link>
          </Button>
        ) : (
          <p className="text-muted-foreground text-center text-sm">
            Wrong email?{" "}
            <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
              Try a different one
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.message ? <Alert variant="error">{state.message}</Alert> : null}

      <GoogleAuthButton />
      <AuthDivider label="or create account with email" />

      <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
        />
        {state.fieldErrors?.name ? (
          <p id="name-error" className="text-destructive text-xs">
            {state.fieldErrors.name[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-destructive text-xs">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-destructive text-xs">
            {state.fieldErrors.password[0]}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      </form>
    </div>
  );
}

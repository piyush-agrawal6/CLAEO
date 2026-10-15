"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/features/auth/actions";
import { initialAuthFormState } from "@/features/auth/schemas";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialAuthFormState
  );

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert variant="success">{state.message}</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Alert variant="error">{state.message}</Alert> : null}

      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-xs">{state.fieldErrors.password[0]}</p>
        ) : (
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

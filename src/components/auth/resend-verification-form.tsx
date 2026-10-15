"use client";

import { useActionState } from "react";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendVerificationAction } from "@/features/auth/actions";
import { initialAuthFormState } from "@/features/auth/schemas";

/** Re-request a verification email (rate-limited server-side). */
export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState(
    resendVerificationAction,
    initialAuthFormState
  );

  if (state.status === "success") {
    return <Alert variant="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Alert variant="error">{state.message}</Alert> : null}

      <div className="space-y-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail ?? state.email}
        />
      </div>

      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
    </form>
  );
}

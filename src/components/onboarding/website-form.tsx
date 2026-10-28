"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addWebsiteAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add website"}
    </Button>
  );
}

/** Step 1: add the website that onboarding builds everything else on. */
export function WebsiteForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(addWebsiteAction, initialOnboardingActionState);
  const domainError = state.fieldErrors?.domain?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Carried through so a deep link survives the whole wizard. */}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="onboarding-domain">Website URL or domain</Label>
        <Input
          id="onboarding-domain"
          name="domain"
          placeholder="https://example.com"
          autoComplete="url"
          required
          aria-invalid={Boolean(domainError)}
          aria-describedby={domainError ? "onboarding-domain-error" : undefined}
        />
        {domainError ? (
          <p id="onboarding-domain-error" className="text-destructive text-xs">
            {domainError}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

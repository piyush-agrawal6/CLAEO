"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { skipStepAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";
import { useActionState } from "react";

const SKIP_LABELS: Record<string, string> = {
  analyzing: "Skip analysis — enter details manually",
  business: "Skip for now",
  competitors: "Continue without competitors",
  queries: "Finish without selecting queries",
};

/** Manual fallback control: advances onboarding without the current step's data. */
export function SkipStepButton({
  step,
  callbackUrl,
  variant = "ghost",
}: {
  step: "analyzing" | "business" | "competitors" | "queries";
  callbackUrl: string;
  variant?: "ghost" | "outline";
}) {
  const [state, formAction, pending] = useActionState(
    skipStepAction,
    initialOnboardingActionState
  );
  const { pending: formPending } = useFormStatus();

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" variant={variant} disabled={pending || formPending}>
        {SKIP_LABELS[step]}
      </Button>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-destructive text-xs">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { startAnalysisAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";
import { SkipStepButton } from "@/components/onboarding/skip-step-button";

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Analyzing…" : "Analyze website"}
    </Button>
  );
}

/**
 * Step 2: run the SSRF-guarded crawl. Shows the persisted error from a
 * previous attempt (honest failure) and always offers the manual fallback.
 */
export function AnalysisStep({
  domainId,
  domainLabel,
  callbackUrl,
  maxPages,
  previousError,
}: {
  domainId: string;
  domainLabel: string;
  callbackUrl: string;
  maxPages: number;
  previousError: string | null;
}) {
  const [state, formAction] = useActionState(startAnalysisAction, initialOnboardingActionState);

  return (
    <div className="space-y-4">
      <Alert variant="info">
        We&apos;ll read up to {maxPages} public pages of{" "}
        <span className="font-medium">{domainLabel}</span> to draft your business profile.
        Only your own site is fetched — private and internal addresses are always refused.
      </Alert>

      {previousError ? (
        <Alert variant="error">
          Last attempt: {previousError} You can retry, or skip analysis and set up manually.
        </Alert>
      ) : null}

      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction} className="inline-flex">
          <input type="hidden" name="domainId" value={domainId} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <AnalyzeButton />
        </form>
        <SkipStepButton step="analyzing" callbackUrl={callbackUrl} variant="outline" />
      </div>
    </div>
  );
}

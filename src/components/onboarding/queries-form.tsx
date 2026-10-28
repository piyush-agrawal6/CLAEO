"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/common/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveQueriesAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";
import type { QuerySuggestion } from "@/server/services/discovery/inference";

function priorityVariant(priority: "LOW" | "MEDIUM" | "HIGH"): "default" | "secondary" | "outline" {
  if (priority === "HIGH") return "default";
  if (priority === "MEDIUM") return "secondary";
  return "outline";
}

function FinishButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Finishing…" : "Save and finish setup"}
    </Button>
  );
}

/**
 * Step 5: query suggestions. Accept any combination and/or write your own.
 * Priorities are the qualitative "QuerySide Priority" — NEVER search volume
 * (we do not have that data, and we never invent it).
 */
export function QueriesForm({
  domainId,
  callbackUrl,
  suggestions,
  mocked,
}: {
  domainId: string;
  callbackUrl: string;
  suggestions: QuerySuggestion[];
  mocked: boolean;
}) {
  const [state, formAction] = useActionState(saveQueriesAction, initialOnboardingActionState);

  return (
    <div className="space-y-4">
      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      {suggestions.length === 0 ? (
        <Alert variant="info">
          No suggestions are available right now — write your own queries below, or finish
          without any. You can add queries any time from the domain overview.
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="domainId" value={domainId} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        {suggestions.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Suggested queries</Label>
              {mocked ? (
                <Badge variant="secondary">Mock AI suggestions — review before tracking</Badge>
              ) : null}
            </div>

            <ul className="space-y-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.text}
                  className="border-border flex items-start gap-3 rounded-md border px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    name="acceptedQuery"
                    value={suggestion.text}
                    defaultChecked
                    className="accent-primary mt-1 size-4 shrink-0"
                    aria-label={`Track "${suggestion.text}"`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{suggestion.text}</span>
                      <Badge variant={priorityVariant(suggestion.priority)}>
                        {suggestion.priority}
                      </Badge>
                      <Badge variant="outline">{suggestion.funnelStage}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">{suggestion.rationale}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-muted-foreground text-xs">
              QuerySide Priority is a qualitative estimate based on buying intent and how
              prominently the term appears on your site — it is not search volume or traffic.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="queries-manual">Add your own queries</Label>
          <Textarea
            id="queries-manual"
            name="manualQuery"
            rows={3}
            placeholder={"One per line, e.g.\nbest product analytics tool\nproduct analytics pricing"}
          />
          <p className="text-muted-foreground text-xs">One per line (up to 30).</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <FinishButton />
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useActionState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCompetitorAction,
  deleteCompetitorAction,
} from "@/features/competitors/actions";
import { initialIntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Competitor management forms (client components). The server action
 * enforces the plan cap and validates the domain; the UI only informs.
 */

export function CompetitorAddForm({ domainId }: { domainId: string }) {
  const [state, formAction, pending] = useActionState(
    createCompetitorAction,
    initialIntelligenceActionState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="domainId" value={domainId} />

      {state.message ? (
        <Alert variant={state.status === "error" ? "error" : "success"}>
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="competitor-name">Name</Label>
          <Input
            id="competitor-name"
            name="name"
            placeholder="e.g. Competitor Inc."
            required
            aria-invalid={Boolean(state.fieldErrors?.name?.length)}
          />
          {state.fieldErrors?.name?.length ? (
            <p className="text-destructive text-xs">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="competitor-domain">Domain</Label>
          <Input
            id="competitor-domain"
            name="domain"
            placeholder="competitor.com"
            autoComplete="url"
            required
            aria-invalid={Boolean(state.fieldErrors?.domain?.length)}
          />
          {state.fieldErrors?.domain?.length ? (
            <p className="text-destructive text-xs">{state.fieldErrors.domain[0]}</p>
          ) : null}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        <PlusIcon aria-hidden />
        {pending ? "Adding…" : "Add competitor"}
      </Button>
    </form>
  );
}

/** Per-row delete with a two-step armed confirmation. */
export function CompetitorRowControls({ competitorId }: { competitorId: string }) {
  const [state, formAction, pending] = useActionState(
    deleteCompetitorAction,
    initialIntelligenceActionState
  );
  const [armed, setArmed] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!armed) {
            event.preventDefault();
            setArmed(true);
          }
        }}
        className="inline-flex"
      >
        <input type="hidden" name="competitorId" value={competitorId} />
        <Button
          type="submit"
          variant={armed ? "destructive" : "ghost"}
          size="sm"
          disabled={pending}
        >
          <Trash2Icon aria-hidden />
          {pending ? "Removing…" : armed ? "Confirm delete" : "Delete"}
        </Button>
        {armed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(false)}>
            Never mind
          </Button>
        ) : null}
      </form>
      {state.status === "error" && state.message ? (
        <Alert variant="error" className="px-2.5 py-1.5 text-xs">
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}

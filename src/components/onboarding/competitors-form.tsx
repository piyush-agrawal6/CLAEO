"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCompetitorsAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save and continue"}
    </Button>
  );
}

interface CompetitorRow {
  name: string;
  domain: string;
}

/**
 * Step 4: competitors. Suggestions are SEARCH QUERIES and CATEGORY hints
 * that help the user find their real competitors — QuerySide never invents
 * company names. Entries are added manually (and may all be left empty).
 */
export function CompetitorsForm({
  domainId,
  callbackUrl,
  categoryHints,
  discoveryQueries,
}: {
  domainId: string;
  callbackUrl: string;
  categoryHints: string[];
  discoveryQueries: string[];
}) {
  const [state, formAction] = useActionState(saveCompetitorsAction, initialOnboardingActionState);
  const [rows, setRows] = useState<CompetitorRow[]>([{ name: "", domain: "" }]);

  const updateRow = (index: number, patch: Partial<CompetitorRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-4">
      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      {categoryHints.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Who you compete with</p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            {categoryHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {discoveryQueries.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Find them with searches like</p>
          <div className="flex flex-wrap gap-2">
            {discoveryQueries.map((query) => (
              <span
                key={query}
                className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs"
              >
                {query}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="domainId" value={domainId} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <div className="space-y-3">
          <Label>Track competitors</Label>
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-2">
              <Input
                name="competitorName"
                value={row.name}
                onChange={(event) => updateRow(index, { name: event.target.value })}
                placeholder="Competitor name"
                aria-label={`Competitor ${index + 1} name`}
                maxLength={80}
              />
              <Input
                name="competitorDomain"
                value={row.domain}
                onChange={(event) => updateRow(index, { domain: event.target.value })}
                placeholder="competitor.com"
                aria-label={`Competitor ${index + 1} domain`}
                maxLength={253}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((current) => [...current, { name: "", domain: "" }])}
            disabled={rows.length >= 20}
          >
            Add another competitor
          </Button>
          <p className="text-muted-foreground text-xs">
            You can continue without adding anyone — competitors can be managed later on the
            domain overview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
        </div>
      </form>
    </div>
  );
}

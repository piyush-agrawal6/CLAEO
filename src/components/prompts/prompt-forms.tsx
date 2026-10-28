"use client";

import { useState, useActionState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createPromptAction,
  deletePromptAction,
  togglePromptAction,
} from "@/features/prompts/actions";
import { initialIntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Prompt management forms (client components — the pages stay server
 * components). The server action is the source of truth for validation
 * and the plan cap; the UI only informs and collects input.
 */

const selectClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function PromptAddForm({ domainId }: { domainId: string }) {
  const [state, formAction, pending] = useActionState(
    createPromptAction,
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

      <div className="space-y-2">
        <Label htmlFor="prompt-text">Question</Label>
        <Textarea
          id="prompt-text"
          name="text"
          placeholder="e.g. Best analytics tool for an early-stage SaaS?"
          required
          aria-invalid={Boolean(state.fieldErrors?.text?.length)}
        />
        {state.fieldErrors?.text?.length ? (
          <p className="text-destructive text-xs">{state.fieldErrors.text[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="prompt-intent">Intent (optional)</Label>
          <select id="prompt-intent" name="intent" defaultValue="" className={selectClassName}>
            <option value="">Not set</option>
            <option value="informational">Informational</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="comparison">Comparison</option>
            <option value="brand">Brand</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-funnel-stage">Funnel stage (optional)</Label>
          <select
            id="prompt-funnel-stage"
            name="funnelStage"
            defaultValue=""
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="awareness">Awareness</option>
            <option value="consideration">Consideration</option>
            <option value="decision">Decision</option>
            <option value="brand">Brand</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-importance">Importance (optional)</Label>
          <select
            id="prompt-importance"
            name="importance"
            defaultValue=""
            className={selectClassName}
          >
            <option value="">Not rated</option>
            <option value="5">5 — must-win</option>
            <option value="4">4 — high</option>
            <option value="3">3 — medium</option>
            <option value="2">2 — low</option>
            <option value="1">1 — lowest</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <PlusIcon aria-hidden />
          {pending ? "Adding…" : "Add prompt"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Priority is a qualitative label you set — it is never search volume
          or traffic.
        </p>
      </div>
    </form>
  );
}

/**
 * Per-row controls: pause/resume (single click) and a two-step armed
 * delete, mirroring the ScanLauncher confirmation pattern.
 */
export function PromptRowControls({
  promptId,
  enabled,
}: {
  promptId: string;
  enabled: boolean;
}) {
  const [toggleState, toggleFormAction, togglePending] = useActionState(
    togglePromptAction,
    initialIntelligenceActionState
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deletePromptAction,
    initialIntelligenceActionState
  );
  const [armed, setArmed] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <form action={toggleFormAction} className="inline-flex">
          <input type="hidden" name="promptId" value={promptId} />
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <Button type="submit" variant="outline" size="sm" disabled={togglePending}>
            {togglePending ? "Updating…" : enabled ? "Pause" : "Resume"}
          </Button>
        </form>
        <form
          action={deleteFormAction}
          onSubmit={(event) => {
            if (!armed) {
              event.preventDefault();
              setArmed(true);
            }
          }}
          className="inline-flex"
        >
          <input type="hidden" name="promptId" value={promptId} />
          <Button
            type="submit"
            variant={armed ? "destructive" : "ghost"}
            size="sm"
            disabled={deletePending}
          >
            <Trash2Icon aria-hidden />
            {deletePending ? "Removing…" : armed ? "Confirm delete" : "Delete"}
          </Button>
          {armed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArmed(false)}
            >
              Never mind
            </Button>
          ) : null}
        </form>
      </div>
      {toggleState.status === "error" && toggleState.message ? (
        <Alert variant="error" className="px-2.5 py-1.5 text-xs">
          {toggleState.message}
        </Alert>
      ) : null}
      {deleteState.status === "error" && deleteState.message ? (
        <Alert variant="error" className="px-2.5 py-1.5 text-xs">
          {deleteState.message}
        </Alert>
      ) : null}
    </div>
  );
}

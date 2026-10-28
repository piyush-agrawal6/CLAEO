"use client";

import { useActionState } from "react";
import { CheckIcon, EyeOffIcon, Undo2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setRecommendationStatusAction } from "@/features/intelligence/actions";
import { initialIntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Recommendation card (deterministic Action Center).
 *
 * All content comes from evidence persisted by a scan — this component only
 * renders it and submits MANUAL status transitions (dismiss / mark done /
 * restore). It never invents or rewrites any claim.
 */

const priorityVariant: Record<
  string,
  "destructive" | "default" | "secondary" | "outline"
> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export interface ActionCardData {
  id: string;
  status: string;
  priority: string;
  category: string;
  title: string;
  explanation: string | null;
  action: string | null;
  impact: number | null;
  effort: string | null;
  promptText: string | null;
  competitorName: string | null;
  evidence: Record<string, unknown> | null;
  updatedAt: Date;
}

export function ActionCard({ item }: { item: ActionCardData }) {
  const [state, formAction, pending] = useActionState(
    setRecommendationStatusAction,
    initialIntelligenceActionState
  );
  const resolved = item.status !== "open";

  return (
    <li className="border-border space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={priorityVariant[item.priority] ?? "secondary"}>
          {item.priority.toUpperCase()}
        </Badge>
        <Badge variant="outline">{item.category.replace("_", " ")}</Badge>
        {resolved ? (
          <Badge variant="secondary">{item.status.replace("_", " ")}</Badge>
        ) : null}
        {item.impact != null ? (
          <span className="text-muted-foreground text-xs">
            estimated impact {item.impact} · effort {item.effort ?? "—"}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{item.title}</p>
        {item.explanation ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {item.explanation}
          </p>
        ) : null}
        {item.action ? (
          <p className="text-sm leading-relaxed">
            <span className="font-medium">What to do: </span>
            {item.action}
          </p>
        ) : null}
      </div>

      {item.evidence && Object.keys(item.evidence).length > 0 ? (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">
            Evidence from the scan
          </summary>
          <pre className="bg-muted/50 mt-2 overflow-x-auto rounded-md p-2.5 leading-relaxed">
            {JSON.stringify(item.evidence, null, 2)}
          </pre>
        </details>
      ) : null}

      {state.message && state.status === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="recommendationId" value={item.id} />
        {resolved ? (
          <Button type="submit" name="status" value="open" variant="outline" size="sm" disabled={pending}>
            <Undo2Icon aria-hidden />
            Reopen
          </Button>
        ) : (
          <>
            <Button type="submit" name="status" value="done" variant="outline" size="sm" disabled={pending}>
              <CheckIcon aria-hidden />
              Mark done
            </Button>
            <Button type="submit" name="status" value="dismissed" variant="ghost" size="sm" disabled={pending}>
              <EyeOffIcon aria-hidden />
              Dismiss
            </Button>
          </>
        )}
      </form>
    </li>
  );
}

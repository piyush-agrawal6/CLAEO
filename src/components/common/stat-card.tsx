import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  /** Display value. Pass "—" when no data exists (never fabricate). */
  value: string;
  /** Optional positive/negative delta. Only render when historical data exists. */
  delta?: string;
  deltaDirection?: "up" | "down";
  hint?: string;
  className?: string;
}

/**
 * Compact metric card for the attention-first dashboard.
 * When `delta` is omitted, no change indicator is drawn at all - fake
 * deltas are a hard no.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaDirection,
  hint,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-card border-border rounded-lg border p-4 shadow-sm",
        className
      )}
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {delta ? (
          <span
            className={cn(
              "text-xs font-medium",
              deltaDirection === "down" ? "text-destructive" : "text-success"
            )}
          >
            {deltaDirection === "down" ? "▼" : "▲"} {delta}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Honest empty state. Used whenever a metric or list has no data — we never
 * fill the gap with fabricated numbers.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

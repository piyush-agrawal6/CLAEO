import { RadarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** App logo mark + wordmark. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
        <RadarIcon className="size-3.5" aria-hidden />
      </span>
      {showWordmark ? (
        <span className="text-md font-semibold tracking-tight">Claeo</span>
      ) : null}
    </span>
  );
}

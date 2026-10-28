import { RadarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * QuerySide logo: mark + wordmark.
 *
 * Wordmark treatment: "Query" in brand orange (#FF6A00 — logotype, exempt
 * from WCAG text contrast requirements), "Side" in the surrounding
 * foreground color. Marketing pages pass `sideClassName="text-ink"` because
 * they render on a fixed warm canvas independent of the dark theme.
 */
export function Logo({
  className,
  showWordmark = true,
  sideClassName,
  wordmarkClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  sideClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md"
      >
        <RadarIcon className="size-3.5" />
      </span>
      {showWordmark ? (
        <span className={cn("text-md font-semibold tracking-tight", wordmarkClassName)}>
          <span className="text-[#ff6a00]">Query</span>
          <span className={cn("text-foreground", sideClassName)}>Side</span>
        </span>
      ) : null}
    </span>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { SampleDataBadge } from "@/components/intelligence/sample-data-badge";

/**
 * Score card — the canonical way to render a scan score.
 *
 * Honesty rules enforced here:
 * - A NULL score renders as "—" with an explicit "not enough data" note —
 *   never a fabricated 0.
 * - Coverage ("N of M observations") is ALWAYS shown next to the score.
 * - The persisted formula version is displayed so historical numbers stay
 *   interpretable.
 * - Mocked data carries a visible "sample data" badge.
 */
export function ScoreCard({
  label,
  score,
  coverageCompleted,
  coverageExpected,
  formulaVersion,
  mocked,
  emptyDescription = "No completed observations yet — run a scan.",
}: {
  label: string;
  score: number | null;
  coverageCompleted: number;
  coverageExpected: number;
  formulaVersion: string | null;
  mocked: boolean;
  emptyDescription?: string;
}) {
  const coverageFull = coverageExpected > 0 && coverageCompleted >= coverageExpected;
  return (
    <Card className="flex-1">
      <CardContent className="space-y-2 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{label}</p>
          {mocked ? <SampleDataBadge /> : null}
        </div>
        {score === null ? (
          <>
            <p className="text-muted-foreground text-lg font-semibold">—</p>
            <p className="text-muted-foreground text-xs">Not enough data.</p>
            <p className="text-muted-foreground text-xs">{emptyDescription}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold tabular-nums">{score}</p>
            <p
              className={
                coverageFull
                  ? "text-muted-foreground text-xs"
                  : "text-amber-700 dark:text-amber-400 text-xs"
              }
            >
              Coverage: {coverageCompleted} of {coverageExpected} observations
              {coverageExpected === 0 ? " (none planned)" : ""}
            </p>
          </>
        )}
        {formulaVersion ? (
          <p className="text-muted-foreground text-xs">Formula: {formulaVersion}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

/**
 * Mock-provider transparency.
 *
 * `SampleDataBadge` marks ANY row or card that came from a mock provider.
 * `MockModeBanner` is rendered at the top of intelligence pages while the
 * environment runs with mock providers — everything shown is labeled sample
 * data and no provider credits are spent.
 */

export function SampleDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      sample data
    </Badge>
  );
}

export function MockModeBanner() {
  if (!env.NEXT_PUBLIC_MOCK_MODE) return null;
  return (
    <div
      role="status"
      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg border px-4 py-3 text-sm"
    >
      <span className="font-medium">Mock providers active.</span> Every score,
      keyword, ranking and AI answer on this environment is clearly-labeled
      sample data — no provider credits are spent and no real search or AI
      service is queried.
    </div>
  );
}

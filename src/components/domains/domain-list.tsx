import { GlobeIcon, Trash2Icon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteDomainAction } from "@/features/domains/actions";
import type { Domain } from "@/lib/db/schema";

const statusVariant: Record<string, "success" | "secondary" | "warning"> = {
  ready: "success",
  analyzing: "warning",
  pending: "secondary",
  error: "warning",
};

const statusLabel: Record<string, string> = {
  ready: "Ready",
  analyzing: "Analyzing",
  pending: "Pending analysis",
  error: "Error",
};

/**
 * Domain list. Server component; deletion is a server action bound per row.
 */
export function DomainList({ domains }: { domains: Domain[] }) {
  if (domains.length === 0) {
    return (
      <EmptyState
        icon={GlobeIcon}
        title="No domains yet"
        description="Add your company domain to start tracking how your brand appears in AI answers."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-border divide-y px-0 py-0">
        {domains.map((domain) => (
          <div
            key={domain.id}
            className="flex items-center justify-between gap-4 px-6 py-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{domain.normalizedDomain}</p>
              <p className="text-muted-foreground truncate text-xs">
                {domain.name ?? domain.domain} · added{" "}
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(domain.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant={statusVariant[domain.status] ?? "secondary"}>
                {statusLabel[domain.status] ?? domain.status}
              </Badge>
              <form action={deleteDomainAction}>
                <input type="hidden" name="id" value={domain.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${domain.normalizedDomain}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ListChecksIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MockModeBanner, SampleDataBadge } from "@/components/intelligence/sample-data-badge";
import { PromptAddForm, PromptRowControls } from "@/components/prompts/prompt-forms";
import {
  getPrimaryDomain,
  getPromptsWithStatus,
  type PromptWithStatus,
} from "@/features/intelligence/queries";
import { requirePageWorkspace } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/usage/limits";

export const metadata: Metadata = {
  title: "Tracked prompts",
};

/** Qualitative importance label (>=4 HIGH, >=2 MEDIUM, else LOW) — no metrics. */
function priorityBadge(importance: number | null): {
  label: string;
  variant: "default" | "secondary" | "outline";
} | null {
  if (importance === null) return null;
  if (importance >= 4) return { label: "HIGH", variant: "default" };
  if (importance >= 2) return { label: "MEDIUM", variant: "secondary" };
  return { label: "LOW", variant: "outline" };
}

/** Mention status from the latest scan (null = not observed). */
function mentionBadge(lastMentioned: boolean | null): {
  label: string;
  variant: "success" | "warning" | "outline";
} {
  if (lastMentioned === true) return { label: "mentioned", variant: "success" };
  if (lastMentioned === false) return { label: "absent", variant: "warning" };
  return { label: "not observed", variant: "outline" };
}

/**
 * Tracked prompts: the questions checked on every scan. The plan cap is
 * enforced by the create action — this page only states it.
 */
export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ domainId?: string }>;
}) {
  const { domainId: domainIdParam } = await searchParams;
  const { membership } = await requirePageWorkspace();
  const domain = await getPrimaryDomain(membership.workspace.id, domainIdParam);

  if (!domain) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Tracked prompts"
          description="The exact questions your buyers ask AI engines and search. Each scan checks whether your brand appears in the answers."
        />
        <MockModeBanner />
        <EmptyState
          icon={ListChecksIcon}
          title="Add a domain first"
          description="Prompts are tracked per domain. Add your domain, then the questions you want every scan to check."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/domains">Add a domain</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const limits = getPlanLimits(membership.workspace.plan);
  const { prompts, latestScan } = await getPromptsWithStatus(
    membership.workspace.id,
    domain.id
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tracked prompts"
        description="The exact questions your buyers ask AI engines and search. Each scan checks whether your brand appears in the answers."
      />
      <MockModeBanner />

      {/* Add prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlusIcon className="size-4" aria-hidden /> Add a prompt
          </CardTitle>
          <CardDescription>
            Your plan tracks up to {limits.prompts} prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PromptAddForm domainId={domain.id} />
        </CardContent>
      </Card>

      {/* Tracked list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecksIcon className="size-4" aria-hidden /> Your prompts
          </CardTitle>
          <CardDescription>
            {latestScan ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                Status from the scan of{" "}
                {latestScan.createdAt.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {latestScan.mocked ? <SampleDataBadge /> : null}
              </span>
            ) : (
              "No scan has run yet — mention status appears after the first scan."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prompts.length > 0 ? (
            <ul className="divide-border divide-y">
              {prompts.map((prompt: PromptWithStatus) => {
                const priority = priorityBadge(prompt.importance);
                const mention = mentionBadge(prompt.lastMentioned);
                return (
                  <li
                    key={prompt.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{prompt.text}</p>
                      {(prompt.intent || prompt.funnelStage) && (
                        <p className="text-muted-foreground text-xs">
                          {prompt.intent ?? "intent not set"} ·{" "}
                          {prompt.funnelStage ?? "stage not set"}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {priority ? (
                        <Badge variant={priority.variant}>{priority.label}</Badge>
                      ) : (
                        <Badge variant="outline">Unrated</Badge>
                      )}
                      <Badge variant={mention.variant}>{mention.label}</Badge>
                      {!prompt.enabled ? (
                        <Badge variant="secondary">paused</Badge>
                      ) : null}
                    </div>
                    <PromptRowControls
                      promptId={prompt.id}
                      enabled={prompt.enabled}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ListChecksIcon}
              title="No prompts tracked yet"
              description="Add the questions your buyers actually type into AI engines and search — every scan will check whether your brand appears in the answers."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

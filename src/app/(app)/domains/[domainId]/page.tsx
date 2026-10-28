import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActivityIcon,
  Building2Icon,
  ListChecksIcon,
  PlayIcon,
  UsersIcon,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { analyzeDomainAction } from "@/features/domains/actions";
import { requirePageWorkspace } from "@/lib/auth/session";
import { getDomainById } from "@/server/repositories/domain-repository";
import {
  getBusinessProfile,
  listCompetitors,
  listPrompts,
} from "@/server/repositories/discovery-repository";
import { getLatestCrawlJob, listSitePages } from "@/server/repositories/onboarding-repository";
import type { Prompt } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Domain overview",
};

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

/** QuerySide Priority from the discovery importance (5/3/1) — no metrics. */
function priorityBadge(importance: number | null): { label: string; variant: "default" | "secondary" | "outline" } | null {
  if (importance === null) return null;
  if (importance >= 4) return { label: "HIGH", variant: "default" };
  if (importance >= 2) return { label: "MEDIUM", variant: "secondary" };
  return { label: "LOW", variant: "outline" };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="px-4 py-3.5">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Domain overview: business profile, competitors, tracked queries and the
 * crawl summary for one workspace domain. Every count is factual; empty
 * sections stay empty (no fabricated filler).
 */
export default async function DomainOverviewPage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = await params;
  const { membership } = await requirePageWorkspace();

  const domain = await getDomainById(membership.workspace.id, domainId);
  if (!domain) notFound();

  const [profile, competitorRows, promptRows, job] = await Promise.all([
    getBusinessProfile(membership.workspace.id),
    listCompetitors(domain.id),
    listPrompts(domain.id),
    getLatestCrawlJob(domain.id),
  ]);
  const pages = job ? await listSitePages(job.id) : [];
  const readPages = pages.filter((page) => !page.error);

  const setupHref = `/onboarding?callbackUrl=${encodeURIComponent(`/domains/${domain.id}`)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={domain.normalizedDomain}
        description={`Overview for ${domain.domain} — profile, competitors and tracked queries.`}
      />

      <div className="flex flex-wrap gap-3">
        <Badge variant={statusVariant[domain.status] ?? "secondary"}>
          {statusLabel[domain.status] ?? domain.status}
        </Badge>
        <StatCard label="Queries tracked" value={String(promptRows.length)} />
        <StatCard label="Competitors" value={String(competitorRows.length)} />
        <StatCard
          label="Pages analyzed"
          value={job ? `${readPages.length}${job.pagesCrawled > readPages.length ? ` of ${job.pagesCrawled}` : ""}` : "—"}
        />
      </div>

      {/* Business profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2Icon className="size-4" aria-hidden /> Business profile
          </CardTitle>
          <CardDescription>
            {profile
              ? profile.source === "crawl"
                ? "Drafted from your site crawl — still awaiting your confirmation."
                : "Confirmed by you."
              : "Used to shape competitor and query suggestions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-base font-medium">{profile.name}</p>
                {profile.tagline ? (
                  <p className="text-muted-foreground text-sm">{profile.tagline}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.industry ? <Badge variant="secondary">{profile.industry}</Badge> : null}
                  {profile.audience ? <Badge variant="outline">{profile.audience}</Badge> : null}
                </div>
              </div>
              {profile.description ? (
                <p className="text-sm leading-relaxed">{profile.description}</p>
              ) : null}
              {profile.products.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Products / services</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.products.map((product) => (
                      <Badge key={product} variant="outline">
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={Building2Icon}
              title="No business profile yet"
              description="Finish the setup flow to describe your business — suggestions get much sharper once this exists."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={setupHref}>Open setup</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Competitors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4" aria-hidden /> Competitors
          </CardTitle>
          <CardDescription>
            Domains you chose to track against {domain.normalizedDomain}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {competitorRows.length > 0 ? (
            <ul className="divide-border divide-y">
              {competitorRows.map((competitor) => (
                <li key={competitor.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{competitor.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {competitor.normalizedDomain}
                    </p>
                  </div>
                  <Badge variant="outline">tracked</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="No competitors tracked yet"
              description="Competitors are added during setup — QuerySide never invents company names for you."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={setupHref}>Open setup</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Tracked queries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecksIcon className="size-4" aria-hidden /> Tracked queries
          </CardTitle>
          <CardDescription>
            QuerySide Priority is qualitative (buying intent + prominence on your site) — it
            is not search volume or traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {promptRows.length > 0 ? (
            <ul className="divide-border divide-y">
              {promptRows.map((prompt: Prompt) => {
                const priority = priorityBadge(prompt.importance);
                return (
                  <li key={prompt.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{prompt.text}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {prompt.intent ?? "intent not set"} · {prompt.funnelStage ?? "stage not set"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {priority ? (
                        <Badge variant={priority.variant}>{priority.label}</Badge>
                      ) : (
                        <Badge variant="outline">Unrated</Badge>
                      )}
                      {prompt.source === "generated" ? (
                        <Badge variant="secondary">suggested</Badge>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ListChecksIcon}
              title="No queries tracked yet"
              description="Queries added during setup appear here with their QuerySide Priority."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={setupHref}>Open setup</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Crawl summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="size-4" aria-hidden /> Site analysis
          </CardTitle>
          <CardDescription>
            {job
              ? `Last crawl ${job.status === "completed" ? "finished" : "ended"} ${job.finishedAt?.toUTCString() ?? "—"}.`
              : "No crawl has run for this domain yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {job ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{job.status}</Badge>
                <Badge variant="outline">{job.pagesCrawled} pages fetched</Badge>
                <Badge variant="outline">
                  {(job.bytesFetched / 1024).toFixed(0)} KB read
                </Badge>
                <Badge variant="outline">{((job.durationMs ?? 0) / 1000).toFixed(1)}s</Badge>
                <Badge variant="outline">cap {job.maxPages} pages</Badge>
                {job.pagesBlocked > 0 ? (
                  <Badge variant="warning">{job.pagesBlocked} URLs refused (safety checks)</Badge>
                ) : null}
              </div>

              {job.error ? (
                <p className="text-destructive text-sm" role="alert">
                  {job.error}
                </p>
              ) : null}

              {readPages.length > 0 ? (
                <ul className="divide-border divide-y text-sm">
                  {readPages.slice(0, 10).map((page) => (
                    <li key={page.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{page.title ?? "(no title)"}</p>
                        <p className="text-muted-foreground truncate text-xs">{page.url}</p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {page.statusCode ?? "—"}
                      </span>
                    </li>
                  ))}
                  {readPages.length > 10 ? (
                    <li className="text-muted-foreground py-2 text-xs">
                      …and {readPages.length - 10} more pages
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={PlayIcon}
              title="No analysis yet"
              description="Run a crawl to read this site's public pages and refresh its status."
            />
          )}

          <form action={analyzeDomainAction}>
            <input type="hidden" name="id" value={domain.id} />
            <Button type="submit" variant="outline" size="sm">
              {job ? "Re-run analysis" : "Run analysis"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

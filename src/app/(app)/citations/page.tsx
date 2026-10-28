import type { Metadata } from "next";
import Link from "next/link";
import { QuoteIcon } from "lucide-react";
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
import {
  getCitationsForScan,
  getLatestScan,
  getPrimaryDomain,
  type CitationRow,
} from "@/features/intelligence/queries";
import { requirePageWorkspace } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Citations",
};

/** One recorded URL. Rendered as a plain external link — never fetched by us. */
function CitationItem({ row }: { row: CitationRow }) {
  return (
    <li className="py-2.5">
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="block truncate text-sm font-medium underline-offset-4 hover:underline"
      >
        {row.url}
      </a>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={row.kind === "provider" ? "default" : "outline"}>
          {row.kind}
        </Badge>
        <Badge variant="secondary">{row.engineKey}</Badge>
        {row.kind === "provider" && row.position != null ? (
          <span className="text-muted-foreground">position {row.position}</span>
        ) : null}
        {row.isOwnedDomain ? <Badge variant="success">owned domain</Badge> : null}
        {row.isCompetitorDomain ? <Badge variant="warning">competitor</Badge> : null}
        {row.promptText ? (
          <span className="text-muted-foreground max-w-72 truncate">
            “{row.promptText}”
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Citations page — what AI answers actually link to.
 *
 * Honesty rules baked into this page: provider citations (engine-declared)
 * are counted separately from URLs merely found inside answer prose, and
 * only the former can ever contribute to citation share. The server never
 * fetches any of these URLs; they are rendered as plain anchor tags.
 */
export default async function CitationsPage({
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
          title="Citations"
          description="What AI answers link to — provider citations and URLs extracted from answer text."
        />
        <MockModeBanner />
        <EmptyState
          icon={QuoteIcon}
          title="Add a domain first"
          description="Citations are collected per domain during a scan. Add your domain first."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/domains">Add a domain</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const latestScan = await getLatestScan(membership.workspace.id, domain.id);

  if (!latestScan) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Citations"
          description="What AI answers link to — provider citations and URLs extracted from answer text."
        />
        <MockModeBanner />
        <EmptyState
          icon={QuoteIcon}
          title="No scan yet"
          description="No scan yet — run an intelligence scan to collect citations."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Go to the dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const citationRows =
    (await getCitationsForScan(membership.workspace.id, domain.id, latestScan.id)) ?? [];
  const providerRows = citationRows.filter((row) => row.kind === "provider");
  const extractedRows = citationRows.filter((row) => row.kind === "extracted");
  const ownedCount = citationRows.filter((row) => row.isOwnedDomain).length;
  const competitorCount = citationRows.filter((row) => row.isCompetitorDomain).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Citations"
        description="What AI answers link to — provider citations and URLs extracted from answer text."
        actions={latestScan.mocked ? <SampleDataBadge /> : undefined}
      />
      <MockModeBanner />

      {/* Summary — factual counts from this scan only */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{citationRows.length} total</Badge>
        <Badge variant="outline">{providerRows.length} provider</Badge>
        <Badge variant="outline">{extractedRows.length} extracted</Badge>
        <Badge variant="outline">{ownedCount} on your domain</Badge>
        <Badge variant="outline">{competitorCount} on competitor domains</Badge>
      </div>

      {/* Honesty copy: extracted links are NOT citation share */}
      <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
        Provider citations are only recorded when an AI engine returns them
        with its answer. Currently no supported engine returns inline
        citations, so URLs found inside answer text are listed as
        &ldquo;extracted&rdquo; — plain links in prose, never counted as
        citation share.
      </p>

      {/* Provider citations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QuoteIcon className="size-4" aria-hidden /> Provider citations
          </CardTitle>
          <CardDescription>
            Citations the engine itself declared alongside its answer. Only
            these can contribute to citation share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providerRows.length > 0 ? (
            <ul className="divide-border divide-y">
              {providerRows.map((row, index) => (
                <CitationItem key={`${row.url}-${index}`} row={row} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={QuoteIcon}
              title="No provider citations"
              description="No provider citations were returned by any engine for this scan."
            />
          )}
        </CardContent>
      </Card>

      {/* Extracted URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">URLs extracted from answers</CardTitle>
          <CardDescription>
            Plain links found inside answer text. Listed for reference only —
            never counted as citation share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extractedRows.length > 0 ? (
            <ul className="divide-border divide-y">
              {extractedRows.map((row, index) => (
                <CitationItem key={`${row.url}-${index}`} row={row} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={QuoteIcon}
              title="No URLs extracted"
              description="No answer in this scan contained a plain URL, or no answers were collected."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

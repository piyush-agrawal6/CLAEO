import {
  CheckCircle2Icon,
  CircleIcon,
  GlobeIcon,
  LineChartIcon,
  MailWarningIcon,
  RadarIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardOverview } from "@/features/dashboard/queries";
import { requirePageWorkspace } from "@/lib/auth/session";

export const metadata = {
  title: "Overview",
};

/**
 * Attention-first dashboard.
 *
 * Rules:
 * - every number comes from a real query
 * - metrics without data show "—" plus an explicit hint, never a made-up
 *   score or delta
 * - the checklist reflects actual workspace state
 */
export default async function DashboardPage() {
  const { membership } = await requirePageWorkspace();
  const overview = await getDashboardOverview(membership.workspace.id);

  const checklist = [
    {
      title: "Add your company domain",
      description: "The foundation for every scan, audit and recommendation.",
      done: overview.domainCount > 0,
      href: "/domains",
      cta: "Add domain",
    },
    {
      title: "Analyze your website (onboarding)",
      description:
        "Automatic business analysis, competitor suggestions and prompt discovery.",
      done: overview.readyDomainCount > 0,
      comingSoon: true,
    },
    {
      title: "Run your first AI visibility scan",
      description:
        "See how ChatGPT, Perplexity and Gemini answer questions about your market.",
      done: overview.completedRunCount > 0,
      comingSoon: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="What requires your attention right now."
      />

      {/* Metrics: honest empty states until real data exists */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI Visibility"
          value="—"
          hint={
            overview.completedRunCount > 0
              ? "Calculating from your latest scans…"
              : "Available after your first visibility scan."
          }
        />
        <StatCard
          label="Google Visibility"
          value="—"
          hint="Connect Google Search Console to unlock this metric."
        />
        <StatCard
          label="Critical Fixes"
          value="—"
          hint="Appears after your first site audit."
        />
        <StatCard
          label="Lost Opportunities"
          value="—"
          hint="Appears once tracked prompts have scan data."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Getting started */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Get started</CardTitle>
            <CardDescription>
              {overview.domainCount > 0
                ? "Your workspace is set up. The remaining steps land in the upcoming phases."
                : "Three steps to your first AI visibility report."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {checklist.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {item.done ? (
                      <CheckCircle2Icon className="text-success size-5" aria-hidden />
                    ) : (
                      <CircleIcon className="text-muted-foreground/50 size-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.comingSoon ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Next phases
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {item.description}
                    </p>
                  </div>
                  {item.href && !item.done ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={item.href}>{item.cta}</Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Biggest opportunity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TargetIcon className="text-primary size-4" aria-hidden />
              Biggest opportunity
            </CardTitle>
            <CardDescription>
              The single highest-impact action for your visibility.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={SparklesIcon}
              title="No data yet"
              description="Once a scan runs, your most valuable missing keyword opportunity appears here with competitor evidence and a recommended fix."
            />
          </CardContent>
        </Card>
      </div>

      {/* Context strip */}
      <div className="text-muted-foreground grid gap-3 text-xs sm:grid-cols-3">
        <p className="flex items-center gap-1.5">
          <GlobeIcon className="size-3.5" aria-hidden />
          {overview.domainCount} domain{overview.domainCount === 1 ? "" : "s"} tracked
        </p>
        <p className="flex items-center gap-1.5">
          <RadarIcon className="size-3.5" aria-hidden />
          {overview.completedRunCount} completed scan
          {overview.completedRunCount === 1 ? "" : "s"}
          {overview.lastRunAt
            ? ` · last ${overview.lastRunAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ""}
        </p>
        <p className="flex items-center gap-1.5">
          <LineChartIcon className="size-3.5" aria-hidden />
          {overview.promptCount} tracked prompt{overview.promptCount === 1 ? "" : "s"}
        </p>
      </div>

      {overview.domainCount === 0 ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <MailWarningIcon className="size-3.5" aria-hidden />
          Tip: add your domain to prepare for onboarding in the next phase.
        </div>
      ) : null}
    </div>
  );
}

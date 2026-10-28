import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { AnalysisStep } from "@/components/onboarding/analysis-step";
import { BusinessForm } from "@/components/onboarding/business-form";
import { CompetitorsForm } from "@/components/onboarding/competitors-form";
import { QueriesForm } from "@/components/onboarding/queries-form";
import { WebsiteForm } from "@/components/onboarding/website-form";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageWorkspace } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { domainToDisplayName, safeCallbackUrl } from "@/lib/utils";
import { getDomainById } from "@/server/repositories/domain-repository";
import { getBusinessProfile } from "@/server/repositories/discovery-repository";
import { getLatestCrawlJob } from "@/server/repositories/onboarding-repository";
import {
  inferCompetitorAssist,
  inferQuerySuggestions,
  type QuerySuggestion,
} from "@/server/services/discovery/inference";
import {
  getOnboardingView,
  isOnboardingComplete,
  type OnboardingView,
} from "@/server/services/onboarding-service";
import type { Industry } from "@/server/services/discovery/fixtures";
import type { OnboardingStep } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Set up",
  robots: { index: false, follow: false },
};

interface OnboardingPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

const STEP_ORDER: Array<Extract<OnboardingStep, "website" | "analyzing" | "business" | "competitors" | "queries">> = [
  "website",
  "analyzing",
  "business",
  "competitors",
  "queries",
];

const STEP_LABELS: Record<string, string> = {
  website: "Website",
  analyzing: "Analyze",
  business: "Business",
  competitors: "Competitors",
  queries: "Queries",
};

const STEP_HEADERS: Record<string, { title: string; description: string }> = {
  website: {
    title: "Set up QuerySide",
    description: "Add your website to see how AI engines answer questions about your market.",
  },
  analyzing: {
    title: "Analyze your website",
    description: "We draft your business profile from your own public pages.",
  },
  business: {
    title: "Your business profile",
    description: "Confirm what you do and who you serve — everything stays editable.",
  },
  competitors: {
    title: "Your competitors",
    description: "Track the companies your customers compare you against.",
  },
  queries: {
    title: "Suggested queries",
    description: "Pick the questions you want QuerySide to watch on your behalf.",
  },
};

/** Compact, honest stepper — reflects only persisted state. */
function OnboardingStepper({ view }: { view: OnboardingView }) {
  const currentIndex = STEP_ORDER.indexOf(view.step as (typeof STEP_ORDER)[number]);
  return (
    <ol className="text-muted-foreground flex flex-wrap gap-2 text-xs" aria-label="Setup progress">
      {STEP_ORDER.map((step, index) => {
        const done = view.completedSteps.includes(step) || (currentIndex >= 0 && index < currentIndex);
        const current = view.step === step;
        return (
          <li
            key={step}
            className={
              current
                ? "bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium"
                : done
                  ? "bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1"
                  : "border-border inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1"
            }
            aria-current={current ? "step" : undefined}
          >
            {done && !current ? <CheckIcon className="size-3" aria-hidden /> : null}
            {STEP_LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}

function StepShell({
  view,
  children,
}: {
  view: OnboardingView;
  children: React.ReactNode;
}) {
  const header = STEP_HEADERS[view.step] ?? STEP_HEADERS.website!;
  return (
    <div className="space-y-6">
      <PageHeader title={header.title} description={header.description} />
      <OnboardingStepper view={view} />
      {children}
    </div>
  );
}

/**
 * Resumable setup wizard: website → analyze → business → competitors →
 * queries. The current step comes from persisted state (server-side only);
 * every step has a manual fallback so a failed crawl or inference never
 * blocks the user. Already-complete workspaces pass straight through.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = await searchParams;
  const { user } = await requirePageWorkspace();

  const view = await getOnboardingView(user.id);
  if (!view) redirect("/login");

  // "" fallback = "no deep link", so completion lands on the new domain's
  // overview (completionDestination) rather than the dashboard.
  const callbackUrl = safeCallbackUrl(params.callbackUrl, "");
  // Complete workspaces (persisted `completed`, or legacy: any domain) pass
  // straight through to their destination — same rule as auth redirects.
  if (await isOnboardingComplete(user.id)) {
    redirect(callbackUrl || "/dashboard");
  }

  const domain = view.domainId
    ? await getDomainById(view.workspaceId, view.domainId)
    : null;

  // ---------------------------------------------------------------------
  // Step 1: website
  // ---------------------------------------------------------------------
  if (view.step === "website" || !domain) {
    return (
      <StepShell view={{ ...view, step: "website" }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">First step: add your website</CardTitle>
            <CardDescription>
              Your domain is the foundation for business discovery, competitor suggestions and
              tracked prompts. Setup is resumable — you can leave and come back at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WebsiteForm callbackUrl={callbackUrl} />
            <div>
              <Button variant="outline" asChild>
                <Link href={callbackUrl || "/dashboard"}>
                  {callbackUrl ? "Skip for now" : "Go to dashboard"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </StepShell>
    );
  }

  // ---------------------------------------------------------------------
  // Step 2: analyze
  // ---------------------------------------------------------------------
  if (view.step === "analyzing") {
    const job = await getLatestCrawlJob(domain.id);
    return (
      <StepShell view={view}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analyze {domain.normalizedDomain}</CardTitle>
            <CardDescription>
              A lightweight crawl reads your public pages (capped at {env.CRAWLER_MAX_PAGES}{" "}
              pages, {Math.round(env.CRAWLER_MAX_BYTES_PER_PAGE / 1024)} KB per page and{" "}
              {Math.round(env.CRAWLER_MAX_DURATION_MS / 1000)} seconds total).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalysisStep
              domainId={domain.id}
              domainLabel={domain.normalizedDomain}
              callbackUrl={callbackUrl}
              maxPages={env.CRAWLER_MAX_PAGES}
              previousError={job?.status === "failed" ? job.error : null}
            />
          </CardContent>
        </Card>
      </StepShell>
    );
  }

  // ---------------------------------------------------------------------
  // Step 3: business profile
  // ---------------------------------------------------------------------
  if (view.step === "business") {
    const profile = await getBusinessProfile(view.workspaceId);
    return (
      <StepShell view={view}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business profile</CardTitle>
            <CardDescription>
              This is what QuerySide uses to suggest competitors and queries. Nothing is
              published — it only shapes your own suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessForm
              domainId={domain.id}
              callbackUrl={callbackUrl}
              prefill={
                profile
                  ? {
                      name: profile.name,
                      tagline: profile.tagline ?? "",
                      description: profile.description ?? "",
                      industry: profile.industry ?? "other",
                      audience: profile.audience ?? "",
                      products: profile.products.join("\n"),
                      source: profile.source,
                    }
                  : null
              }
              suggestionUnavailable={!profile}
            />
          </CardContent>
        </Card>
      </StepShell>
    );
  }

  const profile = await getBusinessProfile(view.workspaceId);
  const assistIndustry = (profile?.industry as Industry | null) ?? "other";
  const assistKeywords = profile?.keywords ?? [];

  // ---------------------------------------------------------------------
  // Step 4: competitors
  // ---------------------------------------------------------------------
  if (view.step === "competitors") {
    let assist = { discoveryQueries: [] as string[], categoryHints: [] as string[] };
    let mocked = false;
    try {
      const result = await inferCompetitorAssist(view.workspaceId, {
        industry: assistIndustry,
        keywords: assistKeywords,
      });
      assist = result.data;
      mocked = result.mocked;
    } catch {
      assist = { discoveryQueries: [], categoryHints: [] };
    }
    return (
      <StepShell view={view}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitors</CardTitle>
            <CardDescription>
              QuerySide never guesses company names.
              {mocked ? " Suggestions below come from local mock fixtures." : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompetitorsForm
              domainId={domain.id}
              callbackUrl={callbackUrl}
              categoryHints={assist.categoryHints}
              discoveryQueries={assist.discoveryQueries}
            />
          </CardContent>
        </Card>
      </StepShell>
    );
  }

  // ---------------------------------------------------------------------
  // Step 5: query suggestions
  // ---------------------------------------------------------------------
  let suggestions: QuerySuggestion[] = [];
  let mocked = false;
  try {
    const result = await inferQuerySuggestions(view.workspaceId, {
      brand: profile?.name ?? domainToDisplayName(domain.normalizedDomain),
      industry: assistIndustry,
      keywords: assistKeywords,
    });
    mocked = result.mocked;
    suggestions = result.data.queries;
  } catch {
    suggestions = [];
  }

  return (
    <StepShell view={view}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queries to track</CardTitle>
          <CardDescription>
            Accepted suggestions and your own queries are saved to {domain.normalizedDomain}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueriesForm
            domainId={domain.id}
            callbackUrl={callbackUrl}
            suggestions={suggestions}
            mocked={mocked}
          />
        </CardContent>
      </Card>
    </StepShell>
  );
}

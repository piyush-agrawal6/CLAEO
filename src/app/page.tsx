import {
  ArrowRightIcon,
  BarChart3Icon,
  BotIcon,
  FileSearchIcon,
  QuoteIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: BotIcon,
    title: "AI visibility tracking",
    description:
      "See whether ChatGPT, Perplexity, Gemini and other AI engines mention your brand - and where you rank when they do.",
  },
  {
    icon: TargetIcon,
    title: "Tell me what to do next",
    description:
      "A prioritized Action Center: the highest-impact fix first, with the competitor evidence behind every recommendation.",
  },
  {
    icon: QuoteIcon,
    title: "Citation intelligence",
    description:
      "Discover which sources AI engines cite in your market, and where your brand is missing from those sources.",
  },
  {
    icon: FileSearchIcon,
    title: "Page-level AEO audits",
    description:
      "Rule-based audits that score every page for answer extractability, entity clarity and agent accessibility.",
  },
  {
    icon: BarChart3Icon,
    title: "SEO + AI in one product",
    description:
      "Search Console data and AI-answer visibility side by side, so classic SEO and AEO stop living in separate tools.",
  },
];

const steps = ["Discover", "Measure", "Diagnose", "Recommend"];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Marketing" className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <Badge variant="secondary" className="mb-4">
              AI Search Visibility Optimization
            </Badge>
            <h1 className="mx-auto max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              Know exactly where AI loses your brand - and what to fix first.
            </h1>
            <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-pretty text-base sm:text-lg">
              Claeo tracks how ChatGPT, Perplexity, Gemini and other AI engines
              answer questions about your market, then turns every visibility gap
              into a prioritized action.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Start free
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>

            {/* How it works */}
            <ol className="mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="border-border rounded-lg border px-3 py-3 text-left"
                >
                  <span className="text-primary text-xs font-semibold">
                    0{index + 1}
                  </span>
                  <p className="text-sm font-medium">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight">
            Not another dashboard full of charts
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Most AEO tools tell you <em>how visible</em> you are. Claeo tells
            you where you are losing visibility, why you are losing it, and what
            to do about it.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="border-border rounded-lg border p-5"
                >
                  <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight">
              Run your first AI visibility scan today
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
              Add your domain, review the suggested prompts, and see exactly
              where you stand.
            </p>
            <Button size="lg" className="mt-6" asChild>
              <Link href="/signup">
                Create your workspace
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 text-xs sm:px-6">
          <Logo showWordmark={false} className="opacity-80" />
          <p>© {new Date().getFullYear()} Claeo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

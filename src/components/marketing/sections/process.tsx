"use client";

import { useEffect, useState } from "react";
import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";
import { ProcessTerminal } from "../visuals/terminal";

const steps = [
  {
    number: "I",
    title: "Connect your website",
    description:
      "Add your domain. QuerySide analyzes your business, important pages, competitors and the searches that matter.",
    code: `queryside.scan({
  domain: "yourbrand.com",
  engines: [
    "google",
    "chatgpt",
    "gemini",
    "perplexity"
  ]
})`,
    status: "site analyzed",
  },
  {
    number: "II",
    title: "Measure your visibility",
    description:
      "Track how your brand and competitors appear across traditional search and AI answer engines.",
    code: `queryside.measure({
  brand: "yourbrand.com",
  competitors: [
    "competitor-a",
    "competitor-b"
  ],
  surfaces: "all"
})`,
    status: "visibility measured",
  },
  {
    number: "III",
    title: "Act on opportunities",
    description:
      "Use prioritized recommendations to improve content, citations, technical SEO and search visibility.",
    code: `queryside.prioritize({
  strategy: "search",
  output: "ranked_actions"
})`,
    status: "opportunities ranked",
  },
];

/**
 * Dark process section: three selectable steps with an auto-advancing
 * progress hairline and a sticky terminal panel (visual metaphor — see the
 * caption under the panel).
 */
export function ProcessSection() {
  const [activeStep, setActiveStep] = useState(0);

  // Auto-advance through steps; users who prefer reduced motion (and tests)
  // keep the first step until they click.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setActiveStep((previous) => (previous + 1) % steps.length);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [activeStep]);

  const step = steps[activeStep];

  return (
    <MarketingSection
      id="how-it-works"
      tone="night"
      className="overflow-hidden"
    >
      {/* Diagonal hairline pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 44px, #fafaf8 44px, #fafaf8 45px)`,
        }}
      />

      <div className="relative">
        <Reveal>
          <SectionEyebrow className="text-night-ash">
            How it works
          </SectionEyebrow>
          <EditorialHeading className="mt-6">
            Three steps.
            <br />
            <span className="text-night-ash">One search strategy.</span>
          </EditorialHeading>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-20">
          {/* Steps */}
          <div>
            {steps.map((item, index) => {
              const active = index === activeStep;
              return (
                <button
                  key={item.number}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  aria-pressed={active}
                  className={`w-full border-b border-night-line py-7 text-left transition-all duration-500 group ${
                    active ? "opacity-100" : "opacity-45 hover:opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-6">
                    <span className="font-display text-3xl text-night-ash">
                      {item.number}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-display text-2xl leading-snug transition-transform duration-300 group-hover:translate-x-1.5 lg:text-3xl">
                        {item.title}
                      </h3>
                      <p className="mt-2.5 text-sm leading-relaxed text-night-ash lg:text-base">
                        {item.description}
                      </p>

                      {active && (
                        <div className="mt-5 h-px w-full overflow-hidden bg-night-line">
                          <div className="step-progress h-full w-0 bg-brand" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Terminal */}
          <div className="self-start lg:sticky lg:top-32">
            <Reveal from="right">
              <ProcessTerminal
                code={step.code}
                status={step.status}
                resetKey={activeStep}
              />
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-night-ash">
                Concept preview — QuerySide does not publish a public SDK.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}

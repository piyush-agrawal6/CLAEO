import {
  BarChart3Icon,
  CheckCheckIcon,
  HistoryIcon,
  ScanSearchIcon,
} from "lucide-react";
import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";

const trustCards = [
  {
    icon: ScanSearchIcon,
    title: "Traceable results",
    description:
      "Inspect the prompts, engines and sources behind each visibility result.",
  },
  {
    icon: BarChart3Icon,
    title: "Transparent scoring",
    description:
      "See which components contribute to your visibility and opportunity scores.",
  },
  {
    icon: HistoryIcon,
    title: "Historical context",
    description:
      "Understand whether changes come from your brand, competitors or the search landscape.",
  },
  {
    icon: CheckCheckIcon,
    title: "Honest data",
    description:
      "No fabricated rankings, search volumes or performance changes.",
  },
];

/**
 * Transparent intelligence: the trust/transparency section — every score is
 * traceable to the signals that produced it.
 */
export function TrustSection() {
  return (
    <MarketingSection tone="tint">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal from="left">
          <SectionEyebrow>Transparent intelligence</SectionEyebrow>
          <EditorialHeading className="mt-6">
            Know why the
            <br />
            score changed.
          </EditorialHeading>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ash">
            QuerySide doesn&apos;t hide your performance behind a mystery
            number. Visibility scores are backed by the mentions, citations,
            prompts and search signals that created them.
          </p>
        </Reveal>

        <div className="grid gap-5">
          {trustCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} delay={index * 80} from="right">
                <div className="group h-full border border-line bg-canvas p-6 transition-colors duration-300 hover:border-ink/25">
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center border border-line text-ink transition-colors duration-300 group-hover:bg-ink group-hover:text-canvas"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-medium text-ink">
                        {card.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ash">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </MarketingSection>
  );
}

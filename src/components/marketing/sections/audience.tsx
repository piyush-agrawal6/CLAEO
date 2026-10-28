import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";
import { AudienceTabs } from "../visuals/audience-tabs";

const useCases = [
  {
    title: "SEO Teams",
    description:
      "Combine technical SEO, organic performance and AI visibility.",
  },
  {
    title: "Marketing Teams",
    description:
      "Understand where customers discover your brand and competitors.",
  },
  {
    title: "Agencies",
    description:
      "Monitor multiple clients, surface opportunities and create clearer reports.",
  },
  {
    title: "Founders",
    description:
      "See where your company is invisible before competitors take the category.",
  },
];

/**
 * Who QuerySide is for: four growth-team use cases next to the tabbed
 * interface preview (always labeled as sample data).
 */
export function AudienceSection() {
  return (
    <MarketingSection id="solutions" tone="canvas">
      {/* minmax(0,1fr) track + min-w-0 children let columns shrink below their
          min-content so the tablist's overflow-x-auto engages on narrow screens. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-12 min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20 lg:grid-cols-2">
        <Reveal from="left" className="min-w-0">
          <SectionEyebrow>Built for growth teams</SectionEyebrow>
          <EditorialHeading className="mt-6">
            One workspace.
            <br />
            Different goals.
          </EditorialHeading>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ash">
            QuerySide gives every team the same search intelligence without
            forcing them into separate SEO and AI visibility tools.
          </p>

          <div className="mt-10 border-t border-line">
            {useCases.map((useCase) => (
              <div key={useCase.title} className="border-b border-line py-5">
                <h3 className="text-base font-medium text-ink">
                  {useCase.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ash">
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal from="right" className="min-w-0">
          <AudienceTabs />
          <p className="mt-3 font-mono text-[11px] text-ash">
            Preview — illustrative interface with sample data.
          </p>
        </Reveal>
      </div>
    </MarketingSection>
  );
}

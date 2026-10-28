import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";
import { EcosystemList } from "../visuals/ecosystem-list";

/**
 * Search ecosystem: the surfaces QuerySide is designed around. Each surface
 * is honest about status — the list is labeled "Planned coverage", never
 * presented as a live integration.
 */
export function EcosystemSection() {
  return (
    <MarketingSection tone="canvas">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal from="left">
          <SectionEyebrow>Search ecosystem</SectionEyebrow>
          <EditorialHeading className="mt-6">
            One view.
            <br />
            Every search surface.
          </EditorialHeading>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ash">
            Understand your visibility across the places customers
            increasingly use to discover, compare and evaluate brands.
          </p>
        </Reveal>

        <Reveal from="right">
          <EcosystemList />
        </Reveal>
      </div>
    </MarketingSection>
  );
}

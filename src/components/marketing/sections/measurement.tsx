import { MetricBlock } from "../metric-block";
import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";

const metrics = [
  {
    index: "01",
    label: "AI visibility",
    caption: "How often your brand appears across tracked AI queries.",
  },
  {
    index: "02",
    label: "Citation share",
    caption:
      "How often sources connected to your brand influence AI answers.",
  },
  {
    index: "03",
    label: "Competitor share of voice",
    caption: "How your visibility compares across tracked queries.",
  },
  {
    index: "04",
    label: "Organic opportunities",
    caption:
      "Search Console and site signals that point to your next wins.",
  },
];

/**
 * Measurement: four large *metric types* (what QuerySide measures) instead
 * of fabricated performance numbers.
 */
export function MeasurementSection() {
  return (
    <MarketingSection tone="canvas" className="border-y border-line">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <SectionEyebrow>Measurement</SectionEyebrow>
          <EditorialHeading className="mt-6">
            Visibility you can
            <br />
            actually understand.
          </EditorialHeading>
        </Reveal>
        <Reveal delay={120} from="right">
          <p className="max-w-sm text-sm leading-relaxed text-ash lg:text-right">
            Every metric traces back to prompts, engines and sources you can
            inspect — never a black-box score.
          </p>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-px border border-line bg-line md:grid-cols-2 lg:mt-20">
        {metrics.map((metric, index) => (
          <Reveal key={metric.index} delay={index * 80} className="bg-canvas">
            <MetricBlock {...metric} />
          </Reveal>
        ))}
      </div>
    </MarketingSection>
  );
}

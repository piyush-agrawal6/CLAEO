import { FeatureRow } from "../feature-row";
import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection, SectionEyebrow } from "../primitives";
import {
  CitationPathsVisual,
  OpportunityMapVisual,
  QueryNetworkVisual,
  ShareOfVoiceVisual,
  TechnicalStatusVisual,
  TrendGraphVisual,
} from "../visuals/capability-visuals";

const capabilities = [
  {
    index: "01",
    title: "AI Visibility",
    description:
      "Track when, where and how your brand appears across ChatGPT, Gemini, Perplexity, Google AI and other answer engines.",
    visual: <QueryNetworkVisual />,
  },
  {
    index: "02",
    title: "Know who is winning.",
    description:
      "Compare visibility, mentions, citations and search opportunities against the brands competing for the same audience.",
    visual: <ShareOfVoiceVisual />,
  },
  {
    index: "03",
    title: "Understand what AI trusts.",
    description:
      "Find the websites and sources shaping AI answers, uncover citation gaps and identify places where competitors are being referenced instead of you.",
    visual: <CitationPathsVisual />,
  },
  {
    index: "04",
    title: "Fix what search engines see.",
    description:
      "Audit crawlability, metadata, indexability, structured data and technical issues that reduce search visibility.",
    visual: <TechnicalStatusVisual />,
  },
  {
    index: "05",
    title: "Find what you're missing.",
    description:
      "Discover high-value topics, queries, comparisons and answer gaps based on your site, competitors and real search signals.",
    visual: <OpportunityMapVisual />,
  },
  {
    index: "06",
    title: "Turn search data into action.",
    description:
      "Connect Google Search Console to surface content decay, CTR opportunities, ranking gaps and queries worth tracking in AI search.",
    visual: <TrendGraphVisual />,
  },
];

/**
 * Capabilities: the "Everything you need. Nothing you don't." numbered
 * feature rows (template structure, QuerySide content).
 */
export function CapabilitiesSection() {
  return (
    <MarketingSection id="platform" tone="canvas">
      <Reveal>
        <SectionEyebrow>Platform</SectionEyebrow>
        <EditorialHeading className="mt-6">
          Everything you need.
          <br />
          <span className="text-ash">Nothing you don&apos;t.</span>
        </EditorialHeading>
      </Reveal>

      <div className="mt-14 border-t border-line lg:mt-20">
        {capabilities.map((capability, index) => (
          <Reveal key={capability.index} delay={index * 60}>
            <FeatureRow {...capability} />
          </Reveal>
        ))}
      </div>
    </MarketingSection>
  );
}

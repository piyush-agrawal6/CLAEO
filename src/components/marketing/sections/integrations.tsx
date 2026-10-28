import { IntegrationCard } from "../integration-card";
import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection } from "../primitives";

const integrations = [
  { name: "Google Search Console", category: "Search analytics" },
  { name: "Google Analytics 4", category: "Traffic analytics" },
  { name: "WordPress", category: "CMS" },
  { name: "Webflow", category: "CMS" },
  { name: "Shopify", category: "Commerce" },
  { name: "Vercel", category: "Hosting" },
  { name: "Next.js", category: "Framework" },
];

/**
 * Integrations: the template's dual reverse-ticker treatment. Every card
 * carries a "Coming soon" chip — none of these connections are shipped, so
 * none may imply they already work.
 */
export function IntegrationsSection() {
  const reversed = [...integrations].reverse();

  return (
    <MarketingSection tone="canvas" container={false} className="overflow-hidden">
      <div className="max-w-3xl px-6 text-center lg:mx-auto">
        <Reveal>
          <span className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ash sm:text-xs">
            <span aria-hidden className="h-px w-8 bg-current opacity-50" />
            Integrations
            <span aria-hidden className="h-px w-8 bg-current opacity-50" />
          </span>
          <EditorialHeading className="mt-6">
            Connect the data
            <br />
            you already use.
          </EditorialHeading>
          <p className="mt-5 text-lg text-ash">
            Bring search, analytics and site data into one workspace.
          </p>
        </Reveal>
      </div>

      {/* The tracks are intentionally wider than the viewport. A dedicated
          clip container keeps the animation from registering as horizontal
          overflow on the document at any width. */}
      <div className="mt-14 lg:mt-16 overflow-hidden">
        <div className="marquee flex w-max" aria-hidden={false}>
          <div className="flex shrink-0 gap-6 pr-6">
            {integrations.map((integration) => (
              <IntegrationCard key={integration.name} {...integration} />
            ))}
          </div>
          <div className="flex shrink-0 gap-6 pr-6" aria-hidden>
            {integrations.map((integration) => (
              <IntegrationCard key={`dup-${integration.name}`} {...integration} />
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-hidden">
          <div className="marquee-reverse flex w-max">
            <div className="flex shrink-0 gap-6 pr-6">
              {reversed.map((integration) => (
                <IntegrationCard key={`r-${integration.name}`} {...integration} />
              ))}
            </div>
            <div className="flex shrink-0 gap-6 pr-6" aria-hidden>
              {reversed.map((integration) => (
                <IntegrationCard key={`r-dup-${integration.name}`} {...integration} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}

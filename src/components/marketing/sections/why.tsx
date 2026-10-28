import { Reveal } from "../reveal";
import { EditorialHeading, MarketingSection } from "../primitives";

/**
 * Why QuerySide (replaces the template's testimonial slot — no fake
 * customers, quotes or logos). A large statement plus a small
 * discovery-surfaces → workspace flow card.
 */
export function WhySection() {
  return (
    <MarketingSection tone="canvas" className="border-t border-line">
      <Reveal>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ash sm:text-xs">
            Why QuerySide
          </span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
      </Reveal>

      <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-7">
          <EditorialHeading>Search is no longer one results page.</EditorialHeading>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
            Customers discover brands across Google, AI assistants,
            recommendations and cited sources. QuerySide brings those signals
            together so teams know where they stand and what to do next.
          </p>
        </Reveal>

        <Reveal delay={140} from="right" className="lg:col-span-5">
          <div className="border border-line bg-canvas p-6 lg:p-7">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
              Discovery surfaces
            </span>
            <ul className="mt-4">
              {["Google", "AI Search", "Citations", "Competitors"].map(
                (source) => (
                  <li
                    key={source}
                    className="flex items-center gap-3 border-b border-line py-3 text-sm text-ink last:border-b-0"
                  >
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-ink/40"
                    />
                    {source}
                  </li>
                ),
              )}
            </ul>
            <div className="mt-5 flex items-center gap-3 border-t border-line pt-5">
              <span aria-hidden className="font-mono text-brand">
                →
              </span>
              <span className="text-base font-medium text-ink">
                One QuerySide workspace
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </MarketingSection>
  );
}

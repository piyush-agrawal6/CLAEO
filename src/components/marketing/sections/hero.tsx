import { AsciiQ } from "../visuals/ascii-q";
import { Reveal } from "../reveal";
import { PrimaryCTA, SecondaryCTA } from "../primitives";

/**
 * Hero: oversized editorial headline on a technical grid, with the
 * ASCII "Q" query-network visual. Entrance plays once on mount.
 */
export function HeroSection() {
  return (
    <section className="mkt-noise relative flex min-h-[92svh] flex-col justify-center overflow-hidden bg-canvas text-ink">
      {/* Thin technical grid, faded toward the edges */}
      <div
        aria-hidden
        className="mkt-grid mkt-grid-fade absolute inset-0 opacity-80"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-20 pt-32 lg:px-12 lg:pb-28 lg:pt-40">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Copy */}
          <div>
            <Reveal from="none">
              <span className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ash sm:text-xs">
                <span aria-hidden className="h-px w-10 bg-ink/40" />
                Search intelligence for modern teams
              </span>
            </Reveal>

            <Reveal delay={120}>
              <h1 className="mt-8 font-display text-[clamp(3rem,10.5vw,8.5rem)] font-normal leading-[0.94] tracking-[-0.02em]">
                <span className="block">Be the answer</span>
                <span className="block">
                  everywhere<span className="text-brand">.</span>
                </span>
              </h1>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ash lg:text-xl">
                Track how your brand appears across Google and AI search,
                understand why competitors win, and discover exactly what to
                improve next.
              </p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ash sm:text-xs">
                SEO, AEO and GEO intelligence in one platform.
              </p>
            </Reveal>

            <Reveal delay={360}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <PrimaryCTA href="/signup" size="lg">
                  Analyze your website
                </PrimaryCTA>
                <SecondaryCTA href="/#how-it-works" size="lg">
                  See how it works
                </SecondaryCTA>
              </div>
              <p className="mt-5 font-mono text-xs text-ash">
                No credit card required.
              </p>
            </Reveal>
          </div>

          {/* ASCII Q visual (phones keep the hero text-only) */}
          <Reveal from="right" delay={180} className="hidden sm:block">
            <div className="relative mx-auto aspect-square w-full max-w-[420px] lg:mx-0 lg:ml-auto lg:max-w-[560px]">
              <AsciiQ className="absolute inset-0 h-full w-full" />
              <span
                aria-hidden
                className="absolute bottom-2 right-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ash"
              >
                brand → query → engine → citation
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

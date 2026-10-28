"use client";

import { useState, type MouseEvent } from "react";
import { Reveal } from "../reveal";
import { EditorialHeading, PrimaryCTA, SecondaryCTA } from "../primitives";
import { QMark } from "../visuals/q-mark";

/**
 * Final CTA: the template's large bordered box with a soft brand spotlight
 * that follows the cursor (disabled for reduced motion), plus the abstract
 * QuerySide Q mark.
 */
export function FinalCtaSection() {
  const [spotlight, setSpotlight] = useState({ x: 50, y: 40 });

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section className="bg-canvas py-24 text-ink lg:py-32">
      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-12">
        <Reveal>
          <div
            onMouseMove={onMouseMove}
            className="relative overflow-hidden border border-ink/85"
          >
            {/* Cursor spotlight */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-300"
              style={{
                background: `radial-gradient(420px circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,106,0,0.10), transparent 65%)`,
              }}
            />
            {/* Corner accents */}
            <span
              aria-hidden
              className="absolute right-0 top-0 h-16 w-16 border-b border-l border-line"
            />
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-16 w-16 border-r border-t border-line"
            />

            <div className="relative grid items-center gap-12 px-7 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-16 lg:py-24">
              <div>
                <EditorialHeading
                  as="h2"
                  className="text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1]"
                >
                  Find where you&apos;re invisible.
                </EditorialHeading>
                <p className="mt-4 font-display text-2xl italic text-brand-strong lg:text-3xl">
                  Be the answer everywhere.
                </p>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-ash">
                  Analyze your website, uncover competitors and start building
                  your search visibility baseline.
                </p>

                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <PrimaryCTA href="/signup" size="lg">
                    Analyze your website
                  </PrimaryCTA>
                  <SecondaryCTA href="/pricing" size="lg">
                    View pricing
                  </SecondaryCTA>
                </div>
                <p className="mt-5 font-mono text-xs text-ash">
                  No credit card required.
                </p>
              </div>

              <div className="hidden justify-center lg:flex">
                <QMark className="h-[320px] w-[320px] text-ink xl:h-[380px] xl:w-[380px]" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

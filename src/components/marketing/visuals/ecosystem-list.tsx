"use client";

import { useEffect, useState } from "react";
import { Chip } from "../primitives";

/**
 * Search-surface list with a softly cycling active row. Honesty: every
 * surface is presented under a "Planned coverage" chip — nothing here is
 * labeled as a live integration, because engine-level tracking is not
 * shipped yet.
 */

const surfaces = [
  { name: "Google Search", kind: "Organic results" },
  { name: "ChatGPT", kind: "Answer engine" },
  { name: "Google AI", kind: "AI overviews" },
  { name: "Gemini", kind: "Answer engine" },
  { name: "Perplexity", kind: "Answer engine" },
  { name: "Claude", kind: "Answer engine" },
  { name: "Search Console", kind: "Search analytics" },
  { name: "AI referral traffic", kind: "Analytics" },
];

export function EcosystemList() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setActive((previous) => (previous + 1) % surfaces.length);
    }, 2400);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="border border-line bg-canvas">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-ash">
          Search surfaces
        </span>
        <Chip tone="brand">Planned coverage</Chip>
      </div>

      <ul className="divide-y divide-line">
        {surfaces.map((surface, index) => (
          <li
            key={surface.name}
            className={`flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-300 ${
              active === index ? "bg-ink/[0.025]" : ""
            }`}
          >
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className={`size-2 rounded-full transition-colors duration-300 ${
                  active === index ? "bg-brand" : "bg-ink/20"
                }`}
              />
              <div>
                <div className="text-sm font-medium text-ink">
                  {surface.name}
                </div>
                <div className="text-xs text-ash">{surface.kind}</div>
              </div>
            </div>
            <span className="font-mono text-xs text-ash">
              {String(index + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

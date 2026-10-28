"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Chip } from "../primitives";

/**
 * "One workspace. Different goals." tabbed interface preview.
 *
 * Honesty contract: the panel header always shows a "Sample data" chip, so
 * the mock rows can never be mistaken for real customer results. Company
 * names are generic ("Competitor A"), and priorities/mentions are clearly
 * illustrative structure, not claims.
 */

const tabs = [
  { id: "visibility", label: "Visibility" },
  { id: "competitors", label: "Competitors" },
  { id: "citations", label: "Citations" },
  { id: "actions", label: "Actions" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const visibilityRows = [
  { query: "best email marketing tools", state: "Mentioned" },
  { query: "crm software for small teams", state: "Gap" },
  { query: "how to automate weekly reporting", state: "Gap" },
  { query: "alternatives to manual seo audits", state: "Mentioned" },
];

const competitorRows = [
  { name: "Your brand", width: "72%", you: true },
  { name: "Competitor A", width: "58%", you: false },
  { name: "Competitor B", width: "41%", you: false },
  { name: "Competitor C", width: "27%", you: false },
];

const citationRows = [
  { source: "Industry documentation", state: "Cited" },
  { source: "Comparison roundups", state: "Opportunity" },
  { source: "Review platforms", state: "Opportunity" },
  { source: "Community discussions", state: "Cited" },
];

const actionRows = [
  {
    priority: "High",
    title: "Publish a comparison page",
    why: "Competitors appear for comparison queries you do not cover.",
  },
  {
    priority: "High",
    title: "Close citation gaps",
    why: "Sources citing competitors are not citing you yet.",
  },
  {
    priority: "Medium",
    title: "Refresh declining pages",
    why: "Update pages whose queries are losing clicks over time.",
  },
  {
    priority: "Medium",
    title: "Strengthen entity clarity",
    why: "Make brand, product and category explicit on key pages.",
  },
];

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
      {children}
    </div>
  );
}

function Panel({ active }: { active: TabId }) {
  if (active === "visibility") {
    return (
      <div>
        {visibilityRows.map((row) => (
          <Row key={row.query}>
            <span className="truncate text-sm text-ink">{row.query}</span>
            <Chip tone={row.state === "Mentioned" ? "brand" : "neutral"}>
              {row.state}
            </Chip>
          </Row>
        ))}
      </div>
    );
  }

  if (active === "competitors") {
    return (
      <div>
        {competitorRows.map((row) => (
          <Row key={row.name}>
            <span className="text-sm text-ink">{row.name}</span>
            <span className="flex items-center gap-3">
              <span className="h-1.5 w-28 bg-line sm:w-44" aria-hidden>
                <span
                  className={cn(
                    "block h-full",
                    row.you ? "bg-brand" : "bg-ink/45",
                  )}
                  style={{ width: row.width }}
                />
              </span>
              <span className="sr-only">{row.width} share (sample)</span>
            </span>
          </Row>
        ))}
      </div>
    );
  }

  if (active === "citations") {
    return (
      <div>
        {citationRows.map((row) => (
          <Row key={row.source}>
            <span className="text-sm text-ink">{row.source}</span>
            <Chip tone={row.state === "Cited" ? "brand" : "neutral"}>
              {row.state}
            </Chip>
          </Row>
        ))}
      </div>
    );
  }

  return (
    <div>
      {actionRows.map((row) => (
        <div
          key={row.title}
          className="border-b border-line py-3.5 last:border-b-0"
        >
          <div className="flex items-center gap-3">
            <Chip tone={row.priority === "High" ? "brand" : "neutral"}>
              {row.priority}
            </Chip>
            <span className="text-sm font-medium text-ink">{row.title}</span>
          </div>
          <p className="mt-1.5 pl-0.5 text-xs leading-relaxed text-ash">
            {row.why}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AudienceTabs() {
  const [active, setActive] = useState<TabId>("visibility");
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    setActive(tabs[nextIndex].id);
    requestAnimationFrame(() => buttonRefs.current[nextIndex]?.focus());
  };

  return (
    <div className="border border-line bg-canvas">
      {/* min-w-0 lets the header shrink so the tablist's overflow-x-auto
          engages on narrow screens instead of widening the whole column. */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-line pr-4">
        <div
          role="tablist"
          aria-label="QuerySide interface preview"
          className="flex min-w-0 overflow-x-auto"
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "relative shrink-0 px-3.5 py-3.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors sm:px-4",
                  selected
                    ? "text-ink"
                    : "text-ash hover:text-ink",
                )}
              >
                {tab.label}
                {selected && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 bottom-0 h-0.5 bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>
        <Chip className="shrink-0">Sample data</Chip>
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        className="min-h-[300px] px-5 py-3 lg:px-6"
      >
        <Panel active={active} />
      </div>
    </div>
  );
}

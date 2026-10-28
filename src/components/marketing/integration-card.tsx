import { Chip } from "./primitives";

/**
 * Ticker card for the integrations marquee. Every integration QuerySide
 * does not support yet is explicitly marked "Coming soon" so the card can
 * never imply a working connection.
 */
export function IntegrationCard({
  name,
  category,
}: {
  name: string;
  category: string;
}) {
  return (
    <div className="group w-[260px] shrink-0 border border-line bg-canvas px-7 py-6 transition-all duration-300 hover:border-ink/25 hover:bg-ink/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-medium text-ink transition-transform duration-300 group-hover:translate-x-1">
            {name}
          </div>
          <div className="mt-1 text-sm text-ash">{category}</div>
        </div>
        <Chip tone="brand" className="mt-0.5 shrink-0">
          Coming soon
        </Chip>
      </div>
    </div>
  );
}

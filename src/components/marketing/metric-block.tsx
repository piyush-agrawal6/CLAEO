import { EditorialHeading } from "./primitives";

/**
 * Large "metric type" block for the Measurement section. QuerySide has no
 * verified customer metrics, so these cards present *kinds* of metrics the
 * product tracks — never fabricated values.
 */
export function MetricBlock({
  index,
  label,
  caption,
}: {
  /** Two-digit index, e.g. "01". */
  index: string;
  /** Metric type name, e.g. "AI visibility". */
  label: string;
  /** What the metric means. */
  caption: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-8 bg-canvas p-8 lg:p-12">
      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-ash">
          Metric type
        </span>
        <span className="font-mono text-sm text-ash">{index}</span>
      </div>

      <div>
        <EditorialHeading size="lg" className="text-[clamp(2rem,3.6vw,3rem)]">
          {label}
        </EditorialHeading>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-ash lg:text-base">
          {caption}
        </p>
      </div>
    </div>
  );
}

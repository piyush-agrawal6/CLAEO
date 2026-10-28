import type { ReactNode } from "react";
import { EditorialHeading } from "./primitives";

/**
 * Numbered capability row used by the "Everything you need." section:
 * mono index, editorial heading + description on the left, a minimal
 * monochrome SVG visual on the right, separated by a hairline.
 */
export function FeatureRow({
  index,
  title,
  description,
  visual,
}: {
  /** Two-digit index, e.g. "01". */
  index: string;
  title: string;
  description: string;
  visual: ReactNode;
}) {
  return (
    <div className="group flex flex-col gap-6 border-b border-line py-12 lg:flex-row lg:gap-16 lg:py-20">
      <div className="shrink-0 lg:w-12">
        <span className="font-mono text-sm text-ash">{index}</span>
      </div>

      <div className="grid flex-1 items-center gap-8 lg:grid-cols-2">
        <div>
          <EditorialHeading
            size="md"
            className="transition-transform duration-500 group-hover:translate-x-2"
          >
            {title}
          </EditorialHeading>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ash lg:text-lg">
            {description}
          </p>
        </div>

        <div className="flex justify-start lg:justify-end">
          <div
            aria-hidden
            className="h-40 w-56 text-ink lg:h-48 lg:w-64 [&_svg]:h-full [&_svg]:w-full"
          >
            {visual}
          </div>
        </div>
      </div>
    </div>
  );
}

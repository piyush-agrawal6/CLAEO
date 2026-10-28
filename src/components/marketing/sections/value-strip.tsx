import { Reveal } from "../reveal";
import { EditorialHeading } from "../primitives";

/**
 * Value strip: four capability statements in the template's oversized
 * metric treatment — deliberately statements, not fabricated numbers
 * (QuerySide has no verified customer metrics yet).
 */

const values = [
  {
    index: "01",
    title: "AI Search Visibility",
    description: "Track brand mentions across major AI answer engines.",
  },
  {
    index: "02",
    title: "Competitor Intelligence",
    description: "See who appears where you don't.",
  },
  {
    index: "03",
    title: "Citation Intelligence",
    description: "Understand which sources influence AI answers.",
  },
  {
    index: "04",
    title: "Search Opportunities",
    description: "Know what to improve next.",
  },
];

export function ValueStripSection() {
  return (
    <section className="border-y border-line bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-12">
        <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">
          {values.map((value, index) => (
            <Reveal
              key={value.index}
              delay={index * 90}
              className="h-full bg-canvas"
            >
              <div className="flex h-full flex-col justify-between gap-10 px-7 py-11 lg:px-8 lg:py-14">
                <span className="font-mono text-xs text-ash">
                  {value.index}
                </span>
                <div>
                  <EditorialHeading size="sm">{value.title}</EditorialHeading>
                  <span
                    aria-hidden
                    className="mt-4 block h-0.5 w-8 bg-brand"
                  />
                  <p className="mt-4 text-sm leading-relaxed text-ash">
                    {value.description}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

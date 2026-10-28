import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Marketing (public-site) primitives — the shared building blocks every
 * QuerySide public page must compose from. They only consume the static
 * brand tokens (`canvas/ink/ash/line/brand/night`) so the marketing design
 * is identical in light and dark app themes. See docs/DESIGN_SYSTEM.md.
 */

/** 1400px editorial container with hairline-friendly gutters. */
export function MarketingContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-6 lg:px-12", className)}>
      {children}
    </div>
  );
}

type SectionTone = "canvas" | "tint" | "night";

/**
 * Vertical rhythm section: `py-24 lg:py-32` by default (the site-wide
 * spacing unit). `tone` sets the surface; `night` also flips text colors
 * and focus-ring color for dark sections.
 */
export function MarketingSection({
  id,
  tone = "canvas",
  container = true,
  className,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  /** Wrap children in MarketingContainer (default). Full-bleed sections opt out. */
  container?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-28 py-24 lg:py-32",
        tone === "canvas" && "bg-canvas text-ink",
        tone === "tint" && "bg-tint text-ink",
        tone === "night" && "mkt-night bg-night text-night-ink",
        className,
      )}
    >
      {container ? <MarketingContainer>{children}</MarketingContainer> : children}
    </section>
  );
}

/**
 * Monospace eyebrow label with a leading hairline, e.g. "— PLATFORM".
 * Pass `className="text-night-ash"` inside dark sections.
 */
export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ash sm:text-xs",
        className,
      )}
    >
      <span aria-hidden className="h-px w-8 bg-current opacity-50" />
      {children}
    </span>
  );
}

/**
 * Editorial serif heading. Sizes follow the marketing type scale:
 * `display-lg` (section anchors), `display-md` (sub-heads), `display-sm`.
 */
export function EditorialHeading({
  as: Tag = "h2",
  size = "lg",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3";
  size?: "lg" | "md" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "font-display font-normal tracking-[-0.01em] text-balance",
        size === "lg" &&
          "text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.03]",
        size === "md" && "text-3xl leading-[1.08] lg:text-4xl",
        size === "sm" && "text-2xl leading-[1.1] lg:text-3xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

const ctaBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2";

const ctaSize = {
  sm: "h-9 px-5 text-[13px]",
  md: "h-12 px-7 text-sm",
  lg: "h-14 px-9 text-base",
} as const;

/**
 * Small technical status chip (mono, hairline border). Used for
 * "Coming soon" / "Planned" / "Sample data" honesty labels.
 */
export function Chip({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
        tone === "neutral"
          ? "border-line text-ash"
          : "border-brand/50 text-brand-strong",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Primary CTA: brand-orange fill with near-black label
 * (contrast pair #111 on #ff6a00 = 6.58:1).
 */
export function PrimaryCTA({
  href,
  children,
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  size?: keyof typeof ctaSize;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        ctaBase,
        ctaSize[size],
        "bg-brand text-brand-ink outline-brand-strong hover:-translate-y-px hover:bg-[#e85d00] active:translate-y-0",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Secondary CTA: hairline outline. Use `tone="night"` on dark sections so
 * the border and focus ring keep contrast against #0e0e0c.
 */
export function SecondaryCTA({
  href,
  children,
  size = "md",
  tone = "light",
  className,
}: {
  href: string;
  children: ReactNode;
  size?: keyof typeof ctaSize;
  tone?: "light" | "night";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        ctaBase,
        ctaSize[size],
        tone === "light"
          ? "border border-line bg-transparent text-ink outline-brand-strong hover:border-ink/40 hover:bg-ink/[0.03]"
          : "border border-night-line bg-transparent text-night-ink outline-brand hover:border-night-ink/40 hover:bg-night-ink/[0.05]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

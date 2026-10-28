import Link from "next/link";
import { Logo } from "@/components/logo";
import { MarketingContainer } from "./primitives";

/**
 * Marketing footer. Columns are the future public-site information
 * architecture — routes that do not exist yet resolve to the 404 page
 * until those pages ship (see docs/MVP_ROADMAP.md). No social profiles,
 * hiring badges or system-status claims are shown.
 */

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "AI Visibility", href: "/features/ai-visibility" },
      { label: "Competitors", href: "/features/competitors" },
      { label: "Citations", href: "/features/citations" },
      { label: "Site Audit", href: "/features/site-audit" },
      { label: "Action Center", href: "/features/action-center" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "SEO Teams", href: "/solutions/seo-teams" },
      { label: "Marketing Teams", href: "/solutions/marketing-teams" },
      { label: "Agencies", href: "/solutions/agencies" },
      { label: "Startups", href: "/solutions/startups" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Guides", href: "/guides" },
      { label: "Free Tools", href: "/tools" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-canvas text-ink">
      <MarketingContainer>
        <div className="grid grid-cols-2 gap-10 py-16 md:grid-cols-6 lg:py-20">
          <div className="col-span-2 pr-6">
            <Link href="/" aria-label="QuerySide home" className="inline-block">
              <Logo sideClassName="text-ink" wordmarkClassName="text-lg" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ash">
              Search intelligence on your side.
            </p>
            <span
              aria-hidden
              className="mt-6 block h-1 w-10 bg-brand"
            />
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ash">
                {column.title}
              </h3>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink/75 transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-line py-7 sm:flex-row sm:items-center">
          <p className="text-xs text-ash">
            © 2026 QuerySide. All rights reserved.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ash">
            Be the answer everywhere.
          </p>
        </div>
      </MarketingContainer>
    </footer>
  );
}

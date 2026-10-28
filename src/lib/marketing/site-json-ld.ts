import { env } from "@/lib/env";

/**
 * Organization + WebSite structured data (JSON-LD) for the marketing site.
 *
 * Honesty contract: no Review/rating markup (those need real, earned reviews),
 * no fabricated aggregateRating, no fake customer or offer data.
 *
 * Consumed by `src/app/page.tsx`, which inlines it as a
 * `<script type="application/ld+json">` data block. That script type is not a
 * JavaScript MIME type, so it is a non-executable data block — the browser's
 * `script-src` nonce/`strict-dynamic` policy in `src/proxy.ts` never treats it
 * as runnable code, and search engines read it straight from the DOM.
 */
export const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${env.NEXT_PUBLIC_APP_URL}/#organization`,
      name: "QuerySide",
      url: env.NEXT_PUBLIC_APP_URL,
      slogan: "Search intelligence on your side.",
      description:
        "SEO, AEO and GEO intelligence platform: AI visibility tracking, competitor intelligence, citation intelligence and technical SEO.",
    },
    {
      "@type": "WebSite",
      "@id": `${env.NEXT_PUBLIC_APP_URL}/#website`,
      name: "QuerySide",
      url: env.NEXT_PUBLIC_APP_URL,
      publisher: { "@id": `${env.NEXT_PUBLIC_APP_URL}/#organization` },
    },
  ],
};

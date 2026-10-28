import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/footer";
import { siteJsonLd } from "@/lib/marketing/site-json-ld";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { AudienceSection } from "@/components/marketing/sections/audience";
import { CapabilitiesSection } from "@/components/marketing/sections/capabilities";
import { EcosystemSection } from "@/components/marketing/sections/ecosystem";
import { FinalCtaSection } from "@/components/marketing/sections/final-cta";
import { HeroSection } from "@/components/marketing/sections/hero";
import { IntegrationsSection } from "@/components/marketing/sections/integrations";
import { MeasurementSection } from "@/components/marketing/sections/measurement";
import { ProcessSection } from "@/components/marketing/sections/process";
import { TrustSection } from "@/components/marketing/sections/trust";
import { ValueStripSection } from "@/components/marketing/sections/value-strip";
import { WhySection } from "@/components/marketing/sections/why";

/**
 * Render the landing per-request so `src/proxy.ts` can stamp its per-request
 * CSP nonce onto Next's inline/bootstrap scripts.
 *
 * The proxy's `script-src 'self' 'nonce-X' 'strict-dynamic'` (src/proxy.ts)
 * can only be satisfied by nonces injected while a response is being rendered.
 * A statically-prerendered page bakes its `<script>` tags at build time — no
 * request nonce exists yet — so under `strict-dynamic` ('self' is ignored)
 * every chunk and inline runtime script is blocked, leaving the page
 * un-hydrated (sticky navbar, ARIA tabs, scroll-reveals, canvas hero all dead).
 * Rendering on demand lets Next apply the `x-nonce` header, so the strict CSP
 * stays intact AND the landing is interactive.
 *
 * Trade-off (accepted): this route forgoes static prerendering (it's one
 * content-only marketing page with no per-request data reads — the loss is
 * just build-time HTML caching), and next-themes' framework-injected theme-init
 * script is emitted without a nonce, producing one cosmetic CSP console warning.
 * The warning is harmless — next-themes' hydration effect still applies the
 * light/dark class correctly (verified in both color schemes). Fixing that
 * warning would require editing `src/proxy.ts`/`next.config.ts`, which are
 * explicitly out of scope for this redesign.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "QuerySide — SEO & AI Search Intelligence Platform",
    description:
      "Track and improve your visibility across Google, ChatGPT, Gemini, Perplexity and AI search with competitor, citation and SEO intelligence.",
  },
  twitter: {
    card: "summary",
    title: "QuerySide — SEO & AI Search Intelligence Platform",
    description:
      "Track and improve your visibility across Google, ChatGPT, Gemini, Perplexity and AI search with competitor, citation and SEO intelligence.",
  },
};

/**
 * QuerySide landing page. Composed entirely from the shared marketing
 * design system (see docs/DESIGN_SYSTEM.md). The wrapper pins the fixed
 * warm-canvas palette so the page renders identically regardless of the
 * user's dark-theme preference.
 */
export default function Home() {
  return (
    <div className="bg-canvas text-ink">
      {/* Structured data for search engines (Organization + WebSite graph,
          no Review markup — see the honesty contract in site-json-ld.ts).
          `type="application/ld+json"` is a non-JS data block, not executable
          script, so the strict nonce CSP in src/proxy.ts does not treat it as
          executable code. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <MarketingNavbar />
      <main>
        <HeroSection />
        <ValueStripSection />
        <CapabilitiesSection />
        <ProcessSection />
        <MeasurementSection />
        <EcosystemSection />
        <IntegrationsSection />
        <TrustSection />
        <AudienceSection />
        <WhySection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}

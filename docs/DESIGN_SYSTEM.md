# QuerySide Design System

The contract for everything QuerySide ships visually — the marketing site
(editorial, expressive) and the application dashboard (dense, operational).
Every public page must be built from the primitives in
`src/components/marketing/` so the site stays coherent as it grows.

---

## 1. Brand

| Token / value | Meaning |
| --- | --- |
| `#FF6A00` (vivid orange) | **Brand orange.** Primary CTA fills, logo "Query", active indicators, micro-accents, hover highlights, dark-surface accents. |
| `#C2410C` (deep orange) | **Accessible orange.** Small orange *text*, links, focus rings and badges on light backgrounds (4.96:1 on `#FAFAF8`; vivid orange only reaches 2.75:1). Sanctioned accessibility adjustment of the brand color. |
| `#111111` (near-black) | Primary text, dark CTA labels, the "Side" of the logo on light surfaces. |
| Warm neutral gray (`#6B6860`) | Muted/secondary text on light surfaces (5.32:1). |
| `#FAFAF8` (warm off-white) | Page canvas for all marketing pages. |
| `#0E0E0C` (near-black) | Dark sections. |
| Hairline neutral (`#E6E4DC`) | Borders and technical grid lines on light surfaces. |

**Orange is an accent, never a wash.** Correct uses: primary CTA background
(with near-black label — `#111` on `#FF6A00` = 6.58:1), the logo, active tab /
step indicators, small rules and dots, hover states, important single-number
emphasis. Incorrect uses: full-page orange, orange body text, orange
section backgrounds, gradients built from orange.

### Logo

- Wordmark: **Query** in `#FF6A00`, **Side** in the foreground color
  (near-black on light, near-white on dark) — component: `Logo`
  (`src/components/logo.tsx`).
- The wordmark is a logotype: the orange half is exempt from WCAG text-contrast
  requirements (it must still be clearly visible; never place it on a
  competing orange background).
- Never stretch, recolor, outline, or add effects to the logo. Minimum height
  24px (mark) / 16px text.
- On marketing pages pass `sideClassName="text-ink"` so the logo renders
  correctly independent of the user's dark-theme preference.

---

## 2. Typography

| Role | Font | Token / utility |
| --- | --- | --- |
| Display / editorial headlines | **Instrument Serif** 400 (incl. italic) | `font-display` (`--font-display`) |
| Body, UI, buttons, forms | **Geist Sans** | default body font |
| Eyebrows, labels, code, data | **Geist Mono** | `font-mono` |

Heading scale (marketing):

| Level | Style |
| --- | --- |
| H1 (hero) | `font-display text-[clamp(3rem,10.5vw,8.5rem)] leading-[0.94] tracking-[-0.02em]` — one per page, always |
| Section heading (`EditorialHeading size="lg"`) | `clamp(2.25rem,5vw,3.75rem)`, leading 1.03 |
| Sub-heading (`size="md"`) | 24px → 30px (`text-3xl lg:text-4xl`) |
| Small heading (`size="sm"`) | 20px → 24px |
| Eyebrow | mono, 11–12px, uppercase, `tracking-[0.2em]`, with a 32px hairline |
| Body | 16–18px, `text-ash`, `leading-relaxed`, measure ≤ `max-w-xl` |
| Mono note / disclaimer | 11–12px mono, `text-ash` |

Rules:

- Serif is for headlines and pull quotes only — never buttons, form labels or
  table data.
- Headlines use `text-balance`; break lines manually with `<br />` for the
  editorial two-line rhythm ("Three steps. / One search strategy.").
- The dashboard shares these fonts but never borrows the marketing display
  scale (see §10).

---

## 3. Layout & spacing

- **Container:** `MarketingContainer` — `max-w-[1400px]`, gutters `px-6`
  (mobile) → `lg:px-12`.
- **Section rhythm:** `MarketingSection` — `py-24 lg:py-32` (96/128px). This is
  the site-wide vertical unit; don't invent new paddings.
- **Grids:** 12-column mental model; common splits are `lg:grid-cols-2`
  (copy | visual) and `lg:grid-cols-[1.05fr_0.95fr]` (hero). Hairline grids use
  `gap-px bg-line` over cell backgrounds — never multiple borders that double up.
- **Card padding:** `p-6`–`p-8` (compact) or `p-8 lg:p-12` (metric blocks).
- **Anchor targets:** sections with `id` get `scroll-mt-28` (navbar clearance).

## 4. Surfaces, borders, cards

- Marketing section tones: `canvas` (`#FAFAF8`), `tint` (`#F4F2EC`,
  for the trust section), `night` (`#0E0E0C`, dark process section).
- Borders are always **1px hairlines** with an explicit color
  (`border-line`, `border-night-line`, or `border-ink/85` for the one strong
  CTA frame). Never use bare `border` on marketing surfaces — it inherits the
  app theme and leaks.
- Cards are square (no radius). Only two things are rounded: buttons/CTAs and
  the scrolled navbar pill (`rounded-2xl`).
- Shadow is used once: the scrolled navbar pill. Everything else is flat.

## 5. Buttons

| Button | Construction |
| --- | --- |
| `PrimaryCTA` | `rounded-full bg-brand text-brand-ink` — near-black label on vivid orange (6.58:1); sizes `sm` (h-9), `md` (h-12), `lg` (h-14) |
| `SecondaryCTA` | `rounded-full border` hairline outline; `tone="night"` variant for dark sections |
| Application buttons | shadcn `Button` — `bg-primary` is `#C2410C` light / `#FF6A00` dark with matching contrast-safe foreground |

- All CTAs: `transition-all duration-300`, `hover:-translate-y-px`, visible
  focus ring (2px outline, 2px offset). Focus on dark sections automatically
  switches to vivid orange via `.mkt-night`.
- Text links in copy are underlined or grow a hairline — never color-only.

## 6. Dark sections

- One surface token pair: `bg-night` + `text-night-ink`, muted `night-ash`
  (`#A5A199`, 7.51:1), hairlines `night-line`.
- On dark, accents switch to **vivid** orange (`#FF6A00` = 6.73:1 on night).
- Dark sections may carry one diagonal-hairline texture at ~5% opacity.
- Never mix light cards into a dark section (except the terminal panel, which
  is itself dark: `#151512` on `#0E0E0C`).

## 7. Motion

Allowed and used: scroll-entrance fades/slides (`Reveal`), the integration
marquee, per-line terminal reveals, cycling list highlights, gentle node
pulses in SVGs, hairline hover underlines, the CTA cursor spotlight.

- Entrance: `opacity + 14–20px translate`, `0.7s cubic-bezier(.22,1,.36,1)`,
  staggered with `delay` (60–90ms steps).
- Marquee: 38–44s loops, duplicated track (`aria-hidden` on the duplicate).
- All motion is **CSS-driven** (no SMIL, no WebGL/3D, no scroll-jacking) so
  `prefers-reduced-motion: reduce` neutralizes it globally
  (`globals.css` override) and `.reveal` content shows immediately.
- Performance: no videos, no large images; the only canvas is the hero ASCII
  "Q" (~1–2k `fillText` calls/frame, DPR-capped at 2, static under reduced
  motion, decorative `aria-hidden`).

## 8. Responsive rules

Tested breakpoints: 1440, 1280, 1024, 768, 430, 390.

- Two-column sections collapse to one column below `lg`; copy stays first.
- Hero visual hides below `sm` (phones keep a text-only hero); the tabbed
  preview scrolls horizontally (`overflow-x-auto`) rather than overflowing.
- Navbar: full nav ≥768px, full-screen overlay menu below (Escape closes it,
  body scroll locks, close button stays above the overlay).
- Headline sizes are `clamp()`-based — no fixed breakpoint jumps, no
  horizontal overflow anywhere (`overflow-hidden` on hero/process/marquee).

## 9. Honesty & content rules (marketing)

- **No fabricated proof**: no invented customers, quotes, usage numbers,
  revenue, uptime, certifications or traffic claims. Proof is replaced by
  capability statements.
- Anything illustrative must be labeled at the point of display:
  `Coming soon` (integrations), `Planned coverage` (search surfaces),
  `Sample data` (interface previews), `Illustration` / "Concept preview"
  (terminal metaphor).
- Product meaning, features, integrations and numbers are never invented;
  wording may be adjusted for layout only.
- SEO: one H1 per page, canonical + OG/Twitter metadata, Organization/WebSite
  JSON-LD only (no Review schema without real reviews).

## 10. Marketing vs application UI

| | Marketing (`src/components/marketing/`) | Application (dashboard/auth) |
| --- | --- | --- |
| Tokens | **Only** static brand tokens: `canvas`, `ink`, `ash`, `line`, `tint`, `brand`, `brand-strong`, `brand-ink`, `night*`, `font-display` | Semantic tokens: `background`, `foreground`, `muted`, `border`, `primary`, `card`… |
| Theme | Fixed warm-canvas design, identical in light/dark mode; **no `dark:` variants, no `text-foreground`/`bg-background`** | Follows system/user theme |
| Type | Oversized editorial serif display scale | Compact: 12–16px, dense tables/labels |
| Motion | Section entrances, marquees | Minimal state transitions |
| Goal | Expressive, editorial, premium | Precise, data-focused, operational |

This separation is the leak-proofing rule: marketing CSS never affects app UI,
app theme flips never affect marketing. When building a new public page
(`/pricing`, `/features/*`, `/solutions/*`, `/blog`…), compose **only** from
the shared primitives (`MarketingNavbar`, `MarketingContainer`,
`MarketingSection`, `SectionEyebrow`, `EditorialHeading`, `PrimaryCTA`,
`SecondaryCTA`, `Reveal`, `FeatureRow`, `MetricBlock`, `IntegrationCard`,
`Chip`, `MarketingFooter`) — same tokens, same rhythm, but a page-specific
composition so pages don't look cloned.

## 11. Accessibility floor

- Landmarks: one `<header>`, `<main>`, `<footer>`; labeled `<nav>`s; one H1;
  sequential heading levels.
- Contrast: body text ≥4.5:1, large text/UI ≥3:1 (values in §1).
- Focus: always visible (2px outline, 2px offset), contrast-correct per
  surface. Tabs follow WAI-ARIA (arrow keys, `aria-selected`, panels).
- Decorative SVGs/canvas/grids are `aria-hidden`; icon-only buttons carry
  `aria-label`; reduced motion is honored globally.

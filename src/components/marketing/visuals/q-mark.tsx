/**
 * Abstract QuerySide "Q" mark for the final CTA: concentric rings, orbit
 * nodes and a brand-orange tail. Static SVG (no motion beyond CSS blinks).
 */

const ACCENT = "#ff6a00";

export function QMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 320" fill="none" className={className} aria-hidden>
      {/* outer dashed orbit */}
      <circle
        cx="160"
        cy="160"
        r="148"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 9"
        opacity="0.3"
      />
      {/* rings */}
      <circle cx="160" cy="160" r="122" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      <circle
        cx="160"
        cy="160"
        r="92"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="6 6"
        opacity="0.45"
        className="svg-flow"
      />
      <circle cx="160" cy="160" r="58" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <circle cx="160" cy="160" r="26" fill="currentColor" opacity="0.08" />
      <circle cx="160" cy="160" r="7" fill={ACCENT} className="svg-node-pulse" />

      {/* Q tail */}
      <line
        x1="196"
        y1="196"
        x2="252"
        y2="252"
        stroke={ACCENT}
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* orbit nodes */}
      <circle cx="160" cy="38" r="5" fill="currentColor" opacity="0.7" />
      <circle cx="282" cy="160" r="5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="38" cy="160" r="5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="74" cy="246" r="5" fill="currentColor" opacity="0.45" />
      <circle cx="252" cy="252" r="6" fill={ACCENT} className="svg-node-pulse" />
    </svg>
  );
}

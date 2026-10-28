/**
 * Minimal monochrome capability visuals (200×160) with restrained brand
 * accents. Pure SVG + CSS micro-motion (see `.svg-*` utilities in
 * globals.css), so they are cheap, scalable and honor reduced motion.
 * All are decorative (`aria-hidden` is applied by FeatureRow).
 */

const ACCENT = "#ff6a00";

/** 01 — AI Visibility: brand node connected to answer-engine nodes. */
export function QueryNetworkVisual() {
  const engines = [
    { x: 36, y: 34 },
    { x: 164, y: 34 },
    { x: 176, y: 86 },
    { x: 138, y: 134 },
    { x: 62, y: 134 },
    { x: 24, y: 86 },
  ];
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      {engines.map((node, index) => (
        <line
          key={`line-${index}`}
          x1="100"
          y1="80"
          x2={node.x}
          y2={node.y}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.45"
          className="svg-flow"
          style={{ animationDelay: `${index * 0.25}s` }}
        />
      ))}
      <circle
        cx="100"
        cy="80"
        r="26"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
        className="svg-blink"
      />
      <circle cx="100" cy="80" r="12" fill="currentColor" />
      <circle cx="100" cy="80" r="4" fill={ACCENT} />
      {engines.map((node, index) => (
        <circle
          key={`node-${index}`}
          cx={node.x}
          cy={node.y}
          r="6"
          stroke="currentColor"
          strokeWidth="1.5"
          fill={index === 1 ? ACCENT : "none"}
        />
      ))}
    </svg>
  );
}

/** 02 — Competitor intelligence: share-of-voice bars, "you" highlighted. */
export function ShareOfVoiceVisual() {
  const bars = [
    { y: 24, w: 120, you: true },
    { y: 54, w: 92, you: false },
    { y: 84, w: 70, you: false },
    { y: 114, w: 48, you: false },
  ];
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      <line x1="20" y1="146" x2="180" y2="146" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      {bars.map((bar) => (
        <g key={bar.y}>
          <rect
            x="20"
            y={bar.y}
            width={bar.w}
            height="12"
            fill={bar.you ? ACCENT : "currentColor"}
            opacity={bar.you ? 1 : 0.16}
          />
          <circle
            cx={20 + bar.w}
            cy={bar.y + 6}
            r="3"
            fill={bar.you ? ACCENT : "currentColor"}
            className={bar.you ? "svg-blink" : undefined}
            opacity={bar.you ? 1 : 0.35}
          />
        </g>
      ))}
      <line x1="20" y1="16" x2="20" y2="146" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

/** 03 — Citation intelligence: sources feeding AI answers along paths. */
export function CitationPathsVisual() {
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      {/* source tiles */}
      <rect x="18" y="26" width="18" height="18" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="70" width="18" height="18" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="114" width="18" height="18" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />

      {/* paths */}
      <path
        d="M40 35 C 90 35, 110 60, 152 68"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeDasharray="5 5"
        className="svg-flow"
      />
      <path
        d="M40 79 C 90 79, 110 76, 152 76"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="5 5"
        opacity="0.5"
        className="svg-flow"
        style={{ animationDelay: "0.4s" }}
      />
      <path
        d="M40 123 C 90 123, 110 96, 152 86"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="5 5"
        opacity="0.35"
        className="svg-flow"
        style={{ animationDelay: "0.8s" }}
      />

      {/* answer nodes */}
      <circle cx="160" cy="76" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="160" cy="76" r="4" fill={ACCENT} className="svg-node-pulse" />
      <circle cx="160" cy="76" r="18" stroke="currentColor" strokeWidth="1" opacity="0.3" className="svg-blink" />
    </svg>
  );
}

/** 04 — Technical SEO: page rows with status pills, one flagged. */
export function TechnicalStatusVisual() {
  const rows = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      <rect x="20" y="14" width="160" height="132" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="40" x2="180" y2="40" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="32" cy="27" r="3" fill="currentColor" opacity="0.35" />
      <circle cx="44" cy="27" r="3" fill="currentColor" opacity="0.35" />
      <circle cx="56" cy="27" r="3" fill="currentColor" opacity="0.35" />
      {rows.map((row) => {
        const y = 54 + row * 18;
        const flagged = row === 2;
        return (
          <g key={row}>
            <rect x="32" y={y} width="78" height="7" rx="3.5" fill="currentColor" opacity="0.16" />
            <rect
              x="132"
              y={y - 2}
              width="34"
              height="11"
              rx="5.5"
              fill={flagged ? ACCENT : "currentColor"}
              opacity={flagged ? 1 : 0.14}
              className={flagged ? "svg-blink" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** 05 — Content opportunities: query cluster / opportunity map. */
export function OpportunityMapVisual() {
  const nodes = [
    { x: 44, y: 40, r: 5 },
    { x: 92, y: 28, r: 4 },
    { x: 136, y: 46, r: 6, accent: true },
    { x: 66, y: 92, r: 6 },
    { x: 116, y: 84, r: 4 },
    { x: 156, y: 108, r: 5, accent: true },
    { x: 44, y: 128, r: 4 },
    { x: 100, y: 130, r: 5 },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [0, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [3, 6],
    [4, 7],
    [5, 7],
    [2, 5],
  ];
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      {edges.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
        />
      ))}
      {nodes.map((node, index) => (
        <circle
          key={index}
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={node.accent ? ACCENT : "currentColor"}
          opacity={node.accent ? 1 : 0.55}
          className={node.accent ? "svg-node-pulse" : undefined}
        />
      ))}
      {/* opportunity marker */}
      <g stroke={ACCENT} strokeWidth="1.5">
        <line x1="148" y1="20" x2="148" y2="32" />
        <line x1="142" y1="26" x2="154" y2="26" />
      </g>
    </svg>
  );
}

/** 06 — Search Console insights: clean rising trend with highlighted tail. */
export function TrendGraphVisual() {
  return (
    <svg viewBox="0 0 200 160" fill="none" aria-hidden>
      {[40, 76, 112].map((y) => (
        <line key={y} x1="20" y1={y} x2="180" y2={y} stroke="currentColor" strokeWidth="1" opacity="0.15" />
      ))}
      <line x1="20" y1="140" x2="180" y2="140" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path
        d="M24 124 L56 112 L88 116 L120 92 L152 80 L176 52 L176 140 L24 140 Z"
        fill="currentColor"
        opacity="0.05"
      />
      <path
        d="M24 124 L56 112 L88 116 L120 92 L152 80"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M152 80 L176 52"
        stroke={ACCENT}
        strokeWidth="1.75"
        strokeLinecap="round"
        className="svg-flow"
        strokeDasharray="6 4"
      />
      <circle cx="176" cy="52" r="4.5" fill={ACCENT} className="svg-node-pulse" />
      {[24, 56, 88, 120, 152, 176].map((x) => (
        <line key={x} x1={x} y1="140" x2={x} y2="145" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      ))}
    </svg>
  );
}

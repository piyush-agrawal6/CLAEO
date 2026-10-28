/**
 * Dark-section terminal panel: renders the active step's pseudo-code with a
 * per-line reveal. The snippet is a deliberate visual metaphor — the caption
 * below the panel states it is not a published API.
 */
import type { CSSProperties } from "react";

function highlightLine(line: string, key: string) {
  // Tokenize double-quoted strings so engine/domain names read in brand orange.
  const parts = line.split(/("(?:[^"]*)")/g);
  return parts.map((part, index) =>
    part.startsWith('"') && part.endsWith('"') && part.length > 1 ? (
      <span key={`${key}-s${index}`} className="text-brand">
        {part}
      </span>
    ) : (
      <span key={`${key}-t${index}`}>{part}</span>
    ),
  );
}

export function ProcessTerminal({
  code,
  fileName = "queryside.scan",
  status = "visibility analyzed",
  resetKey,
}: {
  code: string;
  fileName?: string;
  status?: string;
  /** Change to restart the per-line reveal animation. */
  resetKey: number | string;
}) {
  const lines = code.split("\n");

  return (
    <div className="border border-night-line bg-[#151512]">
      {/* Window header */}
      <div className="flex items-center justify-between border-b border-night-line px-5 py-3.5">
        <div className="flex gap-2" aria-hidden>
          <span className="size-2.5 rounded-full bg-night-line" />
          <span className="size-2.5 rounded-full bg-night-line" />
          <span className="size-2.5 rounded-full bg-night-line" />
        </div>
        <span className="font-mono text-[11px] text-night-ash">{fileName}</span>
      </div>

      {/* Code body */}
      <div className="min-h-[300px] p-6 font-mono text-[13px] leading-relaxed lg:p-8">
        <pre className="text-night-ink/85">
          {lines.map((line, lineIndex) => (
            <div
              key={`${resetKey}-${lineIndex}`}
              className="code-line flex gap-4"
              style={{ "--i": lineIndex } as CSSProperties}
            >
              <span
                aria-hidden
                className="w-5 shrink-0 select-none text-right text-night-ash/40"
              >
                {lineIndex + 1}
              </span>
              <span className="whitespace-pre-wrap break-words">
                {line === "" ? "\u00A0" : highlightLine(line, `${resetKey}-${lineIndex}`)}
              </span>
            </div>
          ))}
        </pre>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 border-t border-night-line px-6 py-4">
        <span className="flex items-center gap-2.5 font-mono text-xs text-night-ash">
          <span
            aria-hidden
            className="size-2 rounded-full bg-brand svg-blink"
          />
          status: {status}
          <span aria-hidden className="caret-blink">
            ▍
          </span>
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-night-ash/70 sm:inline">
          illustration
        </span>
      </div>
    </div>
  );
}

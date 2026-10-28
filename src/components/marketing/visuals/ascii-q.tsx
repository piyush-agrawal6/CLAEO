"use client";

import { useEffect, useRef } from "react";

/**
 * Hero visual: a large "Q" rendered in terminal-style ASCII characters with
 * a slow depth shimmer and rare brand-orange flecks. This adapts the
 * Optimus template's technical ASCII sphere into QuerySide's own brand mark
 * — monochrome, lightweight (one 2D canvas, ~1–2k fillText calls/frame) and
 * fully static under `prefers-reduced-motion`.
 */

const CHARSET = "░▒▓█▀▄▌▐";
const ACCENT_RGB = "255, 106, 0";
const INK_RGB = "17, 17, 17";
const SAMPLE_SIZE = 560;

/** Sample the "Q" glyph once into normalized point coordinates. */
function sampleGlyph(): { x: number; y: number; accent: boolean }[] | null {
  const off = document.createElement("canvas");
  off.width = SAMPLE_SIZE;
  off.height = SAMPLE_SIZE;
  const ctx = off.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#000";
  ctx.font = `400 ${Math.round(SAMPLE_SIZE * 0.82)}px "Instrument Serif", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Q", SAMPLE_SIZE / 2, SAMPLE_SIZE / 2 + SAMPLE_SIZE * 0.03);

  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const step = Math.max(5, Math.round(SAMPLE_SIZE / 96));
  const points: { x: number; y: number; accent: boolean }[] = [];
  let i = 0;
  for (let y = 0; y < SAMPLE_SIZE; y += step) {
    for (let x = 0; x < SAMPLE_SIZE; x += step) {
      if (data[(y * SAMPLE_SIZE + x) * 4 + 3] > 120) {
        // Deterministic sparse accents (~5% of cells).
        const accent = (i * 2654435761) % 100 < 5;
        points.push({ x: x / SAMPLE_SIZE, y: y / SAMPLE_SIZE, accent });
        i += 1;
      }
    }
  }
  return points.length > 0 ? points : null;
}

export function AsciiQ({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / unsupported: render nothing (decorative only).

    let frame = 0;
    let raf = 0;
    let points: { x: number; y: number; accent: boolean }[] = [];
    let cancelled = false;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const { width, height } = rect;
      if (width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);

      const cell = width / 74;
      ctx.font = `${Math.round(cell * 1.18)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const glyphBox = Math.min(width, height) * 0.86;
      const offsetX = (width - glyphBox) / 2;
      const offsetY = (height - glyphBox) / 2;
      const time = frame * 0.016;

      for (const point of points) {
        const px = offsetX + point.x * glyphBox;
        const py = offsetY + point.y * glyphBox;
        // Depth shimmer: a travelling wave across the glyph.
        const wave =
          Math.sin(point.x * 7.2 + time * 1.35) *
          Math.cos(point.y * 5.4 - time * 0.9);
        const depth = reduceMotion ? 0.5 : (wave + 1) / 2;
        const char = CHARSET[Math.floor(depth * (CHARSET.length - 1))];
        const alpha = reduceMotion ? 0.55 : 0.16 + depth * 0.62;
        ctx.fillStyle = point.accent
          ? `rgba(${ACCENT_RGB}, ${Math.max(alpha, 0.4).toFixed(3)})`
          : `rgba(${INK_RGB}, ${alpha.toFixed(3)})`;
        ctx.fillText(char, px, py);
      }
    };

    const loop = () => {
      frame += 1;
      draw();
      raf = window.requestAnimationFrame(loop);
    };

    const start = async () => {
      // Wait for the display font so the sampled glyph uses Instrument Serif.
      try {
        await document.fonts?.ready;
      } catch {
        /* fonts API unavailable — sample with fallback font */
      }
      if (cancelled) return;
      points = sampleGlyph() ?? [];
      if (points.length === 0) return;
      resize();
      if (reduceMotion) {
        draw();
        return;
      }
      raf = window.requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      draw();
    };

    void start();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}

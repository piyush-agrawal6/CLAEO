"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-entrance wrapper (IntersectionObserver, fires once).
 *
 * SSR output is hidden and revealed on intersect; without JavaScript the
 * `<noscript>` override in the root layout un-hides it, and users with
 * `prefers-reduced-motion` see content immediately (also enforced in CSS).
 */
export function Reveal({
  children,
  className,
  from = "up",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Entrance direction. */
  from?: "up" | "left" | "right" | "none";
  /** Stagger delay in ms. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Graceful fallbacks: no IO support, test environments, or users who
    // asked for reduced motion get the content immediately. The state update
    // is deferred to the next frame (and CSS independently forces `.reveal`
    // visible under prefers-reduced-motion) to avoid a cascading render.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const raf = window.requestAnimationFrame(() => setInView(true));
      return () => window.cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-from={from}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={cn("reveal", inView && "is-in", className)}
    >
      {children}
    </div>
  );
}

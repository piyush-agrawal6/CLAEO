"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { PrimaryCTA, SecondaryCTA } from "./primitives";

const navLinks = [
  { label: "Product", href: "/#platform" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "For Agencies", href: "/solutions/agencies", wideOnly: true },
];

/**
 * Floating/sticky marketing navbar (Optimus-style): transparent and wide at
 * the top of the page, collapsing into a centered rounded blurred pill once
 * scrolled. Mobile uses a full-screen overlay with staggered links.
 */
export function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the overlay with Escape, and lock body scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  // Never leave the scroll lock behind when the viewport crosses to desktop.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "px-3 pt-3 sm:px-4 sm:pt-4" : "px-0 pt-0",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "relative z-50 mx-auto flex items-center justify-between px-6 transition-all duration-500 lg:px-10",
          scrolled
            ? "h-14 max-w-[1160px] rounded-2xl border border-line bg-canvas/85 shadow-[0_12px_40px_-16px_rgba(17,17,17,0.18)] backdrop-blur-xl"
            : "h-20 max-w-[1400px] border border-transparent bg-transparent",
        )}
      >
        <Link
          href="/"
          aria-label="QuerySide home"
          className="shrink-0 rounded-sm"
          onClick={() => setMenuOpen(false)}
        >
          <Logo
            sideClassName="text-ink"
            wordmarkClassName={cn(
              "transition-all duration-500",
              scrolled ? "text-lg" : "text-xl",
            )}
          />
        </Link>

        {/* Desktop links: hairline grows under the label on hover. */}
        <div className="hidden items-center gap-8 md:flex lg:gap-10">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "group relative text-sm text-ink/70 transition-colors duration-300 hover:text-ink",
                link.wideOnly && "hidden xl:block",
              )}
            >
              {link.label}
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-0 h-px w-0 bg-ink transition-all duration-300 group-hover:w-full"
              />
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/login"
            className="text-sm text-ash transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <PrimaryCTA href="/signup" size="sm">
            Start free
          </PrimaryCTA>
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="-mr-2 rounded-md p-2 text-ink md:hidden"
        >
          {menuOpen ? (
            <XIcon className="size-6" aria-hidden />
          ) : (
            <MenuIcon className="size-6" aria-hidden />
          )}
        </button>
      </nav>

      {/* Mobile full-screen overlay */}
      <div
        id="mobile-nav"
        className={cn(
          "fixed inset-0 z-40 bg-canvas transition-all duration-300 md:hidden",
          menuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex h-full flex-col px-6 pb-8 pt-24">
          <nav
            aria-label="Mobile"
            className="flex flex-1 flex-col justify-center gap-6"
          >
            {navLinks.map((link, index) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "font-display text-4xl text-ink transition-all duration-500",
                  menuOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0",
                  link.wideOnly && "hidden sm:block",
                )}
                style={{
                  transitionDelay: menuOpen ? `${index * 70}ms` : "0ms",
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div
            className={cn(
              "flex flex-col gap-3 border-t border-line pt-6 transition-all duration-500 sm:flex-row",
              menuOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-4 opacity-0",
            )}
            style={{ transitionDelay: menuOpen ? "320ms" : "0ms" }}
          >
            <SecondaryCTA href="/login" className="flex-1">
              Sign in
            </SecondaryCTA>
            <PrimaryCTA href="/signup" className="flex-1">
              Start free
            </PrimaryCTA>
          </div>
        </div>
      </div>
    </header>
  );
}

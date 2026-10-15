"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "@/components/layout/nav-items";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  /** Called after navigating (closes the mobile drawer). */
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" onClick={onNavigate} className="text-sidebar-foreground">
          <Logo />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="text-muted-foreground mb-1.5 px-2 text-[11px] font-medium tracking-wide uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href
                  ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                  : false;
                const Icon = item.icon;

                if (!item.href) {
                  return (
                    <li key={item.label}>
                      <span
                        aria-disabled="true"
                        className="text-muted-foreground/70 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          Soon
                        </Badge>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

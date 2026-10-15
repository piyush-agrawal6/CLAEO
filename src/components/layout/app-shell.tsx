"use client";

import { MenuIcon, XIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

interface AppShellProps {
  user: {
    name: string | null;
    email: string;
  };
  workspace: {
    name: string;
    plan: string;
  };
  /** True when provider mocks are active (development labeling). */
  mockMode: boolean;
  children: React.ReactNode;
}

/**
 * Authenticated app layout: fixed sidebar (desktop), drawer (mobile),
 * compact topbar with workspace context, mock-mode label, theme toggle and
 * account menu.
 */
export function AppShell({ user, workspace, mockMode, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="bg-background min-h-svh">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 border-r lg:block">
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="bg-sidebar border-sidebar-border absolute inset-y-0 left-0 w-64 border-r shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              className="absolute top-3 right-2 z-10"
              onClick={() => setMobileNavOpen(false)}
            >
              <XIcon className="size-4" />
            </Button>
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-60">
        {/* Topbar */}
        <header className="bg-background/85 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              <MenuIcon className="size-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{workspace.name}</p>
              <p className="text-muted-foreground truncate text-xs capitalize">
                {workspace.plan} plan
              </p>
            </div>

            {mockMode ? (
              <Badge variant="warning" className="hidden sm:inline-flex">
                Mock providers
              </Badge>
            ) : null}

            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

import {
  BarChart3Icon,
  FileSearchIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  MessageSquareTextIcon,
  QuoteIcon,
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";

/**
 * Navigation registry.
 *
 * Items without `href` are planned sections that render as disabled entries
 * with a "Soon" badge — no dead links, no fake pages.
 */

export interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboardIcon },
      { label: "Domains", href: "/domains", icon: GlobeIcon },
      { label: "AI Visibility", icon: SparklesIcon, soon: true },
      { label: "Prompts", icon: MessageSquareTextIcon, soon: true },
      { label: "Competitors", icon: UsersIcon, soon: true },
      { label: "Citations", icon: QuoteIcon, soon: true },
      { label: "Site Audit", icon: FileSearchIcon, soon: true },
      { label: "Action Center", icon: TargetIcon, soon: true },
      { label: "Analytics", icon: BarChart3Icon, soon: true },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/settings", icon: SettingsIcon }],
  },
];

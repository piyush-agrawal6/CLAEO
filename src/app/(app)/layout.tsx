import { AppShell } from "@/components/layout/app-shell";
import { env } from "@/lib/env";
import { requirePageWorkspace } from "@/lib/auth/session";

/**
 * Protected application shell. `requirePageWorkspace` re-verifies the
 * session against the database (existence, email verification, session
 * version) and redirects unauthenticated users before anything renders.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requirePageWorkspace();

  const mockMode = env.AI_MOCK_MODE || env.DATAFORSEO_MOCK_MODE;

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspace={{ name: membership.workspace.name, plan: membership.workspace.plan }}
      mockMode={mockMode}
    >
      {children}
    </AppShell>
  );
}

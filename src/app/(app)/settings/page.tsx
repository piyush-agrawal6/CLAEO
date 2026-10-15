import type { Metadata } from "next";
import { ProfileForm, WorkspaceForm } from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageWorkspace } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/usage/limits";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { user, membership } = await requirePageWorkspace();
  const planLimits = getPlanLimits(membership.workspace.plan);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Workspace and account preferences." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Workspace
            <Badge variant="secondary" className="capitalize">
              {membership.workspace.plan}
            </Badge>
          </CardTitle>
          <CardDescription>
            {planLimits.domains} domain{planLimits.domains === 1 ? "" : "s"} ·{" "}
            {planLimits.prompts} prompts · {planLimits.engines} AI engine
            {planLimits.engines === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WorkspaceForm defaultName={membership.workspace.name} />
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              Workspace URL: <span className="font-mono">/w/{membership.workspace.slug}</span>
            </p>
            <p>Billing and plan upgrades arrive with the billing phase.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your personal details.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultName={user.name ?? ""} email={user.email} />
        </CardContent>
      </Card>
    </div>
  );
}

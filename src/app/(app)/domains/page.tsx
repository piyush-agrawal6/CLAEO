import type { Metadata } from "next";
import { DomainForm } from "@/components/domains/domain-form";
import { DomainList } from "@/components/domains/domain-list";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageWorkspace } from "@/lib/auth/session";
import { listDomains } from "@/server/repositories/domain-repository";
import { getPlanLimits } from "@/lib/usage/limits";

export const metadata: Metadata = {
  title: "Domains",
};

export default async function DomainsPage() {
  const { membership } = await requirePageWorkspace();
  const domains = await listDomains(membership.workspace.id);
  const planLimits = getPlanLimits(membership.workspace.plan);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="The websites Claeo tracks for this workspace."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a domain</CardTitle>
          <CardDescription>
            Your {membership.workspace.plan} plan tracks up to{" "}
            {planLimits.domains} domain{planLimits.domains === 1 ? "" : "s"} and{" "}
            {planLimits.prompts} prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DomainForm />
        </CardContent>
      </Card>

      <DomainList domains={domains} />
    </div>
  );
}

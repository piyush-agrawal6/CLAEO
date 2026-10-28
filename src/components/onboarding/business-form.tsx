"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkipStepButton } from "@/components/onboarding/skip-step-button";
import { saveBusinessProfileAction } from "@/features/onboarding/actions";
import { initialOnboardingActionState } from "@/features/onboarding/schemas";
import { INDUSTRIES } from "@/server/services/discovery/fixtures";

const INDUSTRY_LABELS: Record<string, string> = {
  software: "Software / SaaS",
  ecommerce: "E-commerce / retail",
  agency: "Agency / services",
  healthcare: "Healthcare",
  finance: "Finance",
  education: "Education",
  realestate: "Real estate",
  hospitality: "Hospitality / travel",
  fitness: "Fitness / wellness",
  legal: "Legal",
  manufacturing: "Manufacturing",
  media: "Media / publishing",
  other: "Other / not sure",
};

const selectClassName =
  "border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save and continue"}
    </Button>
  );
}

export interface BusinessProfilePrefill {
  name: string;
  tagline: string;
  description: string;
  industry: string;
  audience: string;
  /** Pre-filled product labels, one per line. */
  products: string;
  source: "crawl" | "manual";
}

/**
 * Step 3: business profile. Prefilled from the crawl suggestion (clearly
 * labeled) or from a previously saved manual profile; fully editable.
 */
export function BusinessForm({
  domainId,
  callbackUrl,
  prefill,
  suggestionUnavailable,
}: {
  domainId: string;
  callbackUrl: string;
  prefill: BusinessProfilePrefill | null;
  suggestionUnavailable: boolean;
}) {
  const [state, formAction] = useActionState(saveBusinessProfileAction, initialOnboardingActionState);
  const error = (key: string) => state.fieldErrors?.[key]?.[0];

  return (
    <div className="space-y-4">
      {prefill?.source === "crawl" ? (
        <Alert variant="info">
          These values were suggested from your site&apos;s crawl — review them and edit
          anything that is not quite right before saving.
        </Alert>
      ) : null}
      {suggestionUnavailable && !prefill ? (
        <Alert variant="info">
          Automatic suggestions are unavailable right now. Fill in your details below —
          nothing here is required to be perfect, and you can change it later.
        </Alert>
      ) : null}
      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="domainId" value={domainId} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bp-name">Business name</Label>
            <Input
              id="bp-name"
              name="name"
              defaultValue={prefill?.name ?? ""}
              placeholder="Acme Inc."
              required
              aria-invalid={Boolean(error("name"))}
            />
            {error("name") ? (
              <p className="text-destructive text-xs">{error("name")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bp-industry">Industry</Label>
            <select
              id="bp-industry"
              name="industry"
              defaultValue={prefill?.industry ?? "other"}
              className={selectClassName}
            >
              {INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {INDUSTRY_LABELS[industry] ?? industry}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-tagline">Tagline</Label>
          <Input
            id="bp-tagline"
            name="tagline"
            defaultValue={prefill?.tagline ?? ""}
            placeholder="One sentence that describes what you do"
          />
          {error("tagline") ? (
            <p className="text-destructive text-xs">{error("tagline")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-description">Description</Label>
          <Textarea
            id="bp-description"
            name="description"
            rows={3}
            defaultValue={prefill?.description ?? ""}
            placeholder="What you offer and who it is for"
          />
          {error("description") ? (
            <p className="text-destructive text-xs">{error("description")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-audience">Who you serve</Label>
          <Input
            id="bp-audience"
            name="audience"
            defaultValue={prefill?.audience ?? ""}
            placeholder="e.g. Independent online stores in the EU"
          />
          {error("audience") ? (
            <p className="text-destructive text-xs">{error("audience")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-products">Products / services</Label>
          <Textarea
            id="bp-products"
            name="products"
            rows={3}
            defaultValue={prefill?.products ?? ""}
            placeholder={"One per line, e.g.\nanalytics dashboard\nonboarding consulting"}
          />
          <p className="text-muted-foreground text-xs">One per line (up to 8).</p>
          {error("products") ? (
            <p className="text-destructive text-xs">{error("products")}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <SkipStepButton step="business" callbackUrl={callbackUrl} variant="outline" />
      </div>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDomainAction } from "@/features/domains/actions";
import { initialDomainActionState } from "@/features/domains/schemas";

const formSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "Domain is required")
    .max(253, "Domain is too long"),
  name: z.string().trim().max(80, "Name is too long").optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Add-domain form (foundation of onboarding; the full analysis wizard is
 * the next phase). Uses React Hook Form + Zod for instant feedback, with
 * server-side validation as the source of truth.
 */
export function DomainForm() {
  const [state, formAction, pending] = useActionState(
    createDomainAction,
    initialDomainActionState
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { domain: "", name: "" },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("domain", values.domain);
    if (values.name) formData.set("name", values.name);
    formAction(formData);
    reset();
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      className="space-y-4"
      noValidate
    >
      {state.status === "error" && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}
      {state.status === "success" && state.message ? (
        <Alert variant="success">{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            placeholder="example.com"
            autoComplete="url"
            aria-invalid={Boolean(errors.domain)}
            {...register("domain")}
          />
          {errors.domain ? (
            <p className="text-destructive text-xs">{errors.domain.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Display name (optional)</Label>
          <Input id="name" placeholder="Acme" {...register("name")} />
          {errors.name ? (
            <p className="text-destructive text-xs">{errors.name.message}</p>
          ) : null}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add domain"}
      </Button>
    </form>
  );
}

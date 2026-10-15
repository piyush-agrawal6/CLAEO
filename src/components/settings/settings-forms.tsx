"use client";

import { useActionState } from "react";
import { Alert } from "@/components/common/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, updateWorkspaceAction } from "@/features/settings/actions";
import {
  initialSettingsActionState,
  type SettingsActionState,
} from "@/features/settings/schemas";

export function WorkspaceForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateWorkspaceAction,
    initialSettingsActionState
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? (
        <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          defaultValue={defaultName}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

export function ProfileForm({
  defaultName,
  email,
}: {
  defaultName: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateProfileAction,
    initialSettingsActionState
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? (
        <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="name"
          defaultValue={defaultName}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email} disabled />
        <p className="text-muted-foreground text-xs">
          Email changes are not supported yet.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

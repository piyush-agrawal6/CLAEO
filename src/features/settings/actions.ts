"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { updateUserName } from "@/server/repositories/user-repository";
import {
  getMembershipForUser,
  updateWorkspace,
} from "@/server/repositories/workspace-repository";
import type { SettingsActionState } from "@/features/settings/schemas";

const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Workspace name must be at least 2 characters")
  .max(80, "Workspace name must be at most 80 characters");

const profileNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters");

export async function updateWorkspaceAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const user = await requireUserContext();
    const membership = await getMembershipForUser(user.id);
    if (!membership) {
      return { status: "error", message: "No workspace found for this account." };
    }

    const parsed = workspaceNameSchema.safeParse(formData.get("name"));
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { name: parsed.error.issues.map((i) => i.message) },
      };
    }

    await updateWorkspace(membership.workspace.id, { name: parsed.data });
    revalidatePath("/settings");
    return { status: "success", message: "Workspace updated." };
  } catch (error) {
    reportError(error, { action: "updateWorkspace" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

export async function updateProfileAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const user = await requireUserContext();

    const parsed = profileNameSchema.safeParse(formData.get("name"));
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { name: parsed.error.issues.map((i) => i.message) },
      };
    }

    await updateUserName(user.id, parsed.data);
    revalidatePath("/settings");
    return { status: "success", message: "Profile updated." };
  } catch (error) {
    reportError(error, { action: "updateProfile" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

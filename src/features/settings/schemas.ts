/**
 * Shared state shape for settings actions (`useActionState`).
 *
 * Kept outside the "use server" file because server-action modules may only
 * export async functions.
 */
export interface SettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const initialSettingsActionState: SettingsActionState = { status: "idle" };

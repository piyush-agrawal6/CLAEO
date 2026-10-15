/**
 * Shared state shape for domain actions (`useActionState`).
 *
 * Kept outside the "use server" file because server-action modules may only
 * export async functions.
 */
export interface DomainActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const initialDomainActionState: DomainActionState = { status: "idle" };

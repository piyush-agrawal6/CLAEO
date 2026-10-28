/**
 * Shared state shape for intelligence actions (`useActionState`).
 *
 * Kept outside the "use server" files because server-action modules may only
 * export async functions.
 */
export interface IntelligenceActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const initialIntelligenceActionState: IntelligenceActionState = {
  status: "idle",
};

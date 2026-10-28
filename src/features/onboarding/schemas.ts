import { z } from "zod";
import { INDUSTRIES } from "@/server/services/discovery/fixtures";

/**
 * Shared shapes for onboarding actions (`useActionState`).
 *
 * Kept outside the "use server" file because server-action modules may only
 * export async functions.
 */

export interface OnboardingActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const initialOnboardingActionState: OnboardingActionState = { status: "idle" };

export const businessProfileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(80, "Keep the name under 80 characters"),
  tagline: z.string().trim().max(200, "Keep the tagline under 200 characters"),
  description: z.string().trim().max(1000, "Keep the description under 1000 characters"),
  industry: z.enum(INDUSTRIES),
  audience: z.string().trim().max(200, "Keep the audience under 200 characters"),
  products: z.array(z.string().trim().min(1).max(80, "Each product label is capped at 80 characters")).max(8),
});
export type BusinessProfileFormInput = z.infer<typeof businessProfileFormSchema>;

export const competitorRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Keep the name under 80 characters"),
  domain: z.string().trim().min(1, "Domain is required").max(253),
});

export const skipStepSchema = z.enum(["analyzing", "business", "competitors", "queries"]);

export const manualQueryLineSchema = z.string().trim().min(2, "Queries need at least 2 characters").max(200);

/** Splits a textarea value into trimmed, non-empty lines. */
export function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

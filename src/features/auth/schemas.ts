import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/security/password";

/** Shared auth validation schemas (single source of truth, Zod v4). */

export const emailSchema = z.email("Enter a valid email address").trim().toLowerCase().max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters"),
  email: emailSchema,
  password: passwordSchema,
  callbackUrl: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(PASSWORD_MAX_LENGTH),
  callbackUrl: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(200),
  email: emailSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

/** Standard state shape for auth forms using `useActionState`. */
export interface AuthFormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Email captured by the form so retries don't require retyping. */
  email?: string;
  /** Development-only flag when auto-verification kicked in. */
  devAutoVerified?: boolean;
}

export const initialAuthFormState: AuthFormState = { status: "idle" };

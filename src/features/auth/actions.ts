"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { googleAuthConfigured, signIn, signOut } from "@/auth";
import { sendEmail } from "@/lib/email";
import {
  accountExistsEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
  welcomeEmail,
} from "@/lib/email/templates";
import { env } from "@/lib/env";
import { reportError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { hashPassword } from "@/lib/security/password";
import { rateLimit, resolveClientIp } from "@/lib/security/rate-limit";
import { safeCallbackUrl } from "@/lib/utils";
import {
  isNextNavigationError,
  resolvePostAuthRedirect,
} from "@/features/auth/redirects";
import {
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  type AuthFormState,
} from "@/features/auth/schemas";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import {
  bumpUserSessionVersion,
  findUserByEmail,
  findUserById,
  updateUserPasswordHash,
  verifyUserEmail,
} from "@/server/repositories/user-repository";
import { createUserWithWorkspace } from "@/server/services/user-service";
import { isOnboardingComplete } from "@/server/services/onboarding-service";
import {
  consumePasswordResetToken,
  consumeVerificationToken,
  createPasswordResetToken,
  createVerificationToken,
} from "@/server/services/token-service";

/**
 * Authentication server actions.
 *
 * Every action:
 * - rate-limits by IP and/or identifier BEFORE doing any work
 * - validates input with Zod
 * - never reveals whether an email exists (enumeration resistance)
 * - reports unexpected errors server-side with redacted context
 */

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

async function clientIp(): Promise<string> {
  const headersList = await headers();
  return resolveClientIp(headersList);
}

/* --------------------------------- signup -------------------------------- */

export async function signupAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = await clientIp();

  const byIp = await rateLimit({ key: `auth:signup:ip:${ip}`, limit: 5, windowSeconds: 900 });
  if (!byIp.allowed) {
    return {
      status: "error",
      message: "Too many sign-up attempts from this network. Please try again later.",
    };
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const { name, email, password } = parsed.data;

  const byEmail = await rateLimit({
    key: `auth:signup:email:${email}`,
    limit: 3,
    windowSeconds: 3600,
  });
  if (!byEmail.allowed) {
    return {
      status: "error",
      message: "Too many attempts for this email. Please try again later.",
    };
  }

  try {
    await createUserWithWorkspace({ name, email, password });
  } catch (error) {
    // Whether or not the account existed, the response is identical.
    const existing = await findUserByEmail(email).catch(() => null);
    if (existing) {
      if (!existing.emailVerified) {
        // Re-issue a verification token; do not disclose that we did.
        const token = await createVerificationToken(email);
        await sendEmail({ ...verificationEmail(email, token), to: email, tag: "verify-email" });
      } else {
        await sendEmail({ ...accountExistsEmail(), to: email, tag: "account-exists" });
      }
      logger.info("Signup attempt for existing account", { email });
      return {
        status: "success",
        email,
        message:
          "If this email can be registered, a verification link has been sent. Check your inbox.",
      };
    }
    reportError(error, { action: "signup", email });
    return {
      status: "error",
      message: "We could not create your account right now. Please try again.",
    };
  }

  await recordAuditLog({ action: "auth.signup", targetType: "user", ip }).catch(() => undefined);

  // Development convenience: auto-verify when no email provider is
  // configured. Impossible in production (`NODE_ENV` check below).
  const autoVerify =
    env.AUTH_DEV_AUTO_VERIFY && env.NODE_ENV !== "production" && !env.RESEND_API_KEY;

  if (autoVerify) {
    const user = await findUserByEmail(email);
    if (user) await verifyUserEmail(user.id);
    logger.info("Development auto-verification applied", { email });
    return {
      status: "success",
      email,
      devAutoVerified: true,
      message: "Account created and email auto-verified (development mode). You can sign in now.",
    };
  }

  const token = await createVerificationToken(email);
  const delivery = await sendEmail({
    ...verificationEmail(email, token),
    to: email,
    tag: "verify-email",
  });

  if (!delivery.ok) {
    logger.error("Verification email could not be delivered", { email });
    return {
      status: "success",
      email,
      message:
        "Your account was created, but the verification email could not be sent. Please contact support.",
    };
  }

  return {
    status: "success",
    email,
    message:
      "Almost there — check your inbox and click the verification link to activate your account.",
  };
}

/* ---------------------------------- login -------------------------------- */

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = await clientIp();

  const byIp = await rateLimit({ key: `auth:login:ip:${ip}`, limit: 20, windowSeconds: 900 });
  if (!byIp.allowed) {
    return {
      status: "error",
      message: "Too many sign-in attempts from this network. Please try again later.",
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const { email, password, callbackUrl } = parsed.data;

  const byEmail = await rateLimit({
    key: `auth:login:email:${email}`,
    limit: 10,
    windowSeconds: 900,
  });
  if (!byEmail.allowed) {
    return {
      status: "error",
      message: "Too many attempts for this email. Please try again later.",
    };
  }

  // Cheap pre-check so unverified users get an actionable message instead
  // of a generic failure (no password verification happens here).
  const user = await findUserByEmail(email).catch(() => null);
  if (user && user.passwordHash && !user.emailVerified) {
    return {
      status: "error",
      email,
      message: "Your email is not verified yet. Check your inbox for the verification link.",
    };
  }

  // Post-auth destination: sanitized callback, or onboarding state when the
  // user has not completed setup yet (unknown for failing sign-ins — the
  // value is only used once `signIn` succeeds).
  const onboardingComplete = user ? await isOnboardingComplete(user.id) : false;
  const redirectTo = resolvePostAuthRedirect({ callbackUrl, onboardingComplete });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      logger.info("Login failed", { email, type: error.type });
      return {
        status: "error",
        email,
        message: "Invalid email or password.",
      };
    }
    // Success throws Next's redirect control-flow error — it must reach
    // the framework or the browser never navigates (the session cookie is
    // already set at that point).
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "login", email });
    return {
      status: "error",
      email,
      message: "We could not sign you in right now. Please try again.",
    };
  }

  // Defensive: `signIn` redirects on success, so this is never reached.
  redirect(redirectTo);
}

/* ----------------------------- email verification ------------------------ */

export async function verifyEmailAction(formData: FormData): Promise<void> {
  const ip = await clientIp();
  const byIp = await rateLimit({ key: `auth:verify:ip:${ip}`, limit: 20, windowSeconds: 900 });
  if (!byIp.allowed) {
    redirect("/verify-email?error=rate_limited");
  }

  const parsed = verifyEmailSchema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    redirect("/verify-email?error=invalid");
  }

  const { token, email } = parsed.data;
  const valid = await consumeVerificationToken(token, email);
  if (!valid) {
    redirect("/verify-email?error=expired");
  }

  const user = await findUserByEmail(email);
  if (user) {
    await verifyUserEmail(user.id);
    await recordAuditLog({
      userId: user.id,
      action: "auth.email_verified",
      targetType: "user",
      targetId: user.id,
      ip,
    }).catch(() => undefined);
    await sendEmail({ ...welcomeEmail(user.name), to: email, tag: "welcome" });
  }

  redirect("/login?verified=1");
}

export async function resendVerificationAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = await clientIp();
  const byIp = await rateLimit({ key: `auth:resend:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!byIp.allowed) {
    return { status: "error", message: "Too many requests. Please try again later." };
  }

  const parsed = resendVerificationSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { email } = parsed.data;

  const byEmail = await rateLimit({
    key: `auth:resend:email:${email}`,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!byEmail.allowed) {
    return { status: "error", email, message: "Too many requests. Please try again later." };
  }

  const user = await findUserByEmail(email).catch(() => null);
  if (user && !user.emailVerified) {
    const token = await createVerificationToken(email);
    await sendEmail({ ...verificationEmail(email, token), to: email, tag: "verify-email" });
  }

  return {
    status: "success",
    email,
    message: "If this email needs verification, a new link is on its way.",
  };
}

/* ------------------------------ password reset --------------------------- */

export async function forgotPasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = await clientIp();
  const byIp = await rateLimit({ key: `auth:forgot:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!byIp.allowed) {
    return { status: "error", message: "Too many requests. Please try again later." };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { email } = parsed.data;

  const byEmail = await rateLimit({
    key: `auth:forgot:email:${email}`,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!byEmail.allowed) {
    return { status: "error", email, message: "Too many requests. Please try again later." };
  }

  const user = await findUserByEmail(email).catch(() => null);
  if (user) {
    const token = await createPasswordResetToken(user.id);
    await sendEmail({ ...passwordResetEmail(email, token), to: email, tag: "password-reset" });
    logger.info("Password reset requested", { userId: user.id });
  }

  return {
    status: "success",
    email,
    message: "If an account exists for this email, a reset link has been sent.",
  };
}

export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = await clientIp();
  const byIp = await rateLimit({ key: `auth:reset:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!byIp.allowed) {
    return { status: "error", message: "Too many requests. Please try again later." };
  }

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const { token, password } = parsed.data;
  const userId = await consumePasswordResetToken(token);
  if (!userId) {
    return {
      status: "error",
      message: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const passwordHash = await hashPassword(password);
  await updateUserPasswordHash(userId, passwordHash);
  // Invalidate every outstanding session for this user.
  await bumpUserSessionVersion(userId);
  await recordAuditLog({
    userId,
    action: "auth.password_reset",
    targetType: "user",
    targetId: userId,
    ip,
  }).catch(() => undefined);

  const user = await findUserById(userId).catch(() => null);
  if (user?.email) {
    await sendEmail({ ...passwordChangedEmail(), to: user.email, tag: "password-changed" });
  }

  return {
    status: "success",
    message: "Your password has been updated. Sign in with your new password.",
  };
}

/* --------------------------------- misc ---------------------------------- */

export async function signoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Start the shared Auth.js Google flow (sign-in AND sign-up converge here —
 * provisioning decisions happen inside the OAuth callback, never in a
 * separate "Google signup" backend).
 *
 * `callbackUrl` (when present) was already sanitized by the login page; it
 * is sanitized again here. New Google users are routed to /onboarding by
 * `pages.newUser`; existing users return to the sanitized destination.
 */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const rawCallback = formData.get("callbackUrl");
  const redirectTo = safeCallbackUrl(
    typeof rawCallback === "string" ? rawCallback : null
  );

  if (!googleAuthConfigured) {
    // Provider not registered (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).
    redirect("/login?error=Configuration");
  }

  const ip = await clientIp();
  const byIp = await rateLimit({ key: `auth:google:ip:${ip}`, limit: 10, windowSeconds: 900 });
  if (!byIp.allowed) {
    redirect("/login?error=RateLimited");
  }

  try {
    await signIn("google", { redirectTo });
  } catch (error) {
    // Auth.js failures (bad state, provider errors, the verified-email
    // gate's AccessDenied...) surface on the login page; unknown error
    // types fall back to its default message.
    if (error instanceof AuthError) {
      logger.info("Google sign-in failed", { type: error.type });
      redirect(`/login?error=${encodeURIComponent(error.type)}`);
    }
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "google-signin" });
    redirect("/login?error=Configuration");
  }

  // Defensive: `signIn` redirects on success, so this is never reached.
  redirect("/login");
}

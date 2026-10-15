import { appUrl } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email/templates/layout";

export function verificationEmail(email: string, token: string) {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
  return renderEmailLayout({
    subject: "Verify your email - Claeo",
    preheader: "Confirm your email address to activate your account.",
    heading: "Verify your email",
    body: `<p>Welcome to Claeo. Confirm this email address to activate your account.</p>
<p>This link expires in 24 hours and can only be used once.</p>`,
    action: { label: "Verify email", url },
    footer: "If you didn't create a Claeo account, you can safely ignore this email.",
  });
}

export function passwordResetEmail(email: string, token: string) {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
  return renderEmailLayout({
    subject: "Reset your Claeo password",
    preheader: "Reset your Claeo password.",
    heading: "Reset your password",
    body: `<p>We received a request to reset the password for this account.</p>
<p>The link expires in 1 hour and can only be used once. If you didn't request this, ignore this email — your password stays unchanged.</p>`,
    action: { label: "Reset password", url },
    footer: "For security, we never show or store your password in plain text.",
  });
}

export function accountExistsEmail() {
  return renderEmailLayout({
    subject: "You already have a Claeo account",
    preheader: "You already have a Claeo account.",
    heading: "You already have an account",
    body: `<p>Someone tried to sign up with this email address, but an account already exists.</p>
<p>If this was you, simply sign in. If you've forgotten your password, use the "Forgot password" link on the sign-in page.</p>`,
    action: { label: "Sign in", url: appUrl("/login") },
    footer: "If you didn't attempt this, no action is required.",
  });
}

export function passwordChangedEmail() {
  return renderEmailLayout({
    subject: "Your Claeo password was changed",
    preheader: "Your Claeo password was changed.",
    heading: "Password changed",
    body: `<p>Your password was just changed. All existing sessions have been signed out.</p>
<p>If this wasn't you, reset your password immediately and review your account security.</p>`,
    action: { label: "Reset password", url: appUrl("/forgot-password") },
    footer: "This is a security notification from Claeo.",
  });
}

export function welcomeEmail(name: string | null) {
  return renderEmailLayout({
    subject: "Welcome to Claeo",
    preheader: "Get started with your first AI visibility scan.",
    heading: `Welcome${name ? `, ${name}` : ""}!`,
    body: `<p>Your Claeo workspace is ready.</p>
<p>Next steps: add your company domain, review the suggested prompts, and run your first AI visibility scan.</p>`,
    action: { label: "Open dashboard", url: appUrl("/dashboard") },
    footer: "Claeo — see where your brand appears in AI answers, and what to fix first.",
  });
}

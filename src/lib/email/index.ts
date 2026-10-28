import { Resend } from "resend";
import { env } from "@/lib/env";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";

/**
 * Email delivery (Resend) with a development fallback.
 *
 * - Production: requires RESEND_API_KEY; failures are logged and surfaced as
 *   `ok: false` — callers decide whether delivery failure is fatal.
 * - Development without a key: emails are logged (subject + body) so flows
 *   remain testable locally. The log includes one-time tokens; acceptable
 *   for local dev only and impossible when NODE_ENV=production.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Tag for analytics/dedup, e.g. "verify-email". */
  tag?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Set when the message was delivered to the dev log instead of Resend. */
  devTransport?: boolean;
  error?: string;
}

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new ConfigurationError("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      logger.error("Email delivery skipped: RESEND_API_KEY not configured", {
        to: "[redacted]",
        tag: input.tag,
      });
      metrics.increment("email.failed", { tag: input.tag ?? "unknown" });
      return { ok: false, error: "Email provider is not configured" };
    }

    logger.info("Development email transport", {
      to: input.to,
      subject: input.subject,
      tag: input.tag,
      text: input.text,
    });
    metrics.increment("email.dev_transport", { tag: input.tag ?? "unknown" });
    return { ok: true, devTransport: true };
  }

  try {
    const resend = getResend();
    const from = env.EMAIL_FROM?.trim() || "QuerySide <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.tag ? { tags: [{ name: "category", value: input.tag }] } : {}),
    });
    if (error) {
      logger.error("Resend reported an error", { tag: input.tag, error: error.message });
      metrics.increment("email.failed", { tag: input.tag ?? "unknown" });
      return { ok: false, error: "Email delivery failed" };
    }
    metrics.increment("email.sent", { tag: input.tag ?? "unknown" });
    return { ok: true };
  } catch (error) {
    logger.error("Email delivery failed unexpectedly", {
      error,
      tag: input.tag,
    });
    metrics.increment("email.failed", { tag: input.tag ?? "unknown" });
    return { ok: false, error: "Email delivery failed" };
  }
}

/** Absolute app URL helper for links in emails. */
export function appUrl(path: string): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

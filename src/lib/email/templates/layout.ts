/**
 * Shared email template.
 *
 * Plain, professional, high-contrast HTML that renders well in Gmail/Outlook.
 * No tracking pixels, no external assets, minimal weight.
 */

const COLORS = {
  background: "#fafafa",
  card: "#ffffff",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#71717a",
  accent: "#2563eb",
};

export interface EmailLayoutInput {
  /** Email subject line. */
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  /** Optional call-to-action button. */
  action?: { label: string; url: string };
  footer: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderEmailLayout(
  input: EmailLayoutInput
): { subject: string; html: string; text: string } {
  const actionHtml = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:6px;background:${COLORS.accent}">
        <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(input.action.label)}</a>
      </td></tr></table>
      <p style="font-size:13px;color:${COLORS.muted};word-break:break-all">If the button does not work, open this link:<br>${escapeHtml(input.action.url)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:10px;padding:32px">
          <tr><td>
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.accent}">Claeo</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text}">${escapeHtml(input.heading)}</h1>
            <div style="font-size:15px;line-height:1.6;color:${COLORS.text}">${input.body}</div>
            ${actionHtml}
            <hr style="border:none;border-top:1px solid ${COLORS.border};margin:24px 0">
            <p style="margin:0;font-size:12px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(input.footer)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    input.heading,
    "",
    input.body.replace(/<[^>]+>/g, ""),
    input.action ? `\n${input.action.label}: ${input.action.url}` : "",
    "",
    input.footer,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject: input.subject, html, text };
}

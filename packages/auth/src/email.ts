/**
 * Thin Resend wrapper with a dev/no-key console fallback (ported from v1).
 *
 * When RESEND_API_KEY is absent (local dev, or a deploy without email), emails
 * are logged instead of sent, so non-email deploys are unaffected. sendEmail()
 * throws on Resend API errors — callers decide whether to swallow them (most
 * transactional sends are fire-and-forget and must never block the mutation).
 */

import { env } from "@Heimdallone/env/server";
import { Resend } from "resend";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface SendEmailOptions {
	html: string;
	subject: string;
	to: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
	if (!resend) {
		console.log(
			`[email] DEV — would send to ${opts.to} | subject: "${opts.subject}"`
		);
		return;
	}
	const { error } = await resend.emails.send({
		from: env.EMAIL_FROM,
		html: opts.html,
		subject: opts.subject,
		to: [opts.to],
	});
	if (error) {
		throw new Error(`Resend error: ${error.message}`);
	}
}

/** Minimal branded HTML wrapper for transactional emails. */
export function emailLayout(opts: {
	heading: string;
	bodyHtml: string;
	ctaLabel?: string;
	ctaUrl?: string;
}): string {
	const cta =
		opts.ctaLabel && opts.ctaUrl
			? `<p style="margin:24px 0;"><a href="${opts.ctaUrl}" style="display:inline-block;padding:11px 20px;background:#1f2a44;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${opts.ctaLabel}</a></p>`
			: "";
	return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">${opts.heading}</h1>
      <div style="font-size:14px;line-height:1.55;color:#334155;">${opts.bodyHtml}</div>
      ${cta}
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">Heimdallone · This is an automated message.</p>
  </div>
</body></html>`;
}

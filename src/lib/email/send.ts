import nodemailer from "nodemailer";

import {
  formatFromHeader,
  type OutboundEmailConfig,
  type OutboundSmtpConfig,
  type SmtpEncryption,
} from "@/lib/email/outbound-config";
import { getOutboundEmailConfig } from "@/lib/email/settings-store";

export type SendOutboundEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional template / channel metadata for webhook payloads. */
  template?: string;
  channel?: string;
  extra?: Record<string, unknown>;
};

export type SendOutboundEmailResult = {
  sent: boolean;
  reason?: string;
  provider?: string;
  source?: "ui" | "env";
};

function nodemailerSecureOptions(encryption: SmtpEncryption, port: number): {
  secure: boolean;
  requireTLS?: boolean;
  tls?: { rejectUnauthorized: boolean };
} {
  if (encryption === "ssl" || port === 465) {
    return { secure: true };
  }
  if (encryption === "tls" || encryption === "starttls") {
    return { secure: false, requireTLS: true };
  }
  return { secure: false };
}

export async function sendViaSmtp(
  smtp: OutboundSmtpConfig,
  from: string,
  input: Pick<SendOutboundEmailInput, "to" | "subject" | "html" | "text">,
): Promise<SendOutboundEmailResult> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    ...nodemailerSecureOptions(smtp.encryption, smtp.port),
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });

  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true, provider: "smtp" };
  } catch (err) {
    return {
      sent: false,
      provider: "smtp",
      reason: err instanceof Error ? err.message : "smtp_send_failed",
    };
  } finally {
    transport.close();
  }
}

export async function verifySmtpConnection(
  smtp: OutboundSmtpConfig,
): Promise<{ ok: boolean; reason?: string }> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    ...nodemailerSecureOptions(smtp.encryption, smtp.port),
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "smtp_verify_failed",
    };
  } finally {
    transport.close();
  }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  input: Pick<SendOutboundEmailInput, "to" | "subject" | "html">,
): Promise<SendOutboundEmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    return { sent: false, provider: "resend", reason: await res.text() };
  }
  return { sent: true, provider: "resend" };
}

async function sendViaWebhook(
  webhookUrl: string,
  input: SendOutboundEmailInput,
): Promise<SendOutboundEmailResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      template: input.template,
      channel: input.channel ?? "email",
      ...(input.extra ?? {}),
    }),
  });
  if (!res.ok) {
    return { sent: false, provider: "webhook", reason: await res.text() };
  }
  return { sent: true, provider: "webhook" };
}

/**
 * Unified outbound dispatch.
 * Uses the selected driver (SMTP or Resend) first; falls back to webhook when
 * the primary driver is not configured.
 */
export async function sendOutboundEmail(
  input: SendOutboundEmailInput,
  config?: OutboundEmailConfig | null,
): Promise<SendOutboundEmailResult> {
  const resolved = config === undefined ? await getOutboundEmailConfig() : config;
  if (!resolved) {
    return { sent: false, reason: "email_provider_not_configured" };
  }

  const from = formatFromHeader(resolved.fromAddress, resolved.fromName);

  if (resolved.provider === "smtp" && resolved.smtp) {
    const result = await sendViaSmtp(resolved.smtp, from, input);
    return { ...result, source: resolved.source };
  }

  if (resolved.provider === "resend" && resolved.resendApiKey) {
    const result = await sendViaResend(resolved.resendApiKey, from, input);
    return { ...result, source: resolved.source };
  }

  // Cross-driver fallback: if selected provider lacks credentials but the other
  // driver is present (e.g. env SMTP while UI still says resend), try it.
  if (resolved.smtp) {
    const result = await sendViaSmtp(resolved.smtp, from, input);
    return { ...result, source: resolved.source };
  }
  if (resolved.resendApiKey) {
    const result = await sendViaResend(resolved.resendApiKey, from, input);
    return { ...result, source: resolved.source };
  }

  if (resolved.webhookUrl) {
    const result = await sendViaWebhook(resolved.webhookUrl, input);
    return { ...result, source: resolved.source };
  }

  return { sent: false, reason: "email_provider_not_configured", source: resolved.source };
}

/** True when any deliverable channel is configured (SMTP, Resend, or webhook). */
export function outboundEmailReady(config: OutboundEmailConfig | null | undefined): boolean {
  if (!config) return false;
  if (config.provider === "smtp" && config.smtp) return true;
  if (config.provider === "resend" && config.resendApiKey) return true;
  if (config.smtp || config.resendApiKey || config.webhookUrl) return true;
  return false;
}

import nodemailer from "nodemailer";

import {
  formatFromHeader,
  isSmtpAuthFailure,
  mailgunAlternateSmtpHost,
  mailgunPresetForHost,
  nodemailerSecureOptions,
  smtpAuthDiagnostics,
  type OutboundEmailConfig,
  type OutboundSmtpConfig,
  type SmtpAuthDiagnostics,
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
  /** Present on SMTP failures — host/user/password length only. */
  diagnostics?: SmtpAuthDiagnostics;
};

function createSmtpTransport(smtp: OutboundSmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    ...nodemailerSecureOptions(smtp.encryption, smtp.port),
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });
}

/**
 * If Mailgun rejected auth on the configured host, probe the opposite region
 * with the same credentials (verify only — never auto-send via the other host).
 */
async function enrichMailgunRegionDiagnostics(
  smtp: OutboundSmtpConfig,
  reason: string | undefined,
  diagnostics: SmtpAuthDiagnostics,
): Promise<SmtpAuthDiagnostics> {
  if (!isSmtpAuthFailure(reason)) return diagnostics;
  const alternateHost = mailgunAlternateSmtpHost(smtp.host);
  if (!alternateHost) return diagnostics;

  const probe: OutboundSmtpConfig = { ...smtp, host: alternateHost };
  const transport = createSmtpTransport(probe);
  try {
    await transport.verify();
    const preset = mailgunPresetForHost(alternateHost);
    return {
      ...diagnostics,
      alternateHostWorked: alternateHost,
      ...(preset ? { alternatePreset: preset } : {}),
    };
  } catch {
    return diagnostics;
  } finally {
    transport.close();
  }
}

export async function sendViaSmtp(
  smtp: OutboundSmtpConfig,
  from: string,
  input: Pick<SendOutboundEmailInput, "to" | "subject" | "html" | "text">,
): Promise<SendOutboundEmailResult> {
  const transport = createSmtpTransport(smtp);

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
    const reason = err instanceof Error ? err.message : "smtp_send_failed";
    const diagnostics = await enrichMailgunRegionDiagnostics(
      smtp,
      reason,
      smtpAuthDiagnostics(smtp),
    );
    return {
      sent: false,
      provider: "smtp",
      reason,
      diagnostics,
    };
  } finally {
    transport.close();
  }
}

export async function verifySmtpConnection(
  smtp: OutboundSmtpConfig,
): Promise<{ ok: boolean; reason?: string; diagnostics?: SmtpAuthDiagnostics }> {
  const transport = createSmtpTransport(smtp);
  try {
    await transport.verify();
    return { ok: true, diagnostics: smtpAuthDiagnostics(smtp) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "smtp_verify_failed";
    const diagnostics = await enrichMailgunRegionDiagnostics(
      smtp,
      reason,
      smtpAuthDiagnostics(smtp),
    );
    return {
      ok: false,
      reason,
      diagnostics,
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

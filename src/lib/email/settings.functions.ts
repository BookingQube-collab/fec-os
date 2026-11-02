"use server";

import { z } from "zod";

import {
  EMAIL_SETTINGS_AUTH,
  getOutboundEmailConfig,
  getPublicEmailSettings,
  keepSecret,
  loadEmailSettingsRow,
  readEmailEnv,
  resolveSmtpConfig,
  saveEmailSettingsRow,
  toPublicEmailSettings,
  type EmailProvider,
  type EmailSettingsPublic,
  type SmtpEncryption,
  type SmtpPreset,
} from "@/lib/email/settings";
import { sendOutboundEmail, verifySmtpConnection } from "@/lib/email/send";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

const providerSchema = z.enum(["resend", "smtp"]);
const encryptionSchema = z.enum(["none", "ssl", "tls", "starttls"]);
const presetSchema = z.enum(["custom", "mailgun_eu", "mailgun_us", "gmail"]);

const saveSchema = z.object({
  enabled: z.boolean(),
  provider: providerSchema,
  fromAddress: z.string().trim().max(320),
  fromName: z.string().trim().max(200),
  resendApiKey: z.string().max(500),
  smtpHost: z.string().trim().max(320),
  smtpPort: z.number().int().min(1).max(65535),
  smtpEncryption: encryptionSchema,
  smtpUsername: z.string().trim().max(320),
  smtpPassword: z.string().max(500),
  smtpPreset: presetSchema,
  webhookUrl: z.string().max(2000),
  clearResendKey: z.boolean().optional(),
  clearSmtpPassword: z.boolean().optional(),
  clearWebhook: z.boolean().optional(),
});

const testSchema = z.object({
  to: z.string().trim().email().max(320),
});

const PLAIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertFromAddress(value: string, enabled: boolean, provider: EmailProvider) {
  const from = value.trim();
  if (!from) {
    if (enabled) throw new Error("From / sender email is required when outbound email is enabled.");
    return;
  }
  if (PLAIN_EMAIL_RE.test(from)) return;
  const angled = from.match(/^[^<]*<([^>]+)>$/);
  if (angled && PLAIN_EMAIL_RE.test(angled[1].trim())) return;
  throw new Error("From address must be a valid email (or Name <email@domain>).");
  void provider;
}

function assertHttpsWebhook(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Webhook URL must be a valid https:// URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Webhook URL must start with https:// or http://");
  }
}

function assertSmtpReady(opts: {
  enabled: boolean;
  provider: EmailProvider;
  host: string;
  username: string;
  password: string;
  envHost: string;
  envUser: string;
  envPass: string;
}) {
  if (!opts.enabled || opts.provider !== "smtp") return;
  const host = opts.host.trim() || opts.envHost.trim();
  const user = opts.username.trim() || opts.envUser.trim();
  const pass = opts.password.trim() || opts.envPass.trim();
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP requires host, username, and password (or matching SMTP_* / GMAIL_* env vars).",
    );
  }
}

export const loadAppEmailSettings = createSafeAuthenticatedAction(
  z.object({}),
  async (): Promise<EmailSettingsPublic> => getPublicEmailSettings(),
  { auth: EMAIL_SETTINGS_AUTH },
);

export const saveAppEmailSettings = createSafeAuthenticatedAction(
  saveSchema,
  async (data, context): Promise<EmailSettingsPublic> => {
    const existing = await loadEmailSettingsRow();
    const env = readEmailEnv();
    const fromAddress = data.fromAddress.trim();
    const fromName = data.fromName.trim();
    const provider = data.provider as EmailProvider;
    assertFromAddress(fromAddress, data.enabled, provider);
    assertHttpsWebhook(data.webhookUrl);

    let resendApiKey = keepSecret(existing?.resend_api_key ?? "", data.resendApiKey);
    let smtpPassword = keepSecret(existing?.smtp_password ?? "", data.smtpPassword);
    let webhookUrl = keepSecret(existing?.webhook_url ?? "", data.webhookUrl);
    if (data.clearResendKey) resendApiKey = "";
    if (data.clearSmtpPassword) smtpPassword = "";
    if (data.clearWebhook) webhookUrl = "";

    assertSmtpReady({
      enabled: data.enabled,
      provider,
      host: data.smtpHost,
      username: data.smtpUsername,
      password: smtpPassword,
      envHost: env.smtpHost,
      envUser: env.smtpUsername,
      envPass: env.smtpPassword,
    });

    if (data.enabled && provider === "resend" && !resendApiKey.trim() && !webhookUrl.trim()) {
      if (!env.resendApiKey && !env.webhookUrl) {
        throw new Error(
          "Enable Resend only after an API key or webhook URL is saved (or set in env).",
        );
      }
    }

    const saved = await saveEmailSettingsRow(
      {
        managed: true,
        enabled: data.enabled,
        provider,
        from_address: fromAddress,
        from_name: fromName,
        resend_api_key: resendApiKey.trim(),
        smtp_host: data.smtpHost.trim(),
        smtp_port: data.smtpPort,
        smtp_encryption: data.smtpEncryption as SmtpEncryption,
        smtp_username: data.smtpUsername.trim(),
        smtp_password: smtpPassword.trim(),
        smtp_preset: data.smtpPreset as SmtpPreset,
        webhook_url: webhookUrl.trim(),
      },
      context.userId,
    );
    return toPublicEmailSettings(saved, env);
  },
  { auth: EMAIL_SETTINGS_AUTH },
);

export const testAppEmailSettings = createSafeAuthenticatedAction(
  testSchema,
  async (data): Promise<{ sent: boolean; reason?: string; source?: string; provider?: string }> => {
    const config = await getOutboundEmailConfig();
    if (!config) {
      return { sent: false, reason: "email_provider_not_configured" };
    }

    const subject = "FEC-OS email configuration test";
    const html =
      "<h2>Email configuration test</h2><p>This message confirms outbound email is working from the Admin Email settings page.</p>";

    const result = await sendOutboundEmail(
      {
        to: data.to,
        subject,
        html,
        template: "admin_email_test",
        channel: "email",
      },
      config,
    );
    return {
      sent: result.sent,
      reason: result.reason,
      source: result.source,
      provider: result.provider,
    };
  },
  { auth: EMAIL_SETTINGS_AUTH },
);

const smtpTestSchema = z.object({
  smtpHost: z.string().trim().max(320).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpEncryption: encryptionSchema.optional(),
  smtpUsername: z.string().trim().max(320).optional(),
  /** When blank, saved DB password then env SMTP_PASSWORD / GMAIL_APP_PASSWORD are used. */
  smtpPassword: z.string().max(500).optional(),
});

export const testAppSmtpConnection = createSafeAuthenticatedAction(
  smtpTestSchema,
  async (data): Promise<{ ok: boolean; reason?: string; host?: string; port?: number }> => {
    const env = readEmailEnv();
    let row = null as Awaited<ReturnType<typeof loadEmailSettingsRow>>;
    try {
      row = await loadEmailSettingsRow();
    } catch {
      row = null;
    }

    const { smtp, reason } = resolveSmtpConfig(
      {
        host: data.smtpHost,
        port: data.smtpPort,
        encryption: data.smtpEncryption as SmtpEncryption | undefined,
        username: data.smtpUsername,
        password: data.smtpPassword,
      },
      row,
      env,
    );

    if (!smtp) {
      return { ok: false, reason: reason ?? "smtp_not_configured" };
    }

    const verified = await verifySmtpConnection(smtp);
    return {
      ok: verified.ok,
      reason: verified.reason,
      host: smtp.host,
      port: smtp.port,
    };
  },
  { auth: EMAIL_SETTINGS_AUTH },
);

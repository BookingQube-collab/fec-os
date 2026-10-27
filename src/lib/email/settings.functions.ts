"use server";

import { z } from "zod";

import {
  EMAIL_SETTINGS_AUTH,
  getOutboundEmailConfig,
  getPublicEmailSettings,
  keepSecret,
  loadEmailSettingsRow,
  readEmailEnv,
  saveEmailSettingsRow,
  toPublicEmailSettings,
  type EmailSettingsPublic,
} from "@/lib/email/settings";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

const saveSchema = z.object({
  enabled: z.boolean(),
  fromAddress: z.string().trim().max(320),
  resendApiKey: z.string().max(500),
  webhookUrl: z.string().max(2000),
  clearResendKey: z.boolean().optional(),
  clearWebhook: z.boolean().optional(),
});

const testSchema = z.object({
  to: z.string().trim().email().max(320),
});

const PLAIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertFromAddress(value: string, enabled: boolean) {
  const from = value.trim();
  if (!from) {
    if (enabled) throw new Error("From address is required when outbound email is enabled.");
    return;
  }
  if (PLAIN_EMAIL_RE.test(from)) return;
  const angled = from.match(/^[^<]*<([^>]+)>$/);
  if (angled && PLAIN_EMAIL_RE.test(angled[1].trim())) return;
  throw new Error("From address must be a valid email (or Name <email@domain>).");
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

export const loadAppEmailSettings = createSafeAuthenticatedAction(
  z.object({}),
  async (): Promise<EmailSettingsPublic> => getPublicEmailSettings(),
  { auth: EMAIL_SETTINGS_AUTH },
);

export const saveAppEmailSettings = createSafeAuthenticatedAction(
  saveSchema,
  async (data, context): Promise<EmailSettingsPublic> => {
    const existing = await loadEmailSettingsRow();
    const fromAddress = data.fromAddress.trim();
    assertFromAddress(fromAddress, data.enabled);
    assertHttpsWebhook(data.webhookUrl);

    let resendApiKey = keepSecret(existing?.resend_api_key ?? "", data.resendApiKey);
    let webhookUrl = keepSecret(existing?.webhook_url ?? "", data.webhookUrl);
    if (data.clearResendKey) resendApiKey = "";
    if (data.clearWebhook) webhookUrl = "";

    if (data.enabled && !resendApiKey.trim() && !webhookUrl.trim()) {
      const env = readEmailEnv();
      if (!env.resendApiKey && !env.webhookUrl) {
        throw new Error("Enable outbound email only after a Resend API key or webhook URL is saved (or set in env).");
      }
    }

    const saved = await saveEmailSettingsRow(
      {
        managed: true,
        enabled: data.enabled,
        from_address: fromAddress,
        resend_api_key: resendApiKey.trim(),
        webhook_url: webhookUrl.trim(),
      },
      context.userId,
    );
    return toPublicEmailSettings(saved, readEmailEnv());
  },
  { auth: EMAIL_SETTINGS_AUTH },
);

export const testAppEmailSettings = createSafeAuthenticatedAction(
  testSchema,
  async (data): Promise<{ sent: boolean; reason?: string; source?: string }> => {
    const config = await getOutboundEmailConfig();
    if (!config) {
      return { sent: false, reason: "email_provider_not_configured" };
    }

    const subject = "FEC-OS email configuration test";
    const html =
      "<h2>Email configuration test</h2><p>This message confirms outbound email is working from the Admin Email settings page.</p>";

    if (config.resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.fromAddress,
          to: data.to,
          subject,
          html,
        }),
      });
      if (!res.ok) {
        return { sent: false, reason: await res.text(), source: config.source };
      }
      return { sent: true, source: config.source };
    }

    if (config.webhookUrl) {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: data.to,
          subject,
          html,
          template: "admin_email_test",
          channel: "email",
        }),
      });
      if (!res.ok) {
        return { sent: false, reason: await res.text(), source: config.source };
      }
      return { sent: true, source: config.source };
    }

    return { sent: false, reason: "email_provider_not_configured" };
  },
  { auth: EMAIL_SETTINGS_AUTH },
);

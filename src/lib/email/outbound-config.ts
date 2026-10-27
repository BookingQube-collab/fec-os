/** Pure outbound email config resolution (DB/UI first, then env). No I/O. */

export const DEFAULT_EMAIL_FROM = "maintenance@fec.qa";

export type EmailSettingsRow = {
  managed: boolean;
  enabled: boolean;
  from_address: string;
  resend_api_key: string;
  webhook_url: string;
};

export type EmailEnv = {
  resendApiKey: string;
  webhookUrl: string;
  fromAddress: string;
};

/** Resolved credentials for sending. Null means outbound email is off / not configured. */
export type OutboundEmailConfig = {
  resendApiKey: string | null;
  webhookUrl: string | null;
  fromAddress: string;
  source: "ui" | "env";
};

/** Safe for admin server-action returns. Never includes full secrets. */
export type EmailSettingsPublic = {
  managed: boolean;
  enabled: boolean;
  fromAddress: string;
  resendKeyLast4: string;
  resendKeySet: boolean;
  webhookSet: boolean;
  webhookHint: string;
  /** Env has a provider when UI is not managed yet (hint for admins). */
  envProviderAvailable: boolean;
};

export function readEmailEnv(env: NodeJS.ProcessEnv = process.env): EmailEnv {
  const from =
    env.MAINTENANCE_EMAIL_FROM?.trim() ||
    env.EMAIL_FROM?.trim() ||
    "";
  return {
    resendApiKey: env.RESEND_API_KEY?.trim() ?? "",
    webhookUrl: env.NOTIFICATION_EMAIL_WEBHOOK?.trim() ?? "",
    fromAddress: from,
  };
}

/** Last 4 characters only when the value is longer than 4. */
export function secretLast4(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "";
  return trimmed.slice(-4);
}

/** Host-only hint for a saved webhook (no query/path secrets). */
export function webhookHostHint(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.host;
  } catch {
    return secretLast4(trimmed) ? `…${secretLast4(trimmed)}` : "saved";
  }
}

/** Blank submitted secret keeps the stored one. Non-blank replaces. */
export function keepSecret(previous: string, submitted: string): string {
  const incoming = submitted.trim();
  return incoming.length > 0 ? incoming : previous;
}

function envConfig(env: EmailEnv): OutboundEmailConfig | null {
  const resendApiKey = env.resendApiKey.trim() || null;
  const webhookUrl = env.webhookUrl.trim() || null;
  if (!resendApiKey && !webhookUrl) return null;
  return {
    resendApiKey,
    webhookUrl,
    fromAddress: env.fromAddress.trim() || DEFAULT_EMAIL_FROM,
    source: "env",
  };
}

/**
 * UI-managed row wins when `managed` is true:
 * - enabled=false → outbound off (no env fall-through)
 * - enabled=true → DB non-empty fields override env; empty DB fields inherit env
 *
 * Unmanaged / missing row → env only (production keeps working).
 */
export function resolveOutboundEmailConfig(
  row: EmailSettingsRow | null,
  env: EmailEnv,
): OutboundEmailConfig | null {
  if (row?.managed) {
    if (!row.enabled) return null;
    const resendApiKey = (row.resend_api_key.trim() || env.resendApiKey.trim() || null) as string | null;
    const webhookUrl = (row.webhook_url.trim() || env.webhookUrl.trim() || null) as string | null;
    if (!resendApiKey && !webhookUrl) return null;
    const fromAddress =
      row.from_address.trim() || env.fromAddress.trim() || DEFAULT_EMAIL_FROM;
    return { resendApiKey, webhookUrl, fromAddress, source: "ui" };
  }
  return envConfig(env);
}

export function toPublicEmailSettings(row: EmailSettingsRow | null, env: EmailEnv): EmailSettingsPublic {
  const resend = row?.resend_api_key?.trim() ?? "";
  const webhook = row?.webhook_url?.trim() ?? "";
  return {
    managed: Boolean(row?.managed),
    enabled: Boolean(row?.enabled),
    fromAddress: row?.from_address?.trim() ?? "",
    resendKeyLast4: secretLast4(resend),
    resendKeySet: resend.length > 0,
    webhookSet: webhook.length > 0,
    webhookHint: webhookHostHint(webhook),
    envProviderAvailable: Boolean(env.resendApiKey || env.webhookUrl),
  };
}

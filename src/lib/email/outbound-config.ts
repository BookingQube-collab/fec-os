/** Pure outbound email config resolution (DB/UI first, then env). No I/O. */

export const DEFAULT_EMAIL_FROM = "maintenance@fec.qa";

export const EMAIL_PROVIDERS = ["resend", "smtp"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const SMTP_ENCRYPTIONS = ["none", "ssl", "tls", "starttls"] as const;
export type SmtpEncryption = (typeof SMTP_ENCRYPTIONS)[number];

export const SMTP_PRESETS = ["custom", "mailgun_eu", "mailgun_us", "gmail"] as const;
export type SmtpPreset = (typeof SMTP_PRESETS)[number];

export type SmtpPresetValues = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
};

export const SMTP_PRESET_VALUES: Record<Exclude<SmtpPreset, "custom">, SmtpPresetValues> = {
  mailgun_eu: { host: "smtp.eu.mailgun.org", port: 587, encryption: "tls" },
  mailgun_us: { host: "smtp.mailgun.org", port: 587, encryption: "tls" },
  gmail: { host: "smtp.gmail.com", port: 587, encryption: "tls" },
};

export type EmailSettingsRow = {
  managed: boolean;
  enabled: boolean;
  provider: EmailProvider;
  from_address: string;
  from_name: string;
  resend_api_key: string;
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: SmtpEncryption;
  smtp_username: string;
  smtp_password: string;
  smtp_preset: SmtpPreset;
  webhook_url: string;
};

export type EmailEnv = {
  resendApiKey: string;
  webhookUrl: string;
  fromAddress: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: SmtpEncryption;
  smtpUsername: string;
  smtpPassword: string;
};

export type OutboundSmtpConfig = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  password: string;
};

/** Resolved credentials for sending. Null means outbound email is off / not configured. */
export type OutboundEmailConfig = {
  provider: EmailProvider;
  resendApiKey: string | null;
  smtp: OutboundSmtpConfig | null;
  webhookUrl: string | null;
  fromAddress: string;
  fromName: string;
  source: "ui" | "env";
};

/** Safe for admin server-action returns. Never includes full secrets. */
export type EmailSettingsPublic = {
  managed: boolean;
  enabled: boolean;
  provider: EmailProvider;
  fromAddress: string;
  fromName: string;
  resendKeyLast4: string;
  resendKeySet: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: SmtpEncryption;
  smtpUsername: string;
  smtpPasswordSet: boolean;
  smtpPasswordLast4: string;
  smtpPreset: SmtpPreset;
  webhookSet: boolean;
  webhookHint: string;
  /** Env has a provider when UI is not managed yet (hint for admins). */
  envProviderAvailable: boolean;
};

const SETTINGS_COLUMNS =
  "managed, enabled, provider, from_address, from_name, resend_api_key, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password, smtp_preset, webhook_url";

export const EMAIL_SETTINGS_SELECT = SETTINGS_COLUMNS;

export function isEmailProvider(value: string): value is EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value);
}

export function isSmtpEncryption(value: string): value is SmtpEncryption {
  return (SMTP_ENCRYPTIONS as readonly string[]).includes(value);
}

export function isSmtpPreset(value: string): value is SmtpPreset {
  return (SMTP_PRESETS as readonly string[]).includes(value);
}

export function applySmtpPreset(preset: SmtpPreset): SmtpPresetValues | null {
  if (preset === "custom") return null;
  return SMTP_PRESET_VALUES[preset];
}

function parsePort(value: unknown, fallback = 587): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
  return Math.trunc(n);
}

export function readEmailEnv(env: NodeJS.ProcessEnv = process.env): EmailEnv {
  const from =
    env.MAINTENANCE_EMAIL_FROM?.trim() ||
    env.EMAIL_FROM?.trim() ||
    "";
  const encryptionRaw = (env.SMTP_ENCRYPTION ?? env.EMAIL_SMTP_ENCRYPTION ?? "tls").trim().toLowerCase();
  return {
    resendApiKey: env.RESEND_API_KEY?.trim() ?? "",
    webhookUrl: env.NOTIFICATION_EMAIL_WEBHOOK?.trim() ?? "",
    fromAddress: from,
    fromName: env.EMAIL_FROM_NAME?.trim() ?? "",
    smtpHost: (env.SMTP_HOST ?? env.EMAIL_SMTP_HOST ?? "").trim(),
    smtpPort: parsePort(env.SMTP_PORT ?? env.EMAIL_SMTP_PORT, 587),
    smtpEncryption: isSmtpEncryption(encryptionRaw) ? encryptionRaw : "tls",
    smtpUsername: (env.SMTP_USERNAME ?? env.EMAIL_SMTP_USER ?? env.GMAIL_USER ?? "").trim(),
    smtpPassword: (
      env.SMTP_PASSWORD ??
      env.EMAIL_SMTP_PASSWORD ??
      env.GMAIL_APP_PASSWORD ??
      ""
    ).trim(),
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

export function formatFromHeader(fromAddress: string, fromName: string): string {
  const address = fromAddress.trim() || DEFAULT_EMAIL_FROM;
  const name = fromName.trim();
  if (!name) return address;
  if (address.includes("<")) return address;
  return `${name} <${address}>`;
}

function smtpFromParts(
  host: string,
  port: number,
  encryption: SmtpEncryption,
  username: string,
  password: string,
): OutboundSmtpConfig | null {
  const h = host.trim();
  const u = username.trim();
  const p = password.trim();
  if (!h || !u || !p) return null;
  return {
    host: h,
    port: parsePort(port, 587),
    encryption,
    username: u,
    password: p,
  };
}

function hasProviderCredentials(env: EmailEnv): boolean {
  return Boolean(
    env.resendApiKey ||
      env.webhookUrl ||
      (env.smtpHost && env.smtpUsername && env.smtpPassword),
  );
}

function envConfig(env: EmailEnv): OutboundEmailConfig | null {
  const resendApiKey = env.resendApiKey.trim() || null;
  const webhookUrl = env.webhookUrl.trim() || null;
  const smtp = smtpFromParts(
    env.smtpHost,
    env.smtpPort,
    env.smtpEncryption,
    env.smtpUsername,
    env.smtpPassword,
  );
  if (!resendApiKey && !webhookUrl && !smtp) return null;
  const provider: EmailProvider = smtp && !resendApiKey ? "smtp" : "resend";
  return {
    provider: smtp && !resendApiKey ? "smtp" : provider,
    resendApiKey,
    smtp,
    webhookUrl,
    fromAddress: env.fromAddress.trim() || DEFAULT_EMAIL_FROM,
    fromName: env.fromName.trim(),
    source: "env",
  };
}

function providerHasCredentials(
  provider: EmailProvider,
  resendApiKey: string | null,
  smtp: OutboundSmtpConfig | null,
  webhookUrl: string | null,
): boolean {
  if (provider === "smtp") return Boolean(smtp) || Boolean(webhookUrl);
  return Boolean(resendApiKey) || Boolean(webhookUrl);
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
    const provider: EmailProvider = isEmailProvider(row.provider) ? row.provider : "resend";
    const resendApiKey = (row.resend_api_key.trim() || env.resendApiKey.trim() || null) as string | null;
    const webhookUrl = (row.webhook_url.trim() || env.webhookUrl.trim() || null) as string | null;
    const smtp = smtpFromParts(
      row.smtp_host.trim() || env.smtpHost,
      row.smtp_port || env.smtpPort,
      isSmtpEncryption(row.smtp_encryption) ? row.smtp_encryption : env.smtpEncryption,
      row.smtp_username.trim() || env.smtpUsername,
      row.smtp_password.trim() || env.smtpPassword,
    );
    if (!providerHasCredentials(provider, resendApiKey, smtp, webhookUrl)) return null;
    const fromAddress =
      row.from_address.trim() || env.fromAddress.trim() || DEFAULT_EMAIL_FROM;
    const fromName = row.from_name.trim() || env.fromName.trim();
    return {
      provider,
      resendApiKey,
      smtp,
      webhookUrl,
      fromAddress,
      fromName,
      source: "ui",
    };
  }
  return envConfig(env);
}

export function normalizeEmailSettingsRow(data: Partial<EmailSettingsRow> & Record<string, unknown>): EmailSettingsRow {
  const providerRaw = String(data.provider ?? "resend");
  const encryptionRaw = String(data.smtp_encryption ?? "tls");
  const presetRaw = String(data.smtp_preset ?? "custom");
  return {
    managed: Boolean(data.managed),
    enabled: Boolean(data.enabled),
    provider: isEmailProvider(providerRaw) ? providerRaw : "resend",
    from_address: String(data.from_address ?? ""),
    from_name: String(data.from_name ?? ""),
    resend_api_key: String(data.resend_api_key ?? ""),
    smtp_host: String(data.smtp_host ?? ""),
    smtp_port: parsePort(data.smtp_port, 587),
    smtp_encryption: isSmtpEncryption(encryptionRaw) ? encryptionRaw : "tls",
    smtp_username: String(data.smtp_username ?? ""),
    smtp_password: String(data.smtp_password ?? ""),
    smtp_preset: isSmtpPreset(presetRaw) ? presetRaw : "custom",
    webhook_url: String(data.webhook_url ?? ""),
  };
}

export function toPublicEmailSettings(row: EmailSettingsRow | null, env: EmailEnv): EmailSettingsPublic {
  const resend = row?.resend_api_key?.trim() ?? "";
  const webhook = row?.webhook_url?.trim() ?? "";
  const smtpPassword = row?.smtp_password?.trim() ?? "";
  return {
    managed: Boolean(row?.managed),
    enabled: Boolean(row?.enabled),
    provider: row && isEmailProvider(row.provider) ? row.provider : "resend",
    fromAddress: row?.from_address?.trim() ?? "",
    fromName: row?.from_name?.trim() ?? "",
    resendKeyLast4: secretLast4(resend),
    resendKeySet: resend.length > 0,
    smtpHost: row?.smtp_host?.trim() ?? "",
    smtpPort: row?.smtp_port ?? 587,
    smtpEncryption: row && isSmtpEncryption(row.smtp_encryption) ? row.smtp_encryption : "tls",
    smtpUsername: row?.smtp_username?.trim() ?? "",
    smtpPasswordSet: smtpPassword.length > 0,
    smtpPasswordLast4: secretLast4(smtpPassword),
    smtpPreset: row && isSmtpPreset(row.smtp_preset) ? row.smtp_preset : "custom",
    webhookSet: webhook.length > 0,
    webhookHint: webhookHostHint(webhook),
    envProviderAvailable: hasProviderCredentials(env),
  };
}

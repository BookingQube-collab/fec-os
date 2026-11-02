import "server-only";

export {
  APP_EMAIL_SETTINGS_ID,
  EMAIL_SETTINGS_AUTH,
  getOutboundEmailConfig,
  getPublicEmailSettings,
  loadEmailSettingsRow,
  saveEmailSettingsRow,
} from "@/lib/email/settings-store";

export {
  applySmtpPreset,
  keepSecret,
  readEmailEnv,
  resolveOutboundEmailConfig,
  secretLast4,
  toPublicEmailSettings,
  webhookHostHint,
  DEFAULT_EMAIL_FROM,
  EMAIL_PROVIDERS,
  SMTP_ENCRYPTIONS,
  SMTP_PRESETS,
  SMTP_PRESET_VALUES,
  type EmailEnv,
  type EmailProvider,
  type EmailSettingsPublic,
  type EmailSettingsRow,
  type OutboundEmailConfig,
  type SmtpEncryption,
  type SmtpPreset,
} from "@/lib/email/outbound-config";

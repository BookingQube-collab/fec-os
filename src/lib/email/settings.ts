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
  keepSecret,
  readEmailEnv,
  resolveOutboundEmailConfig,
  secretLast4,
  toPublicEmailSettings,
  webhookHostHint,
  DEFAULT_EMAIL_FROM,
  type EmailEnv,
  type EmailSettingsPublic,
  type EmailSettingsRow,
  type OutboundEmailConfig,
} from "@/lib/email/outbound-config";

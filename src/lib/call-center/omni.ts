/**
 * Omnichannel helpers (Messenger, Instagram handoff, Microsoft 365 email).
 * Chatbot automation stays in SendPulse; FEC agent desktop receives tickets/contacts.
 */

export const CALL_CENTER_OMNI_SOURCES = [
  "sendpulse",
  "facebook_messenger",
  "instagram",
  "microsoft365_email",
  "whatsapp",
] as const;

export type CallCenterOmniSource = (typeof CALL_CENTER_OMNI_SOURCES)[number];

export type MessengerPublicStatus = {
  enabled: boolean;
  configured: boolean;
  pageId: string;
  accessTokenSet: boolean;
  verifyTokenSet: boolean;
  webhookPath: string;
};

export type M365PublicStatus = {
  enabled: boolean;
  configured: boolean;
  mailbox: string;
  tenantIdSet: boolean;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  clientStateSet: boolean;
  webhookPath: string;
};

export function resolveMessengerPageId(
  settingsPageId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsPageId?.trim() ||
    env.MESSENGER_PAGE_ID?.trim() ||
    env.META_PAGE_ID?.trim() ||
    env.INSTAGRAM_PAGE_ID?.trim() ||
    ""
  );
}

export function resolveMessengerAccessToken(
  settingsToken?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsToken?.trim() ||
    env.MESSENGER_PAGE_ACCESS_TOKEN?.trim() ||
    env.META_PAGE_ACCESS_TOKEN?.trim() ||
    env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    env.META_ACCESS_TOKEN?.trim() ||
    ""
  );
}

export function resolveMessengerVerifyToken(
  settingsToken?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsToken?.trim() ||
    env.MESSENGER_VERIFY_TOKEN?.trim() ||
    env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    env.INSTAGRAM_VERIFY_TOKEN?.trim() ||
    ""
  );
}

export function getMessengerPublicStatus(input?: {
  enabled?: boolean;
  pageId?: string | null;
  accessToken?: string | null;
  verifyToken?: string | null;
}): MessengerPublicStatus {
  const pageId = resolveMessengerPageId(input?.pageId);
  const accessToken = resolveMessengerAccessToken(input?.accessToken);
  const verifyToken = resolveMessengerVerifyToken(input?.verifyToken);
  return {
    enabled: Boolean(input?.enabled),
    configured: Boolean(pageId && accessToken),
    pageId,
    accessTokenSet: Boolean(accessToken),
    verifyTokenSet: Boolean(verifyToken),
    webhookPath: "/api/public/meta/messenger",
  };
}

export function resolveM365Mailbox(
  settingsMailbox?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return settingsMailbox?.trim() || env.M365_MAILBOX?.trim() || env.MICROSOFT365_MAILBOX?.trim() || "";
}

export function resolveM365TenantId(
  settingsTenant?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsTenant?.trim() ||
    env.M365_TENANT_ID?.trim() ||
    env.MICROSOFT365_TENANT_ID?.trim() ||
    env.AZURE_AD_TENANT_ID?.trim() ||
    ""
  );
}

export function resolveM365ClientId(
  settingsClientId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsClientId?.trim() ||
    env.M365_CLIENT_ID?.trim() ||
    env.MICROSOFT365_CLIENT_ID?.trim() ||
    env.AZURE_AD_CLIENT_ID?.trim() ||
    ""
  );
}

export function resolveM365ClientSecret(
  settingsSecret?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsSecret?.trim() ||
    env.M365_CLIENT_SECRET?.trim() ||
    env.MICROSOFT365_CLIENT_SECRET?.trim() ||
    env.AZURE_AD_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function resolveM365ClientState(
  settingsState?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    settingsState?.trim() ||
    env.M365_WEBHOOK_CLIENT_STATE?.trim() ||
    env.MICROSOFT365_WEBHOOK_CLIENT_STATE?.trim() ||
    ""
  );
}

export function getM365PublicStatus(input?: {
  enabled?: boolean;
  mailbox?: string | null;
  tenantId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  clientState?: string | null;
}): M365PublicStatus {
  const mailbox = resolveM365Mailbox(input?.mailbox);
  const tenantId = resolveM365TenantId(input?.tenantId);
  const clientId = resolveM365ClientId(input?.clientId);
  const clientSecret = resolveM365ClientSecret(input?.clientSecret);
  const clientState = resolveM365ClientState(input?.clientState);
  return {
    enabled: Boolean(input?.enabled),
    configured: Boolean(mailbox && tenantId && clientId && clientSecret),
    mailbox,
    tenantIdSet: Boolean(tenantId),
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(clientSecret),
    clientStateSet: Boolean(clientState),
    webhookPath: "/api/public/call-center/microsoft365",
  };
}

/** Graph change-notification validation token echo. */
export function parseGraphValidationToken(url: URL): string | null {
  return url.searchParams.get("validationToken");
}

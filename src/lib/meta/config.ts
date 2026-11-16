/**
 * Official Meta Business API credentials (WhatsApp Cloud + Instagram Messaging).
 * Prefer Call Center → Settings (DB) when present for WhatsApp and Instagram;
 * env vars remain the fallback for local/dev and Meta dashboard secrets.
 */

const GRAPH_VERSION = "v21.0";

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || GRAPH_VERSION;
}

export function metaGraphBaseUrl(): string {
  return `https://graph.facebook.com/${metaGraphVersion()}`;
}

export function metaAppId(): string {
  return process.env.META_APP_ID?.trim() || "";
}

export function metaAppSecret(): string {
  return process.env.META_APP_SECRET?.trim() || "";
}

/** Shared hub.verify_token for Meta webhook subscription challenges. */
export function metaWebhookVerifyToken(): string {
  return (
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.INSTAGRAM_VERIFY_TOKEN?.trim() ||
    ""
  );
}

export function whatsappAccessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.META_ACCESS_TOKEN?.trim() || "";
}

export function whatsappPhoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

export function whatsappWabaId(): string {
  return process.env.WHATSAPP_WABA_ID?.trim() || "";
}

export function whatsappVerifyToken(): string {
  return process.env.WHATSAPP_VERIFY_TOKEN?.trim() || metaWebhookVerifyToken();
}

/** Page access token with instagram_manage_messages (Messenger Platform path). */
export function instagramPageAccessToken(): string {
  return (
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    ""
  );
}

/** Facebook Page ID linked to the Instagram Professional account. */
export function instagramPageId(): string {
  return process.env.INSTAGRAM_PAGE_ID?.trim() || process.env.META_PAGE_ID?.trim() || "";
}

/** Instagram Business / Professional account ID (IG user id). */
export function instagramIgUserId(): string {
  return process.env.INSTAGRAM_IG_USER_ID?.trim() || "";
}

export function instagramVerifyToken(): string {
  return process.env.INSTAGRAM_VERIFY_TOKEN?.trim() || metaWebhookVerifyToken();
}

export function metaAutoReplyEnabled(): boolean {
  const raw = process.env.META_AUTO_REPLY_ENABLED?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function metaAutoReplyText(): string {
  return (
    process.env.META_AUTO_REPLY_TEXT?.trim() ||
    "Thanks for messaging us. A team member will reply shortly."
  );
}

/** Protects POST /api/public/meta/send (outbound test helper). */
export function metaSendSecret(): string {
  return process.env.META_SEND_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
}

export type MetaChannelConfigStatus = {
  whatsapp: {
    accessTokenSet: boolean;
    phoneNumberIdSet: boolean;
    verifyTokenSet: boolean;
    wabaIdSet: boolean;
  };
  instagram: {
    pageAccessTokenSet: boolean;
    pageIdSet: boolean;
    igUserIdSet: boolean;
    verifyTokenSet: boolean;
  };
  app: {
    appIdSet: boolean;
    appSecretSet: boolean;
    graphVersion: string;
  };
  autoReply: {
    enabled: boolean;
    textPreview: string;
  };
};

export function getMetaConfigStatus(): MetaChannelConfigStatus {
  const reply = metaAutoReplyText();
  return {
    whatsapp: {
      accessTokenSet: Boolean(whatsappAccessToken()),
      phoneNumberIdSet: Boolean(whatsappPhoneNumberId()),
      verifyTokenSet: Boolean(whatsappVerifyToken()),
      wabaIdSet: Boolean(whatsappWabaId()),
    },
    instagram: {
      pageAccessTokenSet: Boolean(instagramPageAccessToken()),
      pageIdSet: Boolean(instagramPageId()),
      igUserIdSet: Boolean(instagramIgUserId()),
      verifyTokenSet: Boolean(instagramVerifyToken()),
    },
    app: {
      appIdSet: Boolean(metaAppId()),
      appSecretSet: Boolean(metaAppSecret()),
      graphVersion: metaGraphVersion(),
    },
    autoReply: {
      enabled: metaAutoReplyEnabled(),
      textPreview: reply.slice(0, 80),
    },
  };
}

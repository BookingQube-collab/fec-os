import { normalizeSipUriHost, unsealCallCenterSecret } from "./db";
import { normalizeConfiguredTtsVoice } from "./ivr-tts-voice";
import type {
  CallCenterAiProvider,
  CallCenterSettingsPublic,
  CallCenterSettingsRow,
} from "./types";

function secretLast4(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "";
  return v.slice(-4);
}

function safeUnsealLast4(stored: string): string {
  try {
    return secretLast4(unsealCallCenterSecret(stored));
  } catch {
    return "";
  }
}

export function isSipConfigured(settings: CallCenterSettingsRow | null): boolean {
  if (!settings) return false;
  return (
    settings.telnyx_sip_uri.trim().length > 0 ||
    settings.telnyx_api_key.trim().length > 0 ||
    settings.livekit_sip_trunk_id.trim().length > 0 ||
    settings.livekit_sip_inbound_trunk_id.trim().length > 0
  );
}

function normalizeAiProvider(value: unknown): CallCenterAiProvider {
  if (
    value === "admin_gateway" ||
    value === "openai_compatible" ||
    value === "livekit_agents" ||
    value === "openai"
  ) {
    return value;
  }
  return "admin_gateway";
}

export function toPublicSettings(
  row: CallCenterSettingsRow | null,
  livekitReady: boolean,
): CallCenterSettingsPublic {
  const aiApiKey = row?.ai_api_key?.trim() ?? "";
  const whatsappToken = row?.whatsapp_access_token?.trim() ?? "";
  const openaiEnvOnly = Boolean(process.env.OPENAI_API_KEY?.trim());
  const provider = normalizeAiProvider(row?.ai_provider);
  const aiConfigured =
    provider === "admin_gateway" ||
    aiApiKey.length > 0 ||
    openaiEnvOnly ||
    (provider === "livekit_agents" && Boolean(row?.ai_livekit_agent_name?.trim()));
  const whatsappConfigured =
    Boolean(row?.whatsapp_phone_number_id?.trim()) &&
    (whatsappToken.length > 0 || Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()));
  const igToken =
    row?.instagram_page_access_token?.trim() ||
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    "";
  const igPageId =
    row?.instagram_page_id?.trim() ||
    process.env.INSTAGRAM_PAGE_ID?.trim() ||
    process.env.META_PAGE_ID?.trim() ||
    "";
  const igVerify =
    row?.instagram_verify_token?.trim() ||
    process.env.INSTAGRAM_VERIFY_TOKEN?.trim() ||
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    "";
  const instagramConfigured = Boolean(igPageId) && igToken.length > 0;

  const messengerToken =
    row?.messenger_page_access_token?.trim() ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    "";
  const messengerPageId =
    row?.messenger_page_id?.trim() ||
    process.env.MESSENGER_PAGE_ID?.trim() ||
    process.env.META_PAGE_ID?.trim() ||
    process.env.INSTAGRAM_PAGE_ID?.trim() ||
    "";
  const messengerVerify =
    row?.messenger_verify_token?.trim() ||
    process.env.MESSENGER_VERIFY_TOKEN?.trim() ||
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    "";
  const messengerConfigured = Boolean(messengerPageId) && messengerToken.length > 0;

  const m365Mailbox =
    row?.m365_mailbox?.trim() ||
    process.env.M365_MAILBOX?.trim() ||
    process.env.MICROSOFT365_MAILBOX?.trim() ||
    "";
  const m365Tenant =
    row?.m365_tenant_id?.trim() ||
    process.env.M365_TENANT_ID?.trim() ||
    process.env.AZURE_AD_TENANT_ID?.trim() ||
    "";
  const m365ClientId =
    row?.m365_client_id?.trim() ||
    process.env.M365_CLIENT_ID?.trim() ||
    process.env.AZURE_AD_CLIENT_ID?.trim() ||
    "";
  const m365Secret =
    row?.m365_client_secret?.trim() ||
    process.env.M365_CLIENT_SECRET?.trim() ||
    process.env.AZURE_AD_CLIENT_SECRET?.trim() ||
    "";
  const m365ClientState =
    row?.m365_webhook_client_state?.trim() ||
    process.env.M365_WEBHOOK_CLIENT_STATE?.trim() ||
    "";
  const m365Configured = Boolean(m365Mailbox && m365Tenant && m365ClientId && m365Secret);

  return {
    enabled: Boolean(row?.enabled),
    ivrEnabled: Boolean(row?.ivr_enabled ?? true),
    businessHoursEnabled: Boolean(row?.business_hours_enabled),
    businessHoursJson: row?.business_hours_json ?? {},
    timezone: row?.timezone?.trim() || "Asia/Qatar",
    defaultQueueId: row?.default_queue_id ?? null,
    telnyxSipUri: normalizeSipUriHost(row?.telnyx_sip_uri ?? ""),
    telnyxConnectionId: row?.telnyx_connection_id?.trim() ?? "",
    telnyxKeyLast4: secretLast4(row?.telnyx_api_key ?? ""),
    telnyxKeySet: (row?.telnyx_api_key?.trim() ?? "").length > 0,
    telnyxWebhookSecretLast4: secretLast4(row?.telnyx_webhook_secret ?? ""),
    telnyxWebhookSecretSet: (row?.telnyx_webhook_secret?.trim() ?? "").length > 0,
    livekitSipTrunkId: row?.livekit_sip_trunk_id?.trim() ?? "",
    livekitSipInboundTrunkId: row?.livekit_sip_inbound_trunk_id?.trim() ?? "",
    livekitSipDispatchRuleId: row?.livekit_sip_dispatch_rule_id?.trim() ?? "",
    inboundMode: row?.inbound_mode === "telnyx_call_control" ? "telnyx_call_control" : "telnyx_sip_trunk",
    telnyxDtmfMode:
      row?.telnyx_dtmf_mode === "inband" || row?.telnyx_dtmf_mode === "sip_info"
        ? row.telnyx_dtmf_mode
        : "rfc2833",
    qatarDidE164: row?.qatar_did_e164?.trim() ?? "",
    webhookSecretLast4: secretLast4(row?.webhook_shared_secret ?? ""),
    webhookSecretSet: (row?.webhook_shared_secret?.trim() ?? "").length > 0,
    notes: row?.notes ?? "",
    sipConfigured: isSipConfigured(row),
    livekitReady,
    aiFirstAnswerEnabled: Boolean(row?.ai_first_answer_enabled),
    aiHandoffEnabled: Boolean(row?.ai_handoff_enabled ?? true),
    aiNotes: row?.ai_notes ?? "",
    aiSystemPromptEn: row?.ai_system_prompt_en ?? "",
    aiSystemPromptAr: row?.ai_system_prompt_ar ?? "",
    aiWelcomeEn:
      row?.ai_welcome_en?.trim() ||
      "Hello, thank you for calling. How can I help you today?",
    aiWelcomeAr:
      row?.ai_welcome_ar?.trim() ||
      "مرحباً، شكراً لاتصالك. كيف يمكنني مساعدتك؟",
    aiProvider: provider,
    aiModel: row?.ai_model?.trim() || "gemini-flash-latest",
    aiApiKeySet: aiApiKey.length > 0,
    aiApiKeyLast4: secretLast4(aiApiKey),
    aiBaseUrl: row?.ai_base_url?.trim() ?? "",
    aiLanguages: row?.ai_languages?.length ? row.ai_languages : ["en", "ar"],
    aiHandoffAfterSeconds: row?.ai_handoff_after_seconds ?? 45,
    aiHandoffKeywords: row?.ai_handoff_keywords ?? "agent,human,representative,مشغل,موظف",
    aiHandoffQueueId: row?.ai_handoff_queue_id ?? null,
    aiLivekitAgentName: row?.ai_livekit_agent_name?.trim() ?? "",
    aiConfigured,
    openaiEnvKeySet: openaiEnvOnly,
    whatsappEnabled: Boolean(row?.whatsapp_enabled),
    whatsappPhoneNumberId: row?.whatsapp_phone_number_id?.trim() ?? "",
    whatsappWabaId: row?.whatsapp_waba_id?.trim() ?? "",
    whatsappAccessTokenSet: whatsappToken.length > 0 || Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    whatsappAccessTokenLast4: secretLast4(
      whatsappToken || process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "",
    ),
    whatsappVerifyTokenLast4: secretLast4(
      row?.whatsapp_verify_token?.trim() || process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "",
    ),
    whatsappVerifyTokenSet:
      Boolean(row?.whatsapp_verify_token?.trim()) ||
      Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    whatsappConfigured,
    whatsappAutoReplyEnabled: Boolean(row?.whatsapp_auto_reply_enabled),
    whatsappAutoReplyText: row?.whatsapp_auto_reply_text?.trim() ?? "",
    outboundCallerIdE164: row?.outbound_caller_id_e164?.trim() ?? "",
    webhookOutboundUrl: row?.webhook_outbound_url?.trim() ?? "",
    afterHoursGreeting:
      row?.after_hours_greeting?.trim() ||
      "We are currently closed. Please leave a message or call back during business hours.",
    afterHoursAction: row?.after_hours_action ?? "voicemail",
    welcomeGreeting:
      row?.welcome_greeting?.trim() ||
      "Thank you for calling. Please hold while we connect you.",
    welcomeAudioUrl: row?.welcome_audio_url?.trim() ?? "",
    holdMusicUrl: row?.hold_music_url?.trim() ?? "",
    ttsEnabled: Boolean(row?.tts_enabled),
    ttsVoice: normalizeConfiguredTtsVoice(row?.tts_voice),
    ttsGreetingText:
      row?.tts_greeting_text?.trim() ||
      "Welcome. Press a digit from the menu or stay on the line.",
    recordAllCalls: row?.record_all_calls !== false,
    recordingStorageBaseUrl: row?.recording_storage_base_url?.trim() ?? "",
    instagramEnabled: Boolean(row?.instagram_enabled),
    instagramPageId: row?.instagram_page_id?.trim() ?? "",
    instagramIgUserId: row?.instagram_ig_user_id?.trim() ?? "",
    instagramPageAccessTokenSet: igToken.length > 0,
    instagramPageAccessTokenLast4: secretLast4(igToken),
    instagramVerifyTokenSet: igVerify.length > 0,
    instagramVerifyTokenLast4: secretLast4(igVerify),
    instagramConfigured,
    messengerEnabled: Boolean(row?.messenger_enabled),
    messengerPageId: row?.messenger_page_id?.trim() ?? "",
    messengerPageAccessTokenSet: messengerToken.length > 0,
    messengerPageAccessTokenLast4: secretLast4(messengerToken),
    messengerVerifyTokenSet: messengerVerify.length > 0,
    messengerVerifyTokenLast4: secretLast4(messengerVerify),
    messengerConfigured,
    m365Enabled: Boolean(row?.m365_enabled),
    m365Mailbox,
    m365TenantId: m365Tenant,
    m365ClientId,
    m365ClientSecretSet: m365Secret.length > 0,
    m365ClientSecretLast4: secretLast4(m365Secret),
    m365WebhookClientStateSet: m365ClientState.length > 0,
    m365WebhookClientStateLast4: secretLast4(m365ClientState),
    m365Configured,
    m365SubscriptionId: row?.m365_subscription_id?.trim() ?? "",
    m365SubscriptionExpiresAt: row?.m365_subscription_expires_at
      ? String(row.m365_subscription_expires_at)
      : null,
    sendpulseWhatsappNumber:
      row?.sendpulse_whatsapp_number?.trim() ||
      process.env.SENDPULSE_WHATSAPP_NUMBER?.trim() ||
      process.env.SENDPULSE_WHATSAPP_E164?.trim() ||
      "",
    sendpulseWebhookSecretSet:
      Boolean(row?.sendpulse_webhook_secret?.trim()) ||
      Boolean(process.env.SENDPULSE_WEBHOOK_SECRET?.trim()) ||
      Boolean(row?.webhook_shared_secret?.trim()) ||
      Boolean(process.env.CALL_CENTER_WEBHOOK_SECRET?.trim()),
    sendpulseWebhookSecretLast4: (() => {
      const admin = row?.sendpulse_webhook_secret?.trim() ?? "";
      if (admin) return safeUnsealLast4(admin);
      const env = process.env.SENDPULSE_WEBHOOK_SECRET?.trim() ?? "";
      if (env) return secretLast4(env);
      const shared = row?.webhook_shared_secret?.trim() ?? "";
      if (shared) return secretLast4(shared);
      return secretLast4(process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ?? "");
    })(),
  };
}

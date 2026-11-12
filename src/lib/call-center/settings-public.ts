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

export function isSipConfigured(settings: CallCenterSettingsRow | null): boolean {
  if (!settings) return false;
  return (
    settings.telnyx_sip_uri.trim().length > 0 ||
    settings.telnyx_api_key.trim().length > 0 ||
    settings.livekit_sip_trunk_id.trim().length > 0
  );
}

function normalizeAiProvider(value: unknown): CallCenterAiProvider {
  if (value === "openai_compatible" || value === "livekit_agents" || value === "openai") {
    return value;
  }
  return "openai";
}

export function toPublicSettings(
  row: CallCenterSettingsRow | null,
  livekitReady: boolean,
): CallCenterSettingsPublic {
  const aiApiKey = row?.ai_api_key?.trim() ?? "";
  const whatsappToken = row?.whatsapp_access_token?.trim() ?? "";
  const openaiEnvOnly = Boolean(process.env.OPENAI_API_KEY?.trim());
  const aiConfigured =
    aiApiKey.length > 0 ||
    openaiEnvOnly ||
    (row?.ai_provider === "livekit_agents" && Boolean(row.ai_livekit_agent_name?.trim()));
  const whatsappConfigured =
    Boolean(row?.whatsapp_phone_number_id?.trim()) &&
    (whatsappToken.length > 0 || Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()));

  return {
    enabled: Boolean(row?.enabled),
    ivrEnabled: Boolean(row?.ivr_enabled ?? true),
    businessHoursEnabled: Boolean(row?.business_hours_enabled),
    businessHoursJson: row?.business_hours_json ?? {},
    timezone: row?.timezone?.trim() || "Asia/Qatar",
    defaultQueueId: row?.default_queue_id ?? null,
    telnyxSipUri: row?.telnyx_sip_uri?.trim() ?? "",
    telnyxConnectionId: row?.telnyx_connection_id?.trim() ?? "",
    telnyxKeyLast4: secretLast4(row?.telnyx_api_key ?? ""),
    telnyxKeySet: (row?.telnyx_api_key?.trim() ?? "").length > 0,
    telnyxWebhookSecretLast4: secretLast4(row?.telnyx_webhook_secret ?? ""),
    telnyxWebhookSecretSet: (row?.telnyx_webhook_secret?.trim() ?? "").length > 0,
    livekitSipTrunkId: row?.livekit_sip_trunk_id?.trim() ?? "",
    livekitSipDispatchRuleId: row?.livekit_sip_dispatch_rule_id?.trim() ?? "",
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
    aiProvider: normalizeAiProvider(row?.ai_provider),
    aiModel: row?.ai_model?.trim() || "gpt-4o-mini",
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
    ttsVoice: row?.tts_voice?.trim() || "en-US-Neural2-A",
    ttsGreetingText:
      row?.tts_greeting_text?.trim() ||
      "Welcome. Press a digit from the menu or stay on the line.",
  };
}

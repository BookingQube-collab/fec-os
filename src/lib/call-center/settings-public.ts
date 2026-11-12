import type { CallCenterSettingsPublic, CallCenterSettingsRow } from "./types";

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

export function toPublicSettings(
  row: CallCenterSettingsRow | null,
  livekitReady: boolean,
): CallCenterSettingsPublic {
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
    telnyxWebhookSecretSet: (row?.telnyx_webhook_secret?.trim() ?? "").length > 0,
    livekitSipTrunkId: row?.livekit_sip_trunk_id?.trim() ?? "",
    livekitSipDispatchRuleId: row?.livekit_sip_dispatch_rule_id?.trim() ?? "",
    webhookSecretSet: (row?.webhook_shared_secret?.trim() ?? "").length > 0,
    notes: row?.notes ?? "",
    sipConfigured: isSipConfigured(row),
    livekitReady,
    aiFirstAnswerEnabled: Boolean(row?.ai_first_answer_enabled),
    aiHandoffEnabled: Boolean(row?.ai_handoff_enabled ?? true),
    aiNotes: row?.ai_notes ?? "",
    outboundCallerIdE164: row?.outbound_caller_id_e164?.trim() ?? "",
    webhookOutboundUrl: row?.webhook_outbound_url?.trim() ?? "",
  };
}

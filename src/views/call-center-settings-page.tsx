"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Plus, Trash2, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CallCenterAudioUrlField } from "@/components/call-center/audio-url-field";
import { CallCenterSecretField } from "@/components/call-center/secret-field";
import { SendPulseChatbotPanel } from "@/components/call-center/sendpulse-chatbot-panel";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  checkCallCenterCarrier,
  loadCallCenterConfigBundle,
  loadCallCenterWhatsappTemplates,
  previewCallCenterTtsVoice,
  removeCallCenterHoliday,
  removeCallCenterWebhookEndpoint,
  removeCallCenterWhatsappTemplate,
  revealSendPulseWebhookUrlWithSecret,
  saveCallCenterHoliday,
  saveCallCenterSettings,
  saveCallCenterWebhookEndpoint,
  saveCallCenterWhatsappTemplate,
} from "@/lib/call-center/call-center.functions";
import {
  DEFAULT_TTS_VOICE,
  TTS_VOICE_PRESETS,
} from "@/lib/call-center/ivr-tts-voice";
import { recoverMisplacedOutboundSipHost } from "@/lib/call-center/sip-ids";
import type { CallCenterSettingsPublic } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const TTS_PRESET_IDS = new Set(TTS_VOICE_PRESETS.map((p) => p.id));

type SectionTag = { label: string; variant?: "secondary" | "outline" | "info" | "muted" };

function SettingsSectionHeader({
  title,
  hint,
  tags,
  trailing,
}: {
  title: string;
  hint?: string;
  tags?: SectionTag[];
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {tags?.map((tag) => (
            <Badge key={tag.label} variant={tag.variant ?? "outline"} className="font-medium">
              {tag.label}
            </Badge>
          ))}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {trailing ? <div className="flex flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function CallCenterSettingsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const [checkingCarrier, setCheckingCarrier] = useState(false);
  const [carrierChecks, setCarrierChecks] = useState<Array<{ key: string; ok: boolean; detail: string }> | null>(
    null,
  );

  const [enabled, setEnabled] = useState(false);
  const [ivrEnabled, setIvrEnabled] = useState(true);
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Qatar");
  const [defaultQueueId, setDefaultQueueId] = useState("");
  const [outboundCallerId, setOutboundCallerId] = useState("");
  const [telnyxSipUri, setTelnyxSipUri] = useState("");
  const [telnyxConnectionId, setTelnyxConnectionId] = useState("");
  const [telnyxApiKey, setTelnyxApiKey] = useState("");
  const [telnyxWebhookSecret, setTelnyxWebhookSecret] = useState("");
  const [livekitSipTrunkId, setLivekitSipTrunkId] = useState("");
  const [livekitSipInboundTrunkId, setLivekitSipInboundTrunkId] = useState("");
  const [livekitSipDispatchRuleId, setLivekitSipDispatchRuleId] = useState("");
  const [inboundMode, setInboundMode] = useState<"telnyx_sip_trunk" | "telnyx_call_control">(
    "telnyx_sip_trunk",
  );
  const [telnyxDtmfMode, setTelnyxDtmfMode] = useState<"rfc2833" | "inband" | "sip_info">("rfc2833");
  const [qatarDidE164, setQatarDidE164] = useState("");
  const [webhookSharedSecret, setWebhookSharedSecret] = useState("");
  const [webhookOutboundUrl, setWebhookOutboundUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>(
    () =>
      Object.fromEntries(
        DAYS.map((day) => [
          day,
          {
            open: "09:00",
            close: day === "friday" ? "13:00" : "18:00",
            closed: day === "saturday",
          },
        ]),
      ),
  );
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [afterHoursGreeting, setAfterHoursGreeting] = useState("");
  const [afterHoursAction, setAfterHoursAction] = useState<"voicemail" | "hangup" | "queue">(
    "voicemail",
  );
  const [welcomeGreeting, setWelcomeGreeting] = useState("");
  const [welcomeAudioUrl, setWelcomeAudioUrl] = useState("");
  const [holdMusicUrl, setHoldMusicUrl] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE);
  const [ttsGreetingText, setTtsGreetingText] = useState("");
  const [recordAllCalls, setRecordAllCalls] = useState(true);
  const [recordingStorageBaseUrl, setRecordingStorageBaseUrl] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState("");
  const [whatsappAutoReplyEnabled, setWhatsappAutoReplyEnabled] = useState(false);
  const [whatsappAutoReplyText, setWhatsappAutoReplyText] = useState("");
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [instagramPageId, setInstagramPageId] = useState("");
  const [instagramIgUserId, setInstagramIgUserId] = useState("");
  const [instagramPageAccessToken, setInstagramPageAccessToken] = useState("");
  const [instagramVerifyToken, setInstagramVerifyToken] = useState("");
  const [messengerEnabled, setMessengerEnabled] = useState(false);
  const [messengerPageId, setMessengerPageId] = useState("");
  const [messengerPageAccessToken, setMessengerPageAccessToken] = useState("");
  const [messengerVerifyToken, setMessengerVerifyToken] = useState("");
  const [m365Enabled, setM365Enabled] = useState(false);
  const [m365Mailbox, setM365Mailbox] = useState("");
  const [m365TenantId, setM365TenantId] = useState("");
  const [m365ClientId, setM365ClientId] = useState("");
  const [m365ClientSecret, setM365ClientSecret] = useState("");
  const [m365WebhookClientState, setM365WebhookClientState] = useState("");
  const [sendpulseWhatsappNumber, setSendpulseWhatsappNumber] = useState("");
  const [sendpulseWebhookSecret, setSendpulseWebhookSecret] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplLanguage, setTplLanguage] = useState("en");
  const [tplBody, setTplBody] = useState("");
  const [previewingTts, setPreviewingTts] = useState(false);
  const ttsPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsPreviewUrlRef = useRef<string | null>(null);

  const templates = useQuery({
    queryKey: ["call-center", "whatsapp-templates"],
    enabled: canUse && canEdit,
    queryFn: async () => {
      const result = await loadCallCenterWhatsappTemplates({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  function applyPublicSettings(s: CallCenterSettingsPublic) {
    setEnabled(s.enabled);
    setIvrEnabled(s.ivrEnabled);
    setBusinessHoursEnabled(s.businessHoursEnabled);
    setAfterHoursGreeting(s.afterHoursGreeting);
    setAfterHoursAction(s.afterHoursAction);
    setWelcomeGreeting(s.welcomeGreeting);
    setWelcomeAudioUrl(s.welcomeAudioUrl);
    setHoldMusicUrl(s.holdMusicUrl);
    setTtsEnabled(s.ttsEnabled);
    setTtsVoice(s.ttsVoice);
    setTtsGreetingText(s.ttsGreetingText);
    setRecordAllCalls(s.recordAllCalls !== false);
    setRecordingStorageBaseUrl(s.recordingStorageBaseUrl ?? "");
    setWhatsappEnabled(s.whatsappEnabled);
    setWhatsappPhoneNumberId(s.whatsappPhoneNumberId);
    setWhatsappWabaId(s.whatsappWabaId);
    setWhatsappAutoReplyEnabled(s.whatsappAutoReplyEnabled);
    setWhatsappAutoReplyText(s.whatsappAutoReplyText);
    setInstagramEnabled(s.instagramEnabled);
    setInstagramPageId(s.instagramPageId);
    setInstagramIgUserId(s.instagramIgUserId);
    setMessengerEnabled(Boolean(s.messengerEnabled));
    setMessengerPageId(s.messengerPageId ?? "");
    setM365Enabled(Boolean(s.m365Enabled));
    setM365Mailbox(s.m365Mailbox ?? "");
    setM365TenantId(s.m365TenantId ?? "");
    setM365ClientId(s.m365ClientId ?? "");
    setSendpulseWhatsappNumber(s.sendpulseWhatsappNumber ?? "");
    setTimezone(s.timezone);
    setDefaultQueueId(s.defaultQueueId ?? "");
    setOutboundCallerId(s.outboundCallerIdE164);
    const recovered = recoverMisplacedOutboundSipHost({
      outboundTrunkId: s.livekitSipTrunkId,
      sipUri: s.telnyxSipUri,
    });
    setTelnyxSipUri(recovered.sipUri);
    setTelnyxConnectionId(s.telnyxConnectionId);
    setLivekitSipTrunkId(recovered.outboundTrunkId);
    setLivekitSipInboundTrunkId(s.livekitSipInboundTrunkId);
    setLivekitSipDispatchRuleId(s.livekitSipDispatchRuleId);
    setInboundMode(s.inboundMode);
    setTelnyxDtmfMode(s.telnyxDtmfMode);
    setQatarDidE164(s.qatarDidE164);
    setWebhookOutboundUrl(s.webhookOutboundUrl);
    setNotes(s.notes);
    const json = s.businessHoursJson as Record<
      string,
      { open?: string; close?: string; closed?: boolean }
    >;
    const next: Record<string, { open: string; close: string; closed: boolean }> = {};
    for (const day of DAYS) {
      const row = json?.[day];
      next[day] = {
        open: row?.open ?? "09:00",
        close: row?.close ?? "18:00",
        closed: Boolean(row?.closed),
      };
    }
    setHours(next);
    return recovered;
  }

  /** Move a pasted SIP host out of outbound trunk id into Telnyx / SIP URI when appropriate. */
  function recoverOutboundTrunkHostFromForm(options?: { toastOnRecover?: boolean }) {
    const recovered = recoverMisplacedOutboundSipHost({
      outboundTrunkId: livekitSipTrunkId,
      sipUri: telnyxSipUri,
    });
    if (recovered.recovered) {
      setLivekitSipTrunkId(recovered.outboundTrunkId);
      setTelnyxSipUri(recovered.sipUri);
      if (options?.toastOnRecover !== false) {
        toast.message(t("callCenter.carrierTrunkHostMoved"));
      }
    }
    return recovered;
  }

  useEffect(() => {
    if (!bundle.data || hydrated) return;
    const recovered = applyPublicSettings(bundle.data.settings);
    setHydrated(true);
    if (recovered.recovered) {
      toast.message(t("callCenter.carrierTrunkHostMoved"));
    }
  }, [bundle.data, hydrated]);

  useEffect(() => {
    return () => {
      ttsPreviewAudioRef.current?.pause();
      if (ttsPreviewUrlRef.current) {
        URL.revokeObjectURL(ttsPreviewUrlRef.current);
        ttsPreviewUrlRef.current = null;
      }
    };
  }, []);

  async function runCarrierCheck() {
    // Recover a misplaced SIP host in the form first (check also repairs saved settings).
    const recovered = recoverOutboundTrunkHostFromForm();
    if (recovered.recovered) {
      // Still need ST_… before a meaningful check; toast already shown.
      return;
    }
    setCheckingCarrier(true);
    const result = await checkCallCenterCarrier({});
    setCheckingCarrier(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.sipHostRecovered) {
      applyPublicSettings(result.data.settings);
      toast.message(t("callCenter.carrierTrunkHostMoved"));
      queryClient.setQueryData(["call-center", "config"], (prev) =>
        prev ? { ...prev, settings: result.data.settings } : prev,
      );
    }
    setCarrierChecks(result.data.checks);
  }

  async function save() {
    const recovered = recoverOutboundTrunkHostFromForm();
    setSaving(true);
    const result = await saveCallCenterSettings({
      enabled,
      ivrEnabled,
      businessHoursEnabled,
      businessHoursJson: hours,
      timezone,
      defaultQueueId: defaultQueueId || null,
      telnyxSipUri: recovered.sipUri,
      telnyxConnectionId,
      telnyxApiKey,
      telnyxWebhookSecret,
      livekitSipTrunkId: recovered.outboundTrunkId,
      livekitSipInboundTrunkId,
      livekitSipDispatchRuleId,
      inboundMode,
      telnyxDtmfMode,
      qatarDidE164,
      webhookSharedSecret,
      notes,
      outboundCallerIdE164: outboundCallerId,
      webhookOutboundUrl,
      afterHoursGreeting,
      afterHoursAction,
      welcomeGreeting,
      welcomeAudioUrl,
      holdMusicUrl,
      ttsEnabled,
      ttsVoice,
      ttsGreetingText,
      recordAllCalls,
      recordingStorageBaseUrl,
      whatsappEnabled,
      whatsappPhoneNumberId,
      whatsappWabaId,
      whatsappAccessToken,
      whatsappVerifyToken,
      whatsappAutoReplyEnabled,
      whatsappAutoReplyText,
      instagramEnabled,
      instagramPageId,
      instagramIgUserId,
      instagramPageAccessToken,
      instagramVerifyToken,
      messengerEnabled,
      messengerPageId,
      messengerPageAccessToken,
      messengerVerifyToken,
      m365Enabled,
      m365Mailbox,
      m365TenantId,
      m365ClientId,
      m365ClientSecret,
      m365WebhookClientState,
      sendpulseWhatsappNumber,
      sendpulseWebhookSecret,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenterAdmin.saved"));
    // Apply server-normalized values immediately so non-secrets stay visible.
    // Do NOT flip hydrated=false + invalidate (race rehydrates from stale cache and can wipe fields).
    applyPublicSettings(result.data);
    setTelnyxApiKey("");
    setTelnyxWebhookSecret("");
    setWebhookSharedSecret("");
    setWhatsappAccessToken("");
    setWhatsappVerifyToken("");
    setInstagramPageAccessToken("");
    setInstagramVerifyToken("");
    setMessengerPageAccessToken("");
    setMessengerVerifyToken("");
    setM365ClientSecret("");
    setM365WebhookClientState("");
    setSendpulseWebhookSecret("");
    queryClient.setQueryData(["call-center", "config"], (prev) =>
      prev ? { ...prev, settings: result.data } : prev,
    );
    await queryClient.invalidateQueries({ queryKey: ["call-center"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.settingsTitle" subtitleKey="callCenter.settingsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.settingsTitle" subtitleKey="callCenter.settingsSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : !canEdit ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {t("callCenterAdmin.forbidden")}
        </p>
      ) : (
        <div className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <SettingsSectionHeader
              title={t("callCenter.settingsGeneralHeading")}
              hint={t("callCenter.settingsGeneralHint")}
              tags={[
                { label: t("callCenter.tagVoice"), variant: "info" },
                { label: t("callCenter.tagRecording"), variant: "muted" },
              ]}
            />
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--surface-2)]/60 px-3 py-2.5">
              <div>
                <Label htmlFor="cc-enabled">{t("callCenterAdmin.enabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenterAdmin.enabledHint")}</p>
              </div>
              <Switch id="cc-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
              <div>
                <Label htmlFor="cc-ivr">{t("callCenterAdmin.ivrEnabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenterAdmin.ivrEnabledHint")}</p>
              </div>
              <Switch id="cc-ivr" checked={ivrEnabled} onCheckedChange={setIvrEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
              <div>
                <Label htmlFor="cc-bh">{t("callCenter.businessHoursEnabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.businessHoursHint")}</p>
              </div>
              <Switch
                id="cc-bh"
                checked={businessHoursEnabled}
                onCheckedChange={setBusinessHoursEnabled}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
              <div>
                <Label htmlFor="cc-record-all">{t("callCenter.recordAllCalls")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.recordAllCallsHint")}</p>
              </div>
              <Switch
                id="cc-record-all"
                checked={recordAllCalls}
                onCheckedChange={setRecordAllCalls}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-recording-base">{t("callCenter.recordingStorageBaseUrl")}</Label>
              <Input
                id="cc-recording-base"
                value={recordingStorageBaseUrl}
                onChange={(e) => setRecordingStorageBaseUrl(e.target.value)}
                placeholder="https://cdn.example.com/recordings"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.recordingStorageBaseUrlHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.timezone")}</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.defaultQueue")}</Label>
                <Select
                  value={defaultQueueId || "none"}
                  onValueChange={(v) => setDefaultQueueId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("callCenterAdmin.none")}</SelectItem>
                    {(bundle.data?.queues ?? []).map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.outboundCallerId")}</Label>
                <Input
                  value={outboundCallerId}
                  onChange={(e) => setOutboundCallerId(e.target.value)}
                  placeholder="+974XXXXXXXX"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("callCenter.outboundCallerIdHint")}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <SettingsSectionHeader
              title={t("callCenter.mediaSettings")}
              hint={t("callCenter.mediaSettingsHint")}
              tags={[{ label: t("callCenter.tagVoice"), variant: "info" }]}
            />
            <div className="space-y-1.5">
              <Label>{t("callCenter.welcomeGreeting")}</Label>
              <Textarea
                rows={2}
                value={welcomeGreeting}
                onChange={(e) => setWelcomeGreeting(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CallCenterAudioUrlField
                kind="welcome"
                label={t("callCenter.welcomeAudioUrl")}
                value={welcomeAudioUrl}
                onChange={setWelcomeAudioUrl}
                disabled={!canEdit}
              />
              <CallCenterAudioUrlField
                kind="hold"
                label={t("callCenter.holdMusicUrl")}
                value={holdMusicUrl}
                onChange={setHoldMusicUrl}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{t("callCenter.ttsEnabled")}</p>
                <p className="text-xs text-muted-foreground">{t("callCenter.ttsHint")}</p>
              </div>
              <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.ttsVoice")}</Label>
                <div className="flex gap-2">
                  <Select
                    value={TTS_PRESET_IDS.has(ttsVoice) ? ttsVoice : "__custom__"}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setTtsVoice((prev) => (TTS_PRESET_IDS.has(prev) ? "" : prev));
                        return;
                      }
                      setTtsVoice(v);
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue placeholder={DEFAULT_TTS_VOICE} />
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_VOICE_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">{t("callCenter.ttsVoiceCustom")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={!canEdit || previewingTts || !ttsVoice.trim()}
                    onClick={() => {
                      void (async () => {
                        setPreviewingTts(true);
                        try {
                          if (ttsPreviewAudioRef.current) {
                            ttsPreviewAudioRef.current.pause();
                            ttsPreviewAudioRef.current = null;
                          }
                          if (ttsPreviewUrlRef.current) {
                            URL.revokeObjectURL(ttsPreviewUrlRef.current);
                            ttsPreviewUrlRef.current = null;
                          }
                          const result = await previewCallCenterTtsVoice({
                            voice: ttsVoice.trim() || DEFAULT_TTS_VOICE,
                            text: ttsGreetingText,
                          });
                          if (!result.ok) throw new Error(result.error);
                          const binary = atob(result.data.dataBase64);
                          const bytes = new Uint8Array(binary.length);
                          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
                          const blob = new Blob([bytes], {
                            type: result.data.contentType || "audio/mpeg",
                          });
                          const objectUrl = URL.createObjectURL(blob);
                          ttsPreviewUrlRef.current = objectUrl;
                          const audio = new Audio(objectUrl);
                          ttsPreviewAudioRef.current = audio;
                          audio.onended = () => {
                            URL.revokeObjectURL(objectUrl);
                            if (ttsPreviewUrlRef.current === objectUrl) ttsPreviewUrlRef.current = null;
                          };
                          await audio.play();
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : t("callCenter.ttsPreviewFailed"),
                          );
                        } finally {
                          setPreviewingTts(false);
                        }
                      })();
                    }}
                  >
                    <Volume2 className="size-3.5" aria-hidden />
                    {previewingTts ? t("callCenter.ttsPreviewing") : t("callCenter.ttsPreview")}
                  </Button>
                </div>
                {!TTS_PRESET_IDS.has(ttsVoice) ? (
                  <Input
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    placeholder="Azure.en-US-AvaMultilingualNeural"
                    className="mt-2"
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">{t("callCenter.ttsVoiceHint")}</p>
                <p className="text-xs text-muted-foreground">{t("callCenter.ttsPreviewHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.ttsGreetingText")}</Label>
                <Input value={ttsGreetingText} onChange={(e) => setTtsGreetingText(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <SettingsSectionHeader
              title={t("callCenter.businessHours")}
              hint={t("callCenter.businessHoursSectionHint")}
              tags={[{ label: t("callCenter.tagVoice"), variant: "info" }]}
            />
            <div className="space-y-1.5">
              <Label>{t("callCenter.afterHoursGreeting")}</Label>
              <Textarea
                rows={2}
                value={afterHoursGreeting}
                onChange={(e) => setAfterHoursGreeting(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.afterHoursAction")}</Label>
              <Select
                value={afterHoursAction}
                onValueChange={(v) => setAfterHoursAction(v as "voicemail" | "hangup" | "queue")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voicemail">voicemail</SelectItem>
                  <SelectItem value="hangup">hangup</SelectItem>
                  <SelectItem value="queue">queue (still ring)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 capitalize">{day}</span>
                  <Switch
                    checked={!hours[day]?.closed}
                    onCheckedChange={(open) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...prev[day]!, closed: !open },
                      }))
                    }
                  />
                  <Input
                    type="time"
                    className="w-[7.5rem]"
                    value={hours[day]?.open ?? "09:00"}
                    disabled={hours[day]?.closed}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...prev[day]!, open: e.target.value },
                      }))
                    }
                  />
                  <Input
                    type="time"
                    className="w-[7.5rem]"
                    value={hours[day]?.close ?? "18:00"}
                    disabled={hours[day]?.closed}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...prev[day]!, close: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <SettingsSectionHeader
              title={t("callCenter.holidays")}
              hint={t("callCenter.holidaysHint")}
              tags={[{ label: t("callCenter.tagVoice"), variant: "info" }]}
            />
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.label")}</Label>
                <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.holidayDate")}</Label>
                <Input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={async () => {
                  const result = await saveCallCenterHoliday({
                    name: holidayName,
                    holidayDate,
                    isClosed: true,
                    notes: "",
                  });
                  if (!result.ok) toast.error(result.error);
                  else {
                    setHolidayName("");
                    setHolidayDate("");
                    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                  }
                }}
              >
                <Plus className="me-1 h-4 w-4" />
                {t("callCenter.addHoliday")}
              </Button>
            </div>
            <ul className="divide-y divide-border/60 text-sm">
              {(bundle.data?.holidays ?? []).map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2">
                  <span>
                    {h.holidayDate} · {h.name}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await removeCallCenterHoliday({ id: h.id });
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3 rounded-2xl border border-border/50 bg-card p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2 space-y-3">
              <SettingsSectionHeader
                title={t("callCenter.sipSettings")}
                hint={t("callCenter.sipSettingsHint")}
                tags={[
                  { label: t("callCenter.tagVoice"), variant: "info" },
                  { label: t("callCenter.tagCalling"), variant: "secondary" },
                ]}
              />
              <ol className="list-decimal space-y-1 ps-4 text-xs text-muted-foreground">
                <li>{t("callCenter.qatarSetupStep1")}</li>
                <li>{t("callCenter.qatarSetupStep2")}</li>
                <li>{t("callCenter.qatarSetupStep3")}</li>
                <li>{t("callCenter.qatarSetupStep4")}</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                <a
                  className="underline underline-offset-2"
                  href="https://support.telnyx.com/en/articles/8520014-qatar-did-requirements"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("callCenter.qatarKycLink")}
                </a>
                {" · "}
                <a
                  className="underline underline-offset-2"
                  href="https://support.telnyx.com/en/articles/1130710-what-is-dtmf-and-how-to-configure-it-on-telnyx"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("callCenter.dtmfRfc2833Link")}
                </a>
                {" · "}
                <a
                  className="underline underline-offset-2"
                  href="https://telnyx.com/pricing/elastic-sip"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("callCenter.sipPricingLink")}
                </a>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.inboundMode")}</Label>
              <Select
                value={inboundMode}
                onValueChange={(v) =>
                  setInboundMode(v as "telnyx_sip_trunk" | "telnyx_call_control")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnyx_sip_trunk">{t("callCenter.inboundModeSipTrunk")}</SelectItem>
                  <SelectItem value="telnyx_call_control">
                    {t("callCenter.inboundModeCallControl")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("callCenter.inboundModeHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.telnyxDtmfMode")}</Label>
              <Select
                value={telnyxDtmfMode}
                onValueChange={(v) => setTelnyxDtmfMode(v as "rfc2833" | "inband" | "sip_info")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rfc2833">RFC 2833 (recommended)</SelectItem>
                  <SelectItem value="inband">Inband</SelectItem>
                  <SelectItem value="sip_info">SIP INFO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.qatarDidE164")}</Label>
              <Input
                value={qatarDidE164}
                onChange={(e) => setQatarDidE164(e.target.value)}
                placeholder="+974XXXXXXXX"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.qatarDidHint")}</p>
              <p className="text-xs text-muted-foreground">{t("callCenter.voiceNumberVsWhatsappHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxSipUri")}</Label>
              <Input
                value={telnyxSipUri}
                onChange={(e) => setTelnyxSipUri(e.target.value)}
                placeholder="k4xpy1vcnur.sip.livekit.cloud"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.sipUriHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxConnectionId")}</Label>
              <Input
                value={telnyxConnectionId}
                onChange={(e) => setTelnyxConnectionId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.telnyxConnectionHint")}</p>
            </div>
            <CallCenterSecretField
              id="cc-telnyx-api-key"
              label={t("callCenterAdmin.telnyxApiKey")}
              value={telnyxApiKey}
              onChange={setTelnyxApiKey}
              isSet={Boolean(bundle.data?.settings.telnyxKeySet)}
              last4={bundle.data?.settings.telnyxKeyLast4 ?? ""}
              revealField="telnyx_api_key"
            />
            <CallCenterSecretField
              id="cc-webhook-shared-secret"
              label={t("callCenterAdmin.webhookSecret")}
              value={webhookSharedSecret}
              onChange={setWebhookSharedSecret}
              isSet={Boolean(bundle.data?.settings.webhookSecretSet)}
              last4={bundle.data?.settings.webhookSecretLast4 ?? ""}
              revealField="webhook_shared_secret"
            />
            <CallCenterSecretField
              id="cc-telnyx-webhook-secret"
              label={t("callCenterAdmin.telnyxWebhookSecret")}
              value={telnyxWebhookSecret}
              onChange={setTelnyxWebhookSecret}
              isSet={Boolean(bundle.data?.settings.telnyxWebhookSecretSet)}
              last4={bundle.data?.settings.telnyxWebhookSecretLast4 ?? ""}
              revealField="telnyx_webhook_secret"
            />
            <div className="space-y-1.5">
              <Label>{t("callCenter.livekitSipInboundTrunkId")}</Label>
              <Input
                value={livekitSipInboundTrunkId}
                placeholder="ST_xxxxxxxxxxxx"
                onChange={(e) => setLivekitSipInboundTrunkId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.livekitSipInboundTrunkIdHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.livekitSipTrunkId")}</Label>
              <Input
                value={livekitSipTrunkId}
                placeholder="ST_xxxxxxxxxxxx"
                onChange={(e) => setLivekitSipTrunkId(e.target.value)}
                onBlur={() => {
                  recoverOutboundTrunkHostFromForm();
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t("callCenterAdmin.livekitSipTrunkIdHint")}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("callCenterAdmin.livekitSipDispatchRuleId")}</Label>
              <Input
                value={livekitSipDispatchRuleId}
                placeholder="SDR_xxxxxxxxxxxx"
                onChange={(e) => setLivekitSipDispatchRuleId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.dispatchRuleHint")}</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                disabled={!canEdit || checkingCarrier}
                onClick={() => void runCarrierCheck()}
              >
                {checkingCarrier ? t("callCenter.carrierChecking") : t("callCenter.carrierCheck")}
              </Button>
              {carrierChecks ? (
                <ul className="space-y-1 text-xs">
                  {carrierChecks.map((check) => (
                    <li
                      key={check.key}
                      className={check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}
                    >
                      {check.ok ? "✓" : "✗"} {check.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("callCenter.webhookOutboundUrl")}</Label>
              <Input
                value={webhookOutboundUrl}
                onChange={(e) => setWebhookOutboundUrl(e.target.value)}
                placeholder="https://e3fec.vercel.app/api/public/call-center/telnyx"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.webhookOutboundUrlHint")}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("callCenterAdmin.notes")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="sticky bottom-2 z-10 sm:col-span-2">
              <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={saving} onClick={() => void save()}>
                {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
              </Button>
            </div>
          </section>

          <section
            id="sendpulse"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.sendpulseBridgeHeading")}
              hint={t("callCenter.sendpulseBridgeHint")}
              tags={[
                { label: t("callCenter.tagSendPulse"), variant: "secondary" },
                { label: t("callCenter.tagChatbot"), variant: "outline" },
              ]}
              trailing={
                bundle.data?.sendpulseBridge?.secretConfigured ? (
                  <Badge variant="success">{t("callCenter.sendpulseSecretConfigured")}</Badge>
                ) : (
                  <Badge variant="warning">{t("callCenter.sendpulseSecretMissing")}</Badge>
                )
              }
            />
            <p className="text-xs text-muted-foreground">{t("callCenter.sendpulseAdminNote")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cc-sendpulse-wa-number">
                  {t("callCenter.sendpulseWhatsappNumberLabel")}
                </Label>
                <Input
                  id="cc-sendpulse-wa-number"
                  value={sendpulseWhatsappNumber}
                  onChange={(e) => setSendpulseWhatsappNumber(e.target.value)}
                  placeholder="+974XXXXXXXX"
                  className="font-mono text-xs"
                  autoComplete="off"
                  inputMode="tel"
                />
                <p className="text-xs text-muted-foreground">
                  {t("callCenter.sendpulseWhatsappNumberHint")}
                </p>
              </div>
              <CallCenterSecretField
                id="cc-sendpulse-webhook-secret"
                label={t("callCenter.sendpulseWebhookSecretLabel")}
                value={sendpulseWebhookSecret}
                onChange={setSendpulseWebhookSecret}
                isSet={Boolean(bundle.data?.settings.sendpulseWebhookSecretSet)}
                last4={bundle.data?.settings.sendpulseWebhookSecretLast4 ?? ""}
                revealField="sendpulse_webhook_secret"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.sendpulseWebhookSecretHint")}</p>
            <div className="space-y-1.5">
              <Label>{t("callCenter.sendpulseBridgeUrlLabel")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Input
                  readOnly
                  value={
                    bundle.data?.sendpulseBridge?.webhookPath ??
                    "/api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>"
                  }
                  className="min-w-0 flex-1 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    const path =
                      bundle.data?.sendpulseBridge?.webhookPath ??
                      "/api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>";
                    const absolute =
                      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
                    void copyText(absolute).then(() =>
                      toast.success(t("callCenter.settingsCopied")),
                    );
                  }}
                >
                  <Copy className="size-3.5" aria-hidden />
                  {t("callCenter.copyWebhookUrl")}
                </Button>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={saving}
                    onClick={() => {
                      void (async () => {
                        const result = await revealSendPulseWebhookUrlWithSecret({});
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        const absolute =
                          typeof window !== "undefined"
                            ? `${window.location.origin}${result.data.path}`
                            : result.data.path;
                        await copyText(absolute);
                        toast.success(t("callCenter.copyWebhookUrlWithSecretDone"));
                      })();
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    {t("callCenter.copyWebhookUrlWithSecret")}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {bundle.data?.sendpulseBridge?.usesSavedSecret
                  ? t("callCenter.sendpulseBridgeUrlSavedHint")
                  : t("callCenter.sendpulseBridgeUrlHint")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.sendpulseBridgeNumbersHint")}</p>
            <div className="sticky bottom-2 z-10">
              <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={saving} onClick={() => void save()}>
                {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
              </Button>
            </div>
            {(bundle.data?.sendpulseBridge?.warnings ?? []).length > 0 ? (
              <ul className="space-y-1 rounded-xl border border-rag-amber/40 bg-rag-amber/10 px-3 py-2 text-xs text-foreground">
                {bundle.data?.sendpulseBridge?.warnings.map((warning) => (
                  <li key={warning}>⚠ {warning}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section
            id="whatsapp"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.whatsappSettings")}
              hint={t("callCenter.whatsappSettingsHint")}
              tags={[
                { label: t("callCenter.tagFecWhatsapp"), variant: "secondary" },
                { label: t("callCenter.tagAgentInbox"), variant: "outline" },
              ]}
              trailing={
                <>
                  {bundle.data?.settings.whatsappConfigured ? (
                    <Badge variant="success">{t("callCenter.whatsappConfigured")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("callCenter.whatsappMissing")}</Badge>
                  )}
                  <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
                </>
              }
            />
            <p className="text-xs text-muted-foreground">{t("callCenter.whatsappSeparateFromSendpulseHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.whatsappPhoneNumberId")}</Label>
                <Input
                  value={whatsappPhoneNumberId}
                  onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("callCenter.whatsappPhoneNumberIdHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.whatsappWabaId")}</Label>
                <Input
                  value={whatsappWabaId}
                  onChange={(e) => setWhatsappWabaId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("callCenter.whatsappWabaIdHint")}</p>
              </div>
              <CallCenterSecretField
                id="cc-wa-access-token"
                label={t("callCenter.whatsappAccessToken")}
                value={whatsappAccessToken}
                onChange={setWhatsappAccessToken}
                isSet={Boolean(bundle.data?.settings.whatsappAccessTokenSet)}
                last4={bundle.data?.settings.whatsappAccessTokenLast4 ?? ""}
                revealField="whatsapp_access_token"
              />
              <CallCenterSecretField
                id="cc-wa-verify-token"
                label={t("callCenter.whatsappVerifyToken")}
                value={whatsappVerifyToken}
                onChange={setWhatsappVerifyToken}
                isSet={Boolean(bundle.data?.settings.whatsappVerifyTokenSet)}
                last4={bundle.data?.settings.whatsappVerifyTokenLast4 ?? ""}
                revealField="whatsapp_verify_token"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.fecWhatsappE164Label")}</Label>
              <Input
                readOnly
                value={
                  bundle.data?.sendpulseBridge?.callCenterNumber ||
                  t("callCenter.sendpulseNumberUnset")
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("callCenter.fecWhatsappE164Hint")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.whatsappEnvHint")}</p>
            <div className="rounded-xl border border-border/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{t("callCenter.whatsappTemplates")}</h3>
                <Badge variant="outline">{t("callCenter.tagFecWhatsapp")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t("callCenter.whatsappTemplatesHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("callCenterAdmin.label")}</Label>
                  <Input value={tplName} onChange={(e) => setTplName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.whatsappTemplateLanguage")}</Label>
                  <Input value={tplLanguage} onChange={(e) => setTplLanguage(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                  <Label>{t("callCenter.whatsappTemplateBody")}</Label>
                  <Textarea rows={2} value={tplBody} onChange={(e) => setTplBody(e.target.value)} />
                </div>
                <Button
                  type="button"
                  disabled={!tplName.trim()}
                  onClick={() => {
                    void (async () => {
                      const result = await saveCallCenterWhatsappTemplate({
                        name: tplName.trim(),
                        language: tplLanguage.trim() || "en",
                        body: tplBody,
                        isActive: true,
                      });
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success(t("callCenter.whatsappTemplateSaved"));
                        setTplName("");
                        setTplBody("");
                        await queryClient.invalidateQueries({
                          queryKey: ["call-center", "whatsapp-templates"],
                        });
                      }
                    })();
                  }}
                >
                  {t("callCenter.qaSaveTemplate")}
                </Button>
              </div>
              <ul className="divide-y divide-border/50 rounded-xl border border-border/40">
                {(templates.data ?? []).map((tpl) => (
                  <li key={tpl.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium">{tpl.name}</span>
                    <span className="text-xs text-muted-foreground">{tpl.language}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {tpl.body}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        void (async () => {
                          const result = await removeCallCenterWhatsappTemplate({ id: tpl.id });
                          if (!result.ok) toast.error(result.error);
                          else {
                            toast.success(t("callCenter.whatsappTemplateRemoved"));
                            await queryClient.invalidateQueries({
                              queryKey: ["call-center", "whatsapp-templates"],
                            });
                          }
                        })();
                      }}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                <Link href="/call-center/whatsapp" className="underline underline-offset-2">
                  {t("callCenter.whatsappOpenInbox")}
                </Link>
              </p>
            </div>
          </section>

          <section
            id="instagram"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.instagramSettings")}
              hint={t("callCenter.instagramSettingsHint")}
              tags={[{ label: t("callCenter.tagInstagram"), variant: "secondary" }]}
              trailing={
                <>
                  {bundle.data?.settings.instagramConfigured ? (
                    <Badge variant="success">{t("callCenter.instagramConfigured")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("callCenter.instagramMissing")}</Badge>
                  )}
                  <Switch checked={instagramEnabled} onCheckedChange={setInstagramEnabled} />
                </>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.instagramPageId")}</Label>
                <Input
                  value={instagramPageId}
                  onChange={(e) => setInstagramPageId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.instagramIgUserId")}</Label>
                <Input
                  value={instagramIgUserId}
                  onChange={(e) => setInstagramIgUserId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <CallCenterSecretField
                id="cc-ig-page-token"
                label={t("callCenter.instagramPageAccessToken")}
                value={instagramPageAccessToken}
                onChange={setInstagramPageAccessToken}
                isSet={Boolean(bundle.data?.settings.instagramPageAccessTokenSet)}
                last4={bundle.data?.settings.instagramPageAccessTokenLast4 ?? ""}
                revealField="instagram_page_access_token"
              />
              <CallCenterSecretField
                id="cc-ig-verify-token"
                label={t("callCenter.instagramVerifyToken")}
                value={instagramVerifyToken}
                onChange={setInstagramVerifyToken}
                isSet={Boolean(bundle.data?.settings.instagramVerifyTokenSet)}
                last4={bundle.data?.settings.instagramVerifyTokenLast4 ?? ""}
                revealField="instagram_verify_token"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.instagramEnvHint")}</p>
            <p className="rounded-xl border border-dashed border-border/60 bg-[var(--surface-2)]/40 px-3 py-2 text-xs text-muted-foreground">
              {t("callCenter.instagramInboxComing")}
            </p>
            <SendPulseChatbotPanel
              channel="instagram"
              canEdit={canEdit}
              status={bundle.data?.sendpulseBridge}
            />
            <p className="text-xs">
              <Link href="/call-center/instagram" className="text-primary underline-offset-2 hover:underline">
                {t("callCenter.instagramOpenChannel")}
              </Link>
            </p>
          </section>

          <section
            id="messenger"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.messengerSettings")}
              hint={t("callCenter.messengerSettingsHint")}
              tags={[
                { label: t("callCenter.tagMessenger"), variant: "secondary" },
                { label: t("callCenter.tagAgentInbox"), variant: "outline" },
              ]}
              trailing={
                <>
                  {bundle.data?.settings.messengerConfigured ? (
                    <Badge variant="success">{t("callCenter.messengerConfigured")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("callCenter.messengerMissing")}</Badge>
                  )}
                  <Switch checked={messengerEnabled} onCheckedChange={setMessengerEnabled} />
                </>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("callCenter.messengerPageId")}</Label>
                <Input
                  value={messengerPageId}
                  onChange={(e) => setMessengerPageId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("callCenter.messengerPageIdHint")}</p>
              </div>
              <CallCenterSecretField
                id="cc-messenger-page-token"
                label={t("callCenter.messengerPageAccessToken")}
                value={messengerPageAccessToken}
                onChange={setMessengerPageAccessToken}
                isSet={Boolean(bundle.data?.settings.messengerPageAccessTokenSet)}
                last4={bundle.data?.settings.messengerPageAccessTokenLast4 ?? ""}
                revealField="messenger_page_access_token"
              />
              <CallCenterSecretField
                id="cc-messenger-verify-token"
                label={t("callCenter.messengerVerifyToken")}
                value={messengerVerifyToken}
                onChange={setMessengerVerifyToken}
                isSet={Boolean(bundle.data?.settings.messengerVerifyTokenSet)}
                last4={bundle.data?.settings.messengerVerifyTokenLast4 ?? ""}
                revealField="messenger_verify_token"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.messengerEnvHint")}</p>
            <SendPulseChatbotPanel
              channel="messenger"
              canEdit={canEdit}
              status={bundle.data?.sendpulseBridge}
            />
            <p className="text-xs">
              <Link href="/call-center/messenger" className="text-primary underline-offset-2 hover:underline">
                {t("callCenter.messengerOpenChannel")}
              </Link>
            </p>
          </section>

          <section
            id="m365"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.m365Settings")}
              hint={t("callCenter.m365SettingsHint")}
              tags={[
                { label: t("callCenter.tagM365"), variant: "secondary" },
                { label: t("callCenter.tagEmail"), variant: "outline" },
              ]}
              trailing={
                <>
                  {bundle.data?.settings.m365Configured ? (
                    <Badge variant="success">{t("callCenter.m365Configured")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("callCenter.m365Missing")}</Badge>
                  )}
                  <Switch checked={m365Enabled} onCheckedChange={setM365Enabled} />
                </>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("callCenter.m365Mailbox")}</Label>
                <Input
                  value={m365Mailbox}
                  onChange={(e) => setM365Mailbox(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.m365TenantId")}</Label>
                <Input
                  value={m365TenantId}
                  onChange={(e) => setM365TenantId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.m365ClientId")}</Label>
                <Input
                  value={m365ClientId}
                  onChange={(e) => setM365ClientId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <CallCenterSecretField
                id="cc-m365-client-secret"
                label={t("callCenter.m365ClientSecret")}
                value={m365ClientSecret}
                onChange={setM365ClientSecret}
                isSet={Boolean(bundle.data?.settings.m365ClientSecretSet)}
                last4={bundle.data?.settings.m365ClientSecretLast4 ?? ""}
                revealField="m365_client_secret"
              />
              <CallCenterSecretField
                id="cc-m365-client-state"
                label={t("callCenter.m365WebhookClientState")}
                value={m365WebhookClientState}
                onChange={setM365WebhookClientState}
                isSet={Boolean(bundle.data?.settings.m365WebhookClientStateSet)}
                last4={bundle.data?.settings.m365WebhookClientStateLast4 ?? ""}
                revealField="m365_webhook_client_state"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("callCenter.m365EnvHint")}</p>
            <p className="rounded-xl border border-dashed border-border/60 bg-[var(--surface-2)]/40 px-3 py-2 text-xs text-muted-foreground">
              {t("callCenter.m365InboxComing")}
            </p>
            <p className="text-xs">
              <Link href="/call-center/email" className="text-primary underline-offset-2 hover:underline">
                {t("callCenter.m365OpenChannel")}
              </Link>
            </p>
          </section>

          <section
            id="automation"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <SettingsSectionHeader
              title={t("callCenter.automationTitle")}
              hint={t("callCenter.automationHint")}
              tags={[
                { label: t("callCenter.tagSendPulse"), variant: "secondary" },
                { label: t("callCenter.tagChatbot"), variant: "outline" },
              ]}
            />
            <SendPulseChatbotPanel
              channel="whatsapp"
              canEdit={canEdit}
              status={bundle.data?.sendpulseBridge}
            />
            <div className="rounded-xl border border-border/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t("callCenter.whatsappAutoReply")}</p>
                  <p className="text-xs text-muted-foreground">{t("callCenter.whatsappAutoReplyHint")}</p>
                </div>
                <Switch
                  checked={whatsappAutoReplyEnabled}
                  onCheckedChange={setWhatsappAutoReplyEnabled}
                  disabled={!whatsappEnabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.whatsappAutoReplyText")}</Label>
                <Textarea
                  rows={3}
                  value={whatsappAutoReplyText}
                  onChange={(e) => setWhatsappAutoReplyText(e.target.value)}
                  placeholder={t("callCenter.whatsappAutoReplyPlaceholder")}
                  maxLength={4096}
                  disabled={!whatsappEnabled}
                />
                <p className="text-[11px] text-muted-foreground">{whatsappAutoReplyText.length}/4096</p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center">
              <Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" aria-hidden />
              <p className="text-sm font-medium">{t("callCenter.automationRoadmapTitle")}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {t("callCenter.automationRoadmapBody")}
              </p>
              <ul className="mx-auto mt-3 max-w-sm space-y-1 text-start text-xs text-muted-foreground">
                <li>• {t("callCenter.automationRoadmapItem1")}</li>
                <li>• {t("callCenter.automationRoadmapItem2")}</li>
                <li>• {t("callCenter.automationRoadmapItem3")}</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <SettingsSectionHeader
              title={t("callCenter.integrations")}
              hint={t("callCenter.integrationsHint")}
              tags={[{ label: t("callCenter.tagIntegrations"), variant: "muted" }]}
            />
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.label")}</Label>
                <Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} />
              </div>
              <div className="min-w-[16rem] flex-1 space-y-1.5">
                <Label>{t("callCenter.integrationsWebhookUrl")}</Label>
                <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
              </div>
              <Button
                type="button"
                onClick={async () => {
                  const result = await saveCallCenterWebhookEndpoint({
                    name: webhookName,
                    url: webhookUrl,
                    events: ["call.ended", "call.answered"],
                    isActive: true,
                    secretHint: "",
                  });
                  if (!result.ok) toast.error(result.error);
                  else {
                    setWebhookName("");
                    setWebhookUrl("");
                    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                  }
                }}
              >
                <Plus className="me-1 h-4 w-4" />
                {t("callCenter.addWebhook")}
              </Button>
            </div>
            <ul className="divide-y divide-border/60 text-sm">
              {(bundle.data?.webhooks ?? []).map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2">
                  <span>
                    {w.name} · {w.url}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await removeCallCenterWebhookEndpoint({ id: w.id });
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterSettingsPage;

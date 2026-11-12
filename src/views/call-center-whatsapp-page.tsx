"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CallCenterSecretField } from "@/components/call-center/secret-field";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  assignCallCenterWhatsappConversation,
  loadCallCenterConfigBundle,
  loadCallCenterWhatsappInbox,
  replyCallCenterWhatsappMessage,
  saveCallCenterSettings,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterSettingsPublic } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function baseSettingsPayload(s: CallCenterSettingsPublic) {
  return {
    enabled: s.enabled,
    ivrEnabled: s.ivrEnabled,
    businessHoursEnabled: s.businessHoursEnabled,
    businessHoursJson: s.businessHoursJson,
    timezone: s.timezone,
    defaultQueueId: s.defaultQueueId,
    telnyxSipUri: s.telnyxSipUri,
    telnyxConnectionId: s.telnyxConnectionId,
    telnyxApiKey: "",
    telnyxWebhookSecret: "",
    livekitSipTrunkId: s.livekitSipTrunkId,
    livekitSipDispatchRuleId: s.livekitSipDispatchRuleId,
    webhookSharedSecret: "",
    notes: s.notes,
    aiFirstAnswerEnabled: s.aiFirstAnswerEnabled,
    aiHandoffEnabled: s.aiHandoffEnabled,
    aiNotes: s.aiNotes,
    aiSystemPromptEn: s.aiSystemPromptEn,
    aiSystemPromptAr: s.aiSystemPromptAr,
    aiWelcomeEn: s.aiWelcomeEn,
    aiWelcomeAr: s.aiWelcomeAr,
    aiProvider: s.aiProvider,
    aiModel: s.aiModel,
    aiApiKey: "",
    aiBaseUrl: s.aiBaseUrl,
    aiLanguages: s.aiLanguages,
    aiHandoffAfterSeconds: s.aiHandoffAfterSeconds,
    aiHandoffKeywords: s.aiHandoffKeywords,
    aiHandoffQueueId: s.aiHandoffQueueId,
    aiLivekitAgentName: s.aiLivekitAgentName,
    outboundCallerIdE164: s.outboundCallerIdE164,
    webhookOutboundUrl: s.webhookOutboundUrl,
    afterHoursGreeting: s.afterHoursGreeting,
    afterHoursAction: s.afterHoursAction,
    welcomeGreeting: s.welcomeGreeting,
    welcomeAudioUrl: s.welcomeAudioUrl,
    holdMusicUrl: s.holdMusicUrl,
    ttsEnabled: s.ttsEnabled,
    ttsVoice: s.ttsVoice,
    ttsGreetingText: s.ttsGreetingText,
  };
}

function CallCenterWhatsappPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const inbox = useQuery({
    queryKey: ["call-center", "whatsapp-inbox", selectedId],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterWhatsappInbox({ conversationId: selectedId });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 15_000,
  });

  const config = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse && canEdit,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  useEffect(() => {
    if (!inbox.data?.selectedConversationId) return;
    if (!selectedId) setSelectedId(inbox.data.selectedConversationId);
  }, [inbox.data?.selectedConversationId, selectedId]);

  useEffect(() => {
    const s = config.data?.settings ?? inbox.data?.settings;
    if (!s || hydrated) return;
    setEnabled(s.whatsappEnabled);
    setPhoneNumberId(s.whatsappPhoneNumberId);
    setWabaId(s.whatsappWabaId);
    setHydrated(true);
  }, [config.data?.settings, inbox.data?.settings, hydrated]);

  async function saveSettings() {
    const s = config.data?.settings ?? inbox.data?.settings;
    if (!s) return;
    setSavingSettings(true);
    const result = await saveCallCenterSettings({
      ...baseSettingsPayload(s),
      whatsappEnabled: enabled,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappWabaId: wabaId,
      whatsappAccessToken: accessToken,
      whatsappVerifyToken: verifyToken,
    });
    setSavingSettings(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAccessToken("");
    setVerifyToken("");
    toast.success(t("callCenter.whatsappSaved"));
    setHydrated(false);
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
    await queryClient.invalidateQueries({ queryKey: ["call-center", "whatsapp-inbox"] });
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      const result = await replyCallCenterWhatsappMessage({
        conversationId: selectedId,
        body: reply.trim(),
      });
      if (!result.ok) throw new Error(result.error);
      if (!result.data.sent) {
        toast.error(result.data.error || t("callCenter.whatsappSendFailed"));
      } else {
        toast.success(t("callCenter.whatsappSent"));
        setReply("");
      }
      await queryClient.invalidateQueries({ queryKey: ["call-center", "whatsapp-inbox"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSending(false);
    }
  }

  async function assignToMe() {
    if (!selectedId || !user?.id) return;
    const result = await assignCallCenterWhatsappConversation({
      conversationId: selectedId,
      agentUserId: user.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.whatsappAssigned"));
    await queryClient.invalidateQueries({ queryKey: ["call-center", "whatsapp-inbox"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const settings = inbox.data?.settings ?? config.data?.settings;
  const conversations = inbox.data?.conversations ?? [];
  const messages = inbox.data?.messages ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <CallCenterShell titleKey="callCenter.whatsappTitle" subtitleKey="callCenter.whatsappSubtitle">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {settings?.whatsappConfigured ? (
          <Badge variant="secondary">{t("callCenter.whatsappConfigured")}</Badge>
        ) : (
          <Badge variant="outline">{t("callCenter.whatsappMissing")}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          POST /api/public/call-center/whatsapp
        </span>
      </div>

      {canEdit ? (
        <section className="mb-4 space-y-3 rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("callCenter.whatsappSettings")}</h2>
              <p className="text-xs text-muted-foreground">{t("callCenter.whatsappSettingsHint")}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("callCenter.whatsappPhoneNumberId")}</Label>
              <Input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.whatsappWabaId")}</Label>
              <Input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <CallCenterSecretField
              id="cc-wa-access-token"
              label={t("callCenter.whatsappAccessToken")}
              value={accessToken}
              onChange={setAccessToken}
              isSet={Boolean(settings?.whatsappAccessTokenSet)}
              last4={settings?.whatsappAccessTokenLast4 ?? ""}
              revealField="whatsapp_access_token"
            />
            <CallCenterSecretField
              id="cc-wa-verify-token"
              label={t("callCenter.whatsappVerifyToken")}
              value={verifyToken}
              onChange={setVerifyToken}
              isSet={Boolean(settings?.whatsappVerifyTokenSet)}
              last4={settings?.whatsappVerifyTokenLast4 ?? ""}
              revealField="whatsapp_verify_token"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("callCenter.whatsappEnvHint")}</p>
          <Button
            type="button"
            disabled={savingSettings}
            onClick={() => void saveSettings()}
          >
            {savingSettings ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
          </Button>
        </section>
      ) : null}

      {inbox.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <section className="rounded-2xl border border-border/50 bg-card">
            <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("callCenter.whatsappInbox")}
            </div>
            <ul className="max-h-[28rem] overflow-y-auto">
              {conversations.length === 0 ? (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                  {t("callCenter.whatsappEmpty")}
                </li>
              ) : (
                conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full border-b border-border/30 px-3 py-2.5 text-start hover:bg-muted/40 ${
                        selectedId === c.id ? "bg-muted/50" : ""
                      }`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.customerName || c.customerE164 || c.waId}
                        </span>
                        {c.unreadCount > 0 ? (
                          <Badge variant="secondary">{c.unreadCount}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.lastMessagePreview || "—"}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="flex min-h-[28rem] flex-col rounded-2xl border border-border/50 bg-card">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {selected.customerName || selected.customerE164}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selected.customerE164 || selected.waId}
                    </p>
                  </div>
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Select
                      value={selected.assignedAgentId || "none"}
                      onValueChange={(v) => {
                        void (async () => {
                          const result = await assignCallCenterWhatsappConversation({
                            conversationId: selected.id,
                            agentUserId: v === "none" ? null : v,
                          });
                          if (!result.ok) toast.error(result.error);
                          else {
                            toast.success(t("callCenter.whatsappAssigned"));
                            await queryClient.invalidateQueries({
                              queryKey: ["call-center", "whatsapp-inbox"],
                            });
                          }
                        })();
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder={t("callCenter.whatsappAssign")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("callCenter.whatsappUnassigned")}</SelectItem>
                        {(inbox.data?.agents ?? []).map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>
                            {a.displayNameOverride ||
                              a.extension ||
                              a.userId.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" onClick={() => void assignToMe()}>
                      {t("callCenter.whatsappAssignMe")}
                    </Button>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "ms-auto bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          m.direction === "outbound"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {m.status}
                        {m.errorText ? ` · ${m.errorText}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 p-3">
                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t("callCenter.whatsappReplyPlaceholder")}
                      className="min-h-[2.5rem]"
                    />
                    <Button
                      type="button"
                      disabled={sending || !reply.trim()}
                      onClick={() => void sendReply()}
                    >
                      {sending ? t("callCenterAdmin.saving") : t("callCenter.whatsappSend")}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                {t("callCenter.whatsappPick")}
              </div>
            )}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterWhatsappPage;

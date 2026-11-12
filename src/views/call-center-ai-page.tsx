"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
  loadCallCenterConfigBundle,
  saveCallCenterSettings,
  testCallCenterAiPrompt,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterAiProvider, CallCenterSettingsPublic } from "@/lib/call-center/types";
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
    whatsappEnabled: s.whatsappEnabled,
    whatsappPhoneNumberId: s.whatsappPhoneNumberId,
    whatsappWabaId: s.whatsappWabaId,
    whatsappAccessToken: "",
    whatsappVerifyToken: "",
  };
}

function CallCenterAiPage() {
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

  const [firstAnswer, setFirstAnswer] = useState(false);
  const [handoff, setHandoff] = useState(true);
  const [notes, setNotes] = useState("");
  const [promptEn, setPromptEn] = useState("");
  const [promptAr, setPromptAr] = useState("");
  const [welcomeEn, setWelcomeEn] = useState("");
  const [welcomeAr, setWelcomeAr] = useState("");
  const [provider, setProvider] = useState<CallCenterAiProvider>("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [languages, setLanguages] = useState("en, ar");
  const [handoffSeconds, setHandoffSeconds] = useState("45");
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [handoffQueueId, setHandoffQueueId] = useState<string>("none");
  const [livekitAgent, setLivekitAgent] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPrompt, setTestPrompt] = useState("");
  const [testLang, setTestLang] = useState<"en" | "ar">("en");
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!bundle.data || hydrated) return;
    const s = bundle.data.settings;
    setFirstAnswer(s.aiFirstAnswerEnabled);
    setHandoff(s.aiHandoffEnabled);
    setNotes(s.aiNotes);
    setPromptEn(s.aiSystemPromptEn);
    setPromptAr(s.aiSystemPromptAr);
    setWelcomeEn(s.aiWelcomeEn);
    setWelcomeAr(s.aiWelcomeAr);
    setProvider(s.aiProvider);
    setModel(s.aiModel);
    setBaseUrl(s.aiBaseUrl);
    setLanguages(s.aiLanguages.join(", "));
    setHandoffSeconds(String(s.aiHandoffAfterSeconds));
    setHandoffKeywords(s.aiHandoffKeywords);
    setHandoffQueueId(s.aiHandoffQueueId || "none");
    setLivekitAgent(s.aiLivekitAgentName);
    setHydrated(true);
  }, [bundle.data, hydrated]);

  async function save() {
    if (!bundle.data) return;
    const s = bundle.data.settings;
    setSaving(true);
    const result = await saveCallCenterSettings({
      ...baseSettingsPayload(s),
      aiFirstAnswerEnabled: firstAnswer,
      aiHandoffEnabled: handoff,
      aiNotes: notes,
      aiSystemPromptEn: promptEn,
      aiSystemPromptAr: promptAr,
      aiWelcomeEn: welcomeEn,
      aiWelcomeAr: welcomeAr,
      aiProvider: provider,
      aiModel: model,
      aiApiKey: apiKey,
      aiBaseUrl: baseUrl,
      aiLanguages: languages
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      aiHandoffAfterSeconds: Math.max(0, Math.min(600, Number(handoffSeconds) || 0)),
      aiHandoffKeywords: handoffKeywords,
      aiHandoffQueueId: handoffQueueId === "none" ? null : handoffQueueId,
      aiLivekitAgentName: livekitAgent,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setApiKey("");
    toast.success(t("callCenter.aiSaved"));
    setHydrated(false);
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  async function runTest() {
    if (!testPrompt.trim()) return;
    setTesting(true);
    setTestResult("");
    try {
      const result = await testCallCenterAiPrompt({
        prompt: testPrompt,
        language: testLang,
      });
      if (!result.ok) throw new Error(result.error);
      setTestResult(
        `${result.data.text}\n\n— ${result.data.provider} / ${result.data.model}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setTesting(false);
    }
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.aiTitle" subtitleKey="callCenter.aiSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const settings = bundle.data?.settings;

  return (
    <CallCenterShell titleKey="callCenter.aiTitle" subtitleKey="callCenter.aiSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card p-4">
            <span className="text-sm font-medium">{t("callCenter.aiStatus")}</span>
            {settings?.aiConfigured ? (
              <Badge variant="secondary">{t("callCenter.aiConfigured")}</Badge>
            ) : (
              <Badge variant="outline">{t("callCenter.aiMissingKeys")}</Badge>
            )}
            {settings?.aiApiKeySet ? (
              <span className="text-xs text-muted-foreground">
                {t("callCenterAdmin.keyLast4", { last4: settings.aiApiKeyLast4 })}
              </span>
            ) : settings?.openaiEnvKeySet ? (
              <span className="text-xs text-muted-foreground">{t("callCenter.aiEnvKey")}</span>
            ) : null}
            <Link
              href="/call-center/ivr"
              className="ms-auto text-xs underline underline-offset-2 text-muted-foreground"
            >
              {t("callCenter.aiIvrLink")}
            </Link>
          </section>

          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold">{t("callCenter.aiRoutingHeading")}</h2>
              <p className="text-xs text-muted-foreground">{t("callCenter.aiStubBody")}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("callCenter.aiFirstAnswer")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.aiFirstAnswerHint")}</p>
              </div>
              <Switch
                checked={firstAnswer}
                onCheckedChange={setFirstAnswer}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("callCenter.aiHandoff")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenter.aiHandoffHint")}</p>
              </div>
              <Switch checked={handoff} onCheckedChange={setHandoff} disabled={!canEdit} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiHandoffAfter")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={600}
                  value={handoffSeconds}
                  disabled={!canEdit}
                  onChange={(e) => setHandoffSeconds(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiHandoffQueue")}</Label>
                <Select
                  value={handoffQueueId}
                  disabled={!canEdit}
                  onValueChange={setHandoffQueueId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("callCenter.filterAll")}</SelectItem>
                    {(bundle.data?.queues ?? []).map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.aiHandoffKeywords")}</Label>
              <Input
                value={handoffKeywords}
                disabled={!canEdit}
                onChange={(e) => setHandoffKeywords(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.aiPromptsHeading")}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiWelcomeEn")}</Label>
                <Textarea
                  rows={2}
                  value={welcomeEn}
                  disabled={!canEdit}
                  onChange={(e) => setWelcomeEn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiWelcomeAr")}</Label>
                <Textarea
                  rows={2}
                  dir="rtl"
                  value={welcomeAr}
                  disabled={!canEdit}
                  onChange={(e) => setWelcomeAr(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiPromptEn")}</Label>
                <Textarea
                  rows={5}
                  value={promptEn}
                  disabled={!canEdit}
                  onChange={(e) => setPromptEn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiPromptAr")}</Label>
                <Textarea
                  rows={5}
                  dir="rtl"
                  value={promptAr}
                  disabled={!canEdit}
                  onChange={(e) => setPromptAr(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenter.aiNotes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={!canEdit}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.aiProviderHeading")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiProvider")}</Label>
                <Select
                  value={provider}
                  disabled={!canEdit}
                  onValueChange={(v) => setProvider(v as CallCenterAiProvider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="openai_compatible">OpenAI-compatible</SelectItem>
                    <SelectItem value="livekit_agents">LiveKit Agents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiModel")}</Label>
                <Input
                  value={model}
                  disabled={!canEdit}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiApiKey")}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    settings?.aiApiKeySet
                      ? t("callCenterAdmin.keyLast4", { last4: settings.aiApiKeyLast4 })
                      : "sk-…"
                  }
                  value={apiKey}
                  disabled={!canEdit}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiBaseUrl")}</Label>
                <Input
                  value={baseUrl}
                  disabled={!canEdit}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiLanguages")}</Label>
                <Input
                  value={languages}
                  disabled={!canEdit}
                  onChange={(e) => setLanguages(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.aiLivekitAgent")}</Label>
                <Input
                  value={livekitAgent}
                  disabled={!canEdit}
                  onChange={(e) => setLivekitAgent(e.target.value)}
                  placeholder="fec-call-agent"
                />
              </div>
            </div>
            {canEdit ? (
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("callCenter.configReadOnly")}</p>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.aiTestHeading")}</h2>
            <p className="text-xs text-muted-foreground">{t("callCenter.aiTestHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Select
                value={testLang}
                onValueChange={(v) => setTestLang(v as "en" | "ar")}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="ar">AR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={3}
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder={t("callCenter.aiTestPlaceholder")}
              disabled={!canEdit}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || testing || !testPrompt.trim()}
              onClick={() => void runTest()}
            >
              {testing ? t("callCenterAdmin.saving") : t("callCenter.aiRunTest")}
            </Button>
            {testResult ? (
              <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs">
                {testResult}
              </pre>
            ) : null}
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterAiPage;

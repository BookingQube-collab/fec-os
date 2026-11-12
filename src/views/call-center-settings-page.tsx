"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
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
  loadCallCenterConfigBundle,
  removeCallCenterHoliday,
  removeCallCenterWebhookEndpoint,
  saveCallCenterHoliday,
  saveCallCenterSettings,
  saveCallCenterWebhookEndpoint,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

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
  const [livekitSipDispatchRuleId, setLivekitSipDispatchRuleId] = useState("");
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

  useEffect(() => {
    if (!bundle.data || hydrated) return;
    const s = bundle.data.settings;
    setEnabled(s.enabled);
    setIvrEnabled(s.ivrEnabled);
    setBusinessHoursEnabled(s.businessHoursEnabled);
    setAfterHoursGreeting(s.afterHoursGreeting);
    setAfterHoursAction(s.afterHoursAction);
    setTimezone(s.timezone);
    setDefaultQueueId(s.defaultQueueId ?? "");
    setOutboundCallerId(s.outboundCallerIdE164);
    setTelnyxSipUri(s.telnyxSipUri);
    setTelnyxConnectionId(s.telnyxConnectionId);
    setLivekitSipTrunkId(s.livekitSipTrunkId);
    setLivekitSipDispatchRuleId(s.livekitSipDispatchRuleId);
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
    setHydrated(true);
  }, [bundle.data, hydrated]);

  async function save() {
    setSaving(true);
    const result = await saveCallCenterSettings({
      enabled,
      ivrEnabled,
      businessHoursEnabled,
      businessHoursJson: hours,
      timezone,
      defaultQueueId: defaultQueueId || null,
      telnyxSipUri,
      telnyxConnectionId,
      telnyxApiKey,
      telnyxWebhookSecret,
      livekitSipTrunkId,
      livekitSipDispatchRuleId,
      webhookSharedSecret,
      notes,
      outboundCallerIdE164: outboundCallerId,
      webhookOutboundUrl,
      afterHoursGreeting,
      afterHoursAction,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenterAdmin.saved"));
    setTelnyxApiKey("");
    setTelnyxWebhookSecret("");
    setWebhookSharedSecret("");
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
        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="cc-enabled">{t("callCenterAdmin.enabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenterAdmin.enabledHint")}</p>
              </div>
              <Switch id="cc-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="cc-ivr">{t("callCenterAdmin.ivrEnabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("callCenterAdmin.ivrEnabledHint")}</p>
              </div>
              <Switch id="cc-ivr" checked={ivrEnabled} onCheckedChange={setIvrEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3">
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
                <Input value={outboundCallerId} onChange={(e) => setOutboundCallerId(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.businessHours")}</h2>
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

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.holidays")}</h2>
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

          <section className="grid gap-3 rounded-2xl border border-border/50 bg-card p-4 sm:grid-cols-2">
            <h2 className="text-sm font-semibold sm:col-span-2">{t("callCenter.sipSettings")}</h2>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxSipUri")}</Label>
              <Input value={telnyxSipUri} onChange={(e) => setTelnyxSipUri(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxConnectionId")}</Label>
              <Input
                value={telnyxConnectionId}
                onChange={(e) => setTelnyxConnectionId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxApiKey")}</Label>
              <Input
                type="password"
                value={telnyxApiKey}
                onChange={(e) => setTelnyxApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.webhookSecret")}</Label>
              <Input
                type="password"
                value={webhookSharedSecret}
                onChange={(e) => setWebhookSharedSecret(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.telnyxWebhookSecret")}</Label>
              <Input
                type="password"
                value={telnyxWebhookSecret}
                onChange={(e) => setTelnyxWebhookSecret(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.livekitSipTrunkId")}</Label>
              <Input
                value={livekitSipTrunkId}
                onChange={(e) => setLivekitSipTrunkId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("callCenterAdmin.livekitSipDispatchRuleId")}</Label>
              <Input
                value={livekitSipDispatchRuleId}
                onChange={(e) => setLivekitSipDispatchRuleId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("callCenter.webhookOutboundUrl")}</Label>
              <Input
                value={webhookOutboundUrl}
                onChange={(e) => setWebhookOutboundUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("callCenterAdmin.notes")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="sm:col-span-2">
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenter.integrations")}</h2>
            <p className="text-xs text-muted-foreground">{t("callCenter.integrationsHint")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label>{t("callCenterAdmin.label")}</Label>
                <Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} />
              </div>
              <div className="min-w-[16rem] flex-1 space-y-1.5">
                <Label>URL</Label>
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

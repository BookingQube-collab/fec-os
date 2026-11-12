"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CallCenterSecretField } from "@/components/call-center/secret-field";
import { FecButton as Button, FecLoader, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  loadCallCenterAdminBundle,
  removeCallCenterDid,
  removeCallCenterQueue,
  removeCallCenterQueueMember,
  saveCallCenterDid,
  saveCallCenterQueue,
  saveCallCenterQueueMember,
  saveCallCenterSettings,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterQueueStrategy } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";

const QUERY_KEY = ["admin", "call-center"] as const;

function AdminCallCenterPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;

  const bundle = useQuery({
    queryKey: QUERY_KEY,
    enabled: canEdit,
    queryFn: async () => {
      const result = await loadCallCenterAdminBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [ivrEnabled, setIvrEnabled] = useState(true);
  const [timezone, setTimezone] = useState("Asia/Qatar");
  const [defaultQueueId, setDefaultQueueId] = useState<string>("");
  const [telnyxSipUri, setTelnyxSipUri] = useState("");
  const [telnyxConnectionId, setTelnyxConnectionId] = useState("");
  const [telnyxApiKey, setTelnyxApiKey] = useState("");
  const [telnyxWebhookSecret, setTelnyxWebhookSecret] = useState("");
  const [livekitSipTrunkId, setLivekitSipTrunkId] = useState("");
  const [livekitSipDispatchRuleId, setLivekitSipDispatchRuleId] = useState("");
  const [webhookSharedSecret, setWebhookSharedSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  const [queueName, setQueueName] = useState("Support");
  const [queueStrategy, setQueueStrategy] = useState<CallCenterQueueStrategy>("simultaneous");
  const [didE164, setDidE164] = useState("+974");
  const [didLabel, setDidLabel] = useState("");
  const [didQueueId, setDidQueueId] = useState("");
  const [memberQueueId, setMemberQueueId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");

  useEffect(() => {
    if (!bundle.data || hydrated) return;
    const s = bundle.data.settings;
    setEnabled(s.enabled);
    setIvrEnabled(s.ivrEnabled);
    setTimezone(s.timezone);
    setDefaultQueueId(s.defaultQueueId ?? "");
    setTelnyxSipUri(s.telnyxSipUri);
    setTelnyxConnectionId(s.telnyxConnectionId);
    setLivekitSipTrunkId(s.livekitSipTrunkId);
    setLivekitSipDispatchRuleId(s.livekitSipDispatchRuleId);
    setNotes(s.notes);
    setTelnyxApiKey("");
    setTelnyxWebhookSecret("");
    setWebhookSharedSecret("");
    if (bundle.data.queues[0]) {
      setDidQueueId(bundle.data.queues[0].id);
      setMemberQueueId(bundle.data.queues[0].id);
    }
    if (user?.id) setMemberUserId(user.id);
    setHydrated(true);
  }, [bundle.data, hydrated, user?.id]);

  async function saveSettings() {
    setSaving(true);
    const result = await saveCallCenterSettings({
      enabled,
      ivrEnabled,
      businessHoursEnabled: false,
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
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setTelnyxApiKey("");
    setTelnyxWebhookSecret("");
    setWebhookSharedSecret("");
    setHydrated(false);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    toast.success(t("callCenterAdmin.saved"));
  }

  async function addQueue() {
    const result = await saveCallCenterQueue({
      name: queueName.trim() || "Queue",
      strategy: queueStrategy,
      eventId: null,
      wrapUpSeconds: 30,
      maxWaitSeconds: 120,
      isActive: true,
      sortOrder: bundle.data?.queues.length ?? 0,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setQueueName("");
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    toast.success(t("callCenterAdmin.queueSaved"));
  }

  async function addDid() {
    const result = await saveCallCenterDid({
      e164: didE164,
      label: didLabel,
      queueId: didQueueId || null,
      eventId: null,
      ivrMenuId: bundle.data?.menus[0]?.id ?? null,
      isActive: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDidLabel("");
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    toast.success(t("callCenterAdmin.didSaved"));
  }

  async function addMember() {
    if (!memberQueueId || !memberUserId) {
      toast.error(t("callCenterAdmin.memberRequired"));
      return;
    }
    const result = await saveCallCenterQueueMember({
      queueId: memberQueueId,
      userId: memberUserId.trim(),
      priority: 100,
      isActive: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    toast.success(t("callCenterAdmin.memberSaved"));
  }

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Headphones}
        kicker={t("callCenterAdmin.kicker")}
        title={t("callCenterAdmin.title")}
        subtitle={t("callCenterAdmin.subtitle")}
      />
      {!canEdit ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("callCenterAdmin.forbidden")}
        </p>
      ) : bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : bundle.isError ? (
        <p className="text-sm text-destructive">{t("callCenterAdmin.loadError")}</p>
      ) : (
        <>
          {!bundle.data?.settings.sipConfigured ? (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              {t("callCenterAdmin.configureSip")}
            </p>
          ) : null}
          {!bundle.data?.settings.livekitReady ? (
            <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
              {t("callCenterAdmin.configureLivekit")}
            </p>
          ) : null}

          <Tabs defaultValue="settings">
            <TabsList className="flex h-auto flex-wrap gap-1">
              <TabsTrigger value="settings">{t("callCenterAdmin.tabSettings")}</TabsTrigger>
              <TabsTrigger value="queues">{t("callCenterAdmin.tabQueues")}</TabsTrigger>
              <TabsTrigger value="dids">{t("callCenterAdmin.tabDids")}</TabsTrigger>
              <TabsTrigger value="ivr">{t("callCenterAdmin.tabIvr")}</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-4">
              <form
                className="max-w-2xl space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveSettings();
                }}
              >
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
                <div className="space-y-2">
                  <Label htmlFor="cc-tz">{t("callCenterAdmin.timezone")}</Label>
                  <Input id="cc-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.defaultQueue")}</Label>
                  <Select value={defaultQueueId || "none"} onValueChange={(v) => setDefaultQueueId(v === "none" ? "" : v)}>
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
                <div className="space-y-2">
                  <Label htmlFor="cc-sip">{t("callCenterAdmin.telnyxSipUri")}</Label>
                  <Input
                    id="cc-sip"
                    placeholder="sip:…@sip.telnyx.com"
                    value={telnyxSipUri}
                    onChange={(e) => setTelnyxSipUri(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-conn">{t("callCenterAdmin.telnyxConnectionId")}</Label>
                  <Input
                    id="cc-conn"
                    value={telnyxConnectionId}
                    onChange={(e) => setTelnyxConnectionId(e.target.value)}
                  />
                </div>
                <CallCenterSecretField
                  id="cc-key"
                  label={t("callCenterAdmin.telnyxApiKey")}
                  value={telnyxApiKey}
                  onChange={setTelnyxApiKey}
                  isSet={Boolean(bundle.data?.settings.telnyxKeySet)}
                  last4={bundle.data?.settings.telnyxKeyLast4 ?? ""}
                  revealField="telnyx_api_key"
                />
                <CallCenterSecretField
                  id="cc-wh"
                  label={t("callCenterAdmin.webhookSecret")}
                  value={webhookSharedSecret}
                  onChange={setWebhookSharedSecret}
                  isSet={Boolean(bundle.data?.settings.webhookSecretSet)}
                  last4={bundle.data?.settings.webhookSecretLast4 ?? ""}
                  revealField="webhook_shared_secret"
                />
                <CallCenterSecretField
                  id="cc-telnyx-wh"
                  label={t("callCenterAdmin.telnyxWebhookSecret")}
                  value={telnyxWebhookSecret}
                  onChange={setTelnyxWebhookSecret}
                  isSet={Boolean(bundle.data?.settings.telnyxWebhookSecretSet)}
                  last4={bundle.data?.settings.telnyxWebhookSecretLast4 ?? ""}
                  revealField="telnyx_webhook_secret"
                />
                <div className="space-y-2">
                  <Label htmlFor="cc-trunk">{t("callCenterAdmin.livekitSipTrunkId")}</Label>
                  <Input
                    id="cc-trunk"
                    value={livekitSipTrunkId}
                    onChange={(e) => setLivekitSipTrunkId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-dispatch">{t("callCenterAdmin.livekitSipDispatchRuleId")}</Label>
                  <Input
                    id="cc-dispatch"
                    value={livekitSipDispatchRuleId}
                    onChange={(e) => setLivekitSipDispatchRuleId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-notes">{t("callCenterAdmin.notes")}</Label>
                  <Textarea id="cc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="queues" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/50 bg-card p-4">
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.queueName")}</Label>
                  <Input value={queueName} onChange={(e) => setQueueName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.strategy")}</Label>
                  <Select
                    value={queueStrategy}
                    onValueChange={(v) => setQueueStrategy(v as CallCenterQueueStrategy)}
                  >
                    <SelectTrigger className="w-[10rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simultaneous">simultaneous</SelectItem>
                      <SelectItem value="round_robin">round_robin</SelectItem>
                      <SelectItem value="longest_idle">longest_idle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" onClick={() => void addQueue()}>
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenterAdmin.addQueue")}
                </Button>
              </div>
              <ul className="space-y-2">
                {(bundle.data?.queues ?? []).map((q) => (
                  <li
                    key={q.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>{q.name}</strong> · {q.strategy}
                      {!q.isActive ? " · inactive" : ""}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("callCenterAdmin.delete")}
                      onClick={async () => {
                        const result = await removeCallCenterQueue({ id: q.id });
                        if (!result.ok) toast.error(result.error);
                        else {
                          await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
                          toast.success(t("callCenterAdmin.deleted"));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
                <h3 className="text-sm font-semibold">{t("callCenterAdmin.members")}</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-2">
                    <Label>{t("callCenterAdmin.queue")}</Label>
                    <Select value={memberQueueId || "none"} onValueChange={(v) => setMemberQueueId(v === "none" ? "" : v)}>
                      <SelectTrigger className="w-[12rem]">
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
                  <div className="min-w-[16rem] flex-1 space-y-2">
                    <Label>{t("callCenterAdmin.userId")}</Label>
                    <Input
                      value={memberUserId}
                      onChange={(e) => setMemberUserId(e.target.value)}
                      placeholder={t("callCenterAdmin.userIdHint")}
                    />
                  </div>
                  <Button type="button" onClick={() => void addMember()}>
                    {t("callCenterAdmin.addMember")}
                  </Button>
                </div>
                <ul className="divide-y divide-border/60 text-sm">
                  {(bundle.data?.members ?? []).map((m) => {
                    const queue = bundle.data?.queues.find((q) => q.id === m.queueId);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                        <span>
                          {queue?.name ?? m.queueId.slice(0, 8)} · {m.userId.slice(0, 8)}… · p{m.priority}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            const result = await removeCallCenterQueueMember({ id: m.id });
                            if (!result.ok) toast.error(result.error);
                            else await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="dids" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/50 bg-card p-4">
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.e164")}</Label>
                  <Input value={didE164} onChange={(e) => setDidE164(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.label")}</Label>
                  <Input value={didLabel} onChange={(e) => setDidLabel(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("callCenterAdmin.queue")}</Label>
                  <Select value={didQueueId || "none"} onValueChange={(v) => setDidQueueId(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-[12rem]">
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
                <Button type="button" onClick={() => void addDid()}>
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenterAdmin.addDid")}
                </Button>
              </div>
              <ul className="space-y-2">
                {(bundle.data?.dids ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>{d.e164}</strong> {d.label ? `· ${d.label}` : ""}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        const result = await removeCallCenterDid({ id: d.id });
                        if (!result.ok) toast.error(result.error);
                        else await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="ivr" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{t("callCenterAdmin.ivrHint")}</p>
              {(bundle.data?.menus ?? []).map((menu) => (
                <div key={menu.id} className="rounded-2xl border border-border/50 bg-card p-4">
                  <p className="font-semibold">{menu.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{menu.greetingText}</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {(bundle.data?.options ?? [])
                      .filter((o) => o.menuId === menu.id)
                      .map((o) => (
                        <li key={o.id}>
                          <BadgeDigit digit={o.digit} /> {o.label || o.action}
                          {o.queueId ? ` → queue` : ""}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function BadgeDigit({ digit }: { digit: string }) {
  return (
    <span className="me-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-xs font-semibold">
      {digit}
    </span>
  );
}

export default AdminCallCenterPage;

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterConfigBundle,
  removeCallCenterIvrMenu,
  removeCallCenterIvrOption,
  saveCallCenterIvrMenu,
  saveCallCenterIvrOption,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterIvrAction } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterIvrPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");

  const [menuName, setMenuName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [fallbackQueueId, setFallbackQueueId] = useState("");
  const [optionMenuId, setOptionMenuId] = useState("");
  const [digit, setDigit] = useState("1");
  const [optionLabel, setOptionLabel] = useState("");
  const [action, setAction] = useState<CallCenterIvrAction>("queue");
  const [optionQueueId, setOptionQueueId] = useState("");
  const [optionEventId, setOptionEventId] = useState("");

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  async function addMenu() {
    const result = await saveCallCenterIvrMenu({
      name: menuName,
      greetingText: greeting,
      timeoutSeconds: 10,
      maxRetries: 2,
      fallbackQueueId: fallbackQueueId || null,
      isActive: true,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.ivrMenuSaved"));
    setMenuName("");
    setGreeting("");
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  async function addOption() {
    if (!optionMenuId) {
      toast.error(t("callCenter.pickMenu"));
      return;
    }
    const result = await saveCallCenterIvrOption({
      menuId: optionMenuId,
      digit,
      label: optionLabel,
      action,
      queueId: optionQueueId || null,
      eventId: optionEventId || null,
      transferSipUri: "",
      sortOrder: Number(digit) || 0,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("callCenter.ivrOptionSaved"));
    setOptionLabel("");
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.ivrTitle" subtitleKey="callCenter.ivrSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.ivrTitle" subtitleKey="callCenter.ivrSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-4">
          {canEdit ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
                <h2 className="text-sm font-semibold">{t("callCenter.addIvrMenu")}</h2>
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.queueName")}</Label>
                  <Input value={menuName} onChange={(e) => setMenuName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.greeting")}</Label>
                  <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.fallbackQueue")}</Label>
                  <Select
                    value={fallbackQueueId || "none"}
                    onValueChange={(v) => setFallbackQueueId(v === "none" ? "" : v)}
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
                <Button type="button" onClick={() => void addMenu()}>
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenter.addIvrMenu")}
                </Button>
              </section>

              <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
                <h2 className="text-sm font-semibold">{t("callCenter.addIvrOption")}</h2>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.ivrMenu")}</Label>
                  <Select
                    value={optionMenuId || "none"}
                    onValueChange={(v) => setOptionMenuId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("callCenterAdmin.none")}</SelectItem>
                      {(bundle.data?.menus ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="space-y-1.5">
                    <Label>{t("callCenter.digit")}</Label>
                    <Input
                      value={digit}
                      onChange={(e) => setDigit(e.target.value.slice(0, 1))}
                      className="w-16"
                    />
                  </div>
                  <div className="min-w-[10rem] flex-1 space-y-1.5">
                    <Label>{t("callCenterAdmin.label")}</Label>
                    <Input value={optionLabel} onChange={(e) => setOptionLabel(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.ivrAction")}</Label>
                  <Select value={action} onValueChange={(v) => setAction(v as CallCenterIvrAction)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["queue", "voicemail", "hangup", "transfer_sip", "repeat"] as const).map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.queue")}</Label>
                  <Select
                    value={optionQueueId || "none"}
                    onValueChange={(v) => setOptionQueueId(v === "none" ? "" : v)}
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
                  <Label>{t("callCenter.eventId")}</Label>
                  <Input
                    value={optionEventId}
                    onChange={(e) => setOptionEventId(e.target.value)}
                    placeholder="UUID (optional)"
                  />
                </div>
                <Button type="button" onClick={() => void addOption()}>
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenter.addIvrOption")}
                </Button>
              </section>
            </div>
          ) : null}

          {(bundle.data?.menus ?? []).map((menu) => (
            <div key={menu.id} className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{menu.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{menu.greetingText}</p>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      const result = await removeCallCenterIvrMenu({ id: menu.id });
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success(t("callCenterAdmin.deleted"));
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {(bundle.data?.options ?? [])
                  .filter((o) => o.menuId === menu.id)
                  .map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-1">
                      <span>
                        <span className="me-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-xs font-semibold">
                          {o.digit}
                        </span>
                        {o.label || o.action}
                        {o.queueId ? ` → queue` : ""}
                        {o.eventId ? ` · event` : ""}
                      </span>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            const result = await removeCallCenterIvrOption({ id: o.id });
                            if (!result.ok) toast.error(result.error);
                            else {
                              await queryClient.invalidateQueries({
                                queryKey: ["call-center", "config"],
                              });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterIvrPage;

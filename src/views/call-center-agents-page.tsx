"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCallCenterSoftphoneOptional } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/use-auth";
import { provisionUser } from "@/lib/admin.functions";
import {
  loadCallCenterAgentPerformance,
  saveCallCenterAgentExtension,
  saveCallCenterAgentProfile,
  setCallCenterAgentStatus,
} from "@/lib/call-center/call-center.functions";
import type {
  CallCenterAgentPerformanceRow,
  CallCenterAgentStatusValue,
  CallCenterQueue,
} from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

type AddAgentState = {
  displayName: string;
  email: string;
  password: string;
  employeeCode: string;
  extension: string;
};

const EMPTY_ADD_AGENT: AddAgentState = {
  displayName: "",
  email: "",
  password: "",
  employeeCode: "",
  extension: "",
};

type EditState = {
  userId: string;
  extension: string;
  displayNameOverride: string;
  maxConcurrentCalls: string;
  canWhisper: boolean;
  canBarge: boolean;
  isActive: boolean;
  skills: string;
  queueIds: string[];
  status: CallCenterAgentStatusValue;
  autoAnswer: boolean;
  awayReason: string;
};

function CallCenterAgentsPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const softphone = useCallCenterSoftphoneOptional();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view") && maxLevel >= 95;
  const canProvision = canEdit && canUserDo(roleNames, "admin.provision_users");
  const [extension, setExtension] = useState("");
  const [pending, setPending] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [addAgent, setAddAgent] = useState<AddAgentState | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);

  const perf = useQuery({
    queryKey: ["call-center", "agent-performance"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterAgentPerformance({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 20_000,
  });

  const queues: CallCenterQueue[] = perf.data?.queues ?? [];
  const queueNameById = useMemo(
    () => new Map(queues.map((q) => [q.id, q.name])),
    [queues],
  );

  function openEdit(row: CallCenterAgentPerformanceRow) {
    setEdit({
      userId: row.userId,
      extension: row.extension || "",
      displayNameOverride: row.displayNameOverride || "",
      maxConcurrentCalls: String(row.maxConcurrentCalls || 1),
      canWhisper: row.canWhisper,
      canBarge: row.canBarge,
      isActive: row.isActive,
      skills: row.skills.join(", "),
      queueIds: [...row.queueIds],
      status: row.status,
      autoAnswer: row.autoAnswer,
      awayReason: row.awayReason || "",
    });
  }

  async function saveEdit() {
    if (!edit) return;
    setSavingEdit(true);
    try {
      const skills = edit.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await saveCallCenterAgentProfile({
        userId: edit.userId,
        extension: edit.extension,
        displayNameOverride: edit.displayNameOverride,
        maxConcurrentCalls: Math.max(1, Math.min(10, Number(edit.maxConcurrentCalls) || 1)),
        canWhisper: edit.canWhisper,
        canBarge: edit.canBarge,
        isActive: edit.isActive,
        skills,
        queueIds: edit.queueIds,
        status: edit.status,
        autoAnswer: edit.autoAnswer,
        awayReason: edit.awayReason,
      });
      if (!result.ok) throw new Error(result.error);
      toast.success(t("callCenter.agentSaved"));
      setEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["call-center", "agent-performance"] });
      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitAddAgent() {
    if (!addAgent) return;
    const displayName = addAgent.displayName.trim();
    const email = addAgent.email.trim();
    if (!displayName || !email || addAgent.password.length < 8) {
      toast.error(t("callCenter.addAgentPasswordHint"));
      return;
    }
    setSavingAdd(true);
    try {
      const created = await provisionUser({
        email,
        password: addAgent.password,
        display_name: displayName,
        employee_code: addAgent.employeeCode.trim() || undefined,
        role: "call_center_agent",
        location_ids: [],
      });
      const result = await saveCallCenterAgentProfile({
        userId: created.user_id,
        extension: addAgent.extension,
        displayNameOverride: displayName,
        maxConcurrentCalls: 1,
        canWhisper: false,
        canBarge: false,
        isActive: true,
        skills: [],
        queueIds: [],
        status: "offline",
      });
      if (!result.ok) throw new Error(result.error);
      toast.success(t("callCenter.addAgentDone"));
      setAddAgent(null);
      await queryClient.invalidateQueries({ queryKey: ["call-center", "agent-performance"] });
      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setSavingAdd(false);
    }
  }

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.agentsTitle" subtitleKey="callCenter.agentsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const myRow = (perf.data?.rows ?? []).find((r) => r.userId === user?.id);

  return (
    <CallCenterShell titleKey="callCenter.agentsTitle" subtitleKey="callCenter.agentsSubtitle">
      <section className="mb-4 rounded-2xl border border-border/50 bg-card/70 p-4">
        <p className="text-sm font-semibold">{t("callCenter.myExtension")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("callCenter.extensionHint")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>{t("callCenter.extension")}</Label>
            <Input
              className="mt-1 w-32 font-mono"
              value={extension || myRow?.extension || ""}
              onChange={(e) => setExtension(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="101"
            />
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              void (async () => {
                setPending(true);
                try {
                  const result = await saveCallCenterAgentExtension({
                    extension: extension || myRow?.extension || "",
                  });
                  if (!result.ok) throw new Error(result.error);
                  toast.success(t("callCenter.extensionSaved"));
                  await queryClient.invalidateQueries({
                    queryKey: ["call-center", "agent-performance"],
                  });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            {t("callCenter.saveExtension")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/call-center">{t("callCenter.openDialer")}</Link>
          </Button>
          {softphone?.canUse ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                void (async () => {
                  setPending(true);
                  try {
                    const result = await setCallCenterAgentStatus({ status: "available" });
                    if (!result.ok) throw new Error(result.error);
                    toast.success(t("callCenter.statusSetAvailable"));
                    await queryClient.invalidateQueries({
                      queryKey: ["call-center", "agent-performance"],
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : t("callCenter.loadError"),
                    );
                  } finally {
                    setPending(false);
                  }
                })();
              }}
            >
              {t("callCenter.setAvailable")}
            </Button>
          ) : null}
        </div>
      </section>

      {canProvision ? (
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/70 p-4">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("callCenter.addAgentExistingNote")}
          </p>
          <Button type="button" onClick={() => setAddAgent({ ...EMPTY_ADD_AGENT })}>
            {t("callCenter.addAgent")}
          </Button>
        </section>
      ) : null}

      {perf.isLoading ? (
        <div className="flex justify-center py-12">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("callCenter.agentCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.extension")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.statusCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.handledCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.answeredCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.missedCol")}</th>
                <th className="px-3 py-2 font-medium">{t("callCenter.ahtCol")}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(perf.data?.rows ?? []).map((row) => (
                <tr key={row.userId} className="border-t border-border/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.displayName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {row.userId.slice(0, 8)}…
                      {!row.isActive ? ` · ${t("callCenter.inactive")}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono">{row.extension || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{t(`callCenter.status.${row.status}`)}</Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.callsHandled}</td>
                  <td className="px-3 py-2 tabular-nums">{row.answered}</td>
                  <td className="px-3 py-2 tabular-nums">{row.missed}</td>
                  <td className="px-3 py-2 tabular-nums">{row.avgHandleSeconds}s</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {canEdit ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                          {t("callCenter.editAgent")}
                        </Button>
                      ) : null}
                      {row.extension && softphone?.canUse && row.userId !== user?.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => softphone.onDial(row.extension)}
                        >
                          {t("callCenter.dialExt")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(addAgent)} onOpenChange={(open) => !open && setAddAgent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("callCenter.addAgentTitle")}</DialogTitle>
            <DialogDescription>{t("callCenter.addAgentHint")}</DialogDescription>
          </DialogHeader>
          {addAgent ? (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>{t("callCenter.addAgentName")}</Label>
                <Input
                  value={addAgent.displayName}
                  onChange={(e) =>
                    setAddAgent((prev) => (prev ? { ...prev, displayName: e.target.value } : prev))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.addAgentEmail")}</Label>
                <Input
                  type="email"
                  autoComplete="off"
                  value={addAgent.email}
                  onChange={(e) =>
                    setAddAgent((prev) => (prev ? { ...prev, email: e.target.value } : prev))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.addAgentPassword")}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={addAgent.password}
                  onChange={(e) =>
                    setAddAgent((prev) => (prev ? { ...prev, password: e.target.value } : prev))
                  }
                />
                <p className="text-xs text-muted-foreground">{t("callCenter.addAgentPasswordHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("callCenter.addAgentEmployeeCode")}</Label>
                  <Input
                    value={addAgent.employeeCode}
                    onChange={(e) =>
                      setAddAgent((prev) => (prev ? { ...prev, employeeCode: e.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.addAgentExtension")}</Label>
                  <Input
                    className="font-mono"
                    value={addAgent.extension}
                    onChange={(e) =>
                      setAddAgent((prev) =>
                        prev
                          ? { ...prev, extension: e.target.value.replace(/\D/g, "").slice(0, 6) }
                          : prev,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddAgent(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="button" disabled={savingAdd} onClick={() => void submitAddAgent()}>
              {savingAdd ? t("callCenter.addAgentSaving") : t("callCenter.addAgentSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("callCenter.editAgentTitle")}</DialogTitle>
            <DialogDescription>{t("callCenter.editAgentHint")}</DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>{t("callCenter.displayNameOverride")}</Label>
                <Input
                  value={edit.displayNameOverride}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev ? { ...prev, displayNameOverride: e.target.value } : prev,
                    )
                  }
                  placeholder={t("callCenter.displayNamePlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("callCenter.extension")}</Label>
                  <Input
                    className="font-mono"
                    value={edit.extension}
                    onChange={(e) =>
                      setEdit((prev) =>
                        prev
                          ? { ...prev, extension: e.target.value.replace(/\D/g, "").slice(0, 6) }
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.maxConcurrent")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={edit.maxConcurrentCalls}
                    onChange={(e) =>
                      setEdit((prev) =>
                        prev ? { ...prev, maxConcurrentCalls: e.target.value } : prev,
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.statusCol")}</Label>
                <Select
                  value={edit.status}
                  onValueChange={(v) =>
                    setEdit((prev) =>
                      prev ? { ...prev, status: v as CallCenterAgentStatusValue } : prev,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["available", "busy", "away", "acw", "offline"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`callCenter.status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("callCenter.skills")}</Label>
                <Input
                  value={edit.skills}
                  onChange={(e) =>
                    setEdit((prev) => (prev ? { ...prev, skills: e.target.value } : prev))
                  }
                  placeholder="sales, arabic, vip"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("callCenter.autoAnswer")}</Label>
                  <p className="text-xs text-muted-foreground">{t("callCenter.autoAnswerHint")}</p>
                </div>
                <Switch
                  checked={edit.autoAnswer}
                  onCheckedChange={(v) =>
                    setEdit((prev) => (prev ? { ...prev, autoAnswer: v } : prev))
                  }
                />
              </div>
              {edit.status === "away" ? (
                <div className="space-y-1.5">
                  <Label>{t("callCenter.awayReason")}</Label>
                  <Input
                    value={edit.awayReason}
                    onChange={(e) =>
                      setEdit((prev) => (prev ? { ...prev, awayReason: e.target.value } : prev))
                    }
                    placeholder="On Break / In Training"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>{t("callCenter.defaultQueues")}</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/50 p-2">
                  {queues.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("callCenter.queuesEmpty")}</p>
                  ) : (
                    queues.map((q) => {
                      const checked = edit.queueIds.includes(q.id);
                      return (
                        <label key={q.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setEdit((prev) => {
                                if (!prev) return prev;
                                const next = new Set(prev.queueIds);
                                if (v) next.add(q.id);
                                else next.delete(q.id);
                                return { ...prev, queueIds: [...next] };
                              });
                            }}
                          />
                          <span>{queueNameById.get(q.id) || q.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("callCenter.canWhisper")}</Label>
                  <p className="text-xs text-muted-foreground">{t("callCenter.canWhisperHint")}</p>
                </div>
                <Switch
                  checked={edit.canWhisper}
                  onCheckedChange={(v) =>
                    setEdit((prev) => (prev ? { ...prev, canWhisper: v } : prev))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("callCenter.canBarge")}</Label>
                  <p className="text-xs text-muted-foreground">{t("callCenter.canBargeHint")}</p>
                </div>
                <Switch
                  checked={edit.canBarge}
                  onCheckedChange={(v) =>
                    setEdit((prev) => (prev ? { ...prev, canBarge: v } : prev))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("callCenter.agentActive")}</Label>
                  <p className="text-xs text-muted-foreground">{t("callCenter.agentActiveHint")}</p>
                </div>
                <Switch
                  checked={edit.isActive}
                  onCheckedChange={(v) =>
                    setEdit((prev) => (prev ? { ...prev, isActive: v } : prev))
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEdit(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="button" disabled={savingEdit} onClick={() => void saveEdit()}>
              {savingEdit ? t("callCenterAdmin.saving") : t("callCenterAdmin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CallCenterShell>
  );
}

export default CallCenterAgentsPage;

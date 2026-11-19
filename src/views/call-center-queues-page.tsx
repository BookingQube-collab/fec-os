"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterConfigBundle,
  removeCallCenterQueue,
  removeCallCenterQueueMember,
  saveCallCenterQueue,
  saveCallCenterQueueMember,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterQueue, CallCenterQueueStrategy } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

const STRATEGIES: CallCenterQueueStrategy[] = [
  "sequential",
  "simultaneous",
  "round_robin",
  "longest_idle",
];

function QueueEditRow({
  queue,
  canEdit,
  onSaved,
  onDeleted,
}: {
  queue: CallCenterQueue;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(queue.name);
  const [strategy, setStrategy] = useState<CallCenterQueueStrategy>(queue.strategy);
  const [offerRingSeconds, setOfferRingSeconds] = useState(String(queue.offerRingSeconds ?? 15));
  const [maxWaitSeconds, setMaxWaitSeconds] = useState(String(queue.maxWaitSeconds));
  const [wrapUpSeconds, setWrapUpSeconds] = useState(String(queue.wrapUpSeconds));
  const [saving, setSaving] = useState(false);

  return (
    <li className="space-y-3 rounded-xl border border-border/50 bg-card px-3 py-3 text-sm shadow-elevated-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {canEdit ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm font-medium" />
          ) : (
            <p className="font-medium">{queue.name}</p>
          )}
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">
              {queue.strategy} · ring {queue.offerRingSeconds}s · wrap {queue.wrapUpSeconds}s · wait{" "}
              {queue.maxWaitSeconds}s
              {!queue.isActive ? " · inactive" : ""}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const result = await saveCallCenterQueue({
                  id: queue.id,
                  name: name.trim() || queue.name,
                  strategy,
                  wrapUpSeconds: Number(wrapUpSeconds) || 30,
                  maxWaitSeconds: Number(maxWaitSeconds) || 120,
                  offerRingSeconds: Number(offerRingSeconds) || 0,
                  requiredSkills: queue.requiredSkills,
                  serviceLevelSeconds: queue.serviceLevelSeconds,
                  isActive: queue.isActive,
                  sortOrder: queue.sortOrder,
                });
                setSaving(false);
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success(t("callCenterAdmin.queueSaved"));
                  await onSaved();
                }
              }}
            >
              <Save className="me-1 h-3.5 w-3.5" />
              {t("callCenter.saveQueue")}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={async () => {
                const result = await removeCallCenterQueue({ id: queue.id });
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success(t("callCenterAdmin.deleted"));
                  await onDeleted();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>{t("callCenterAdmin.strategy")}</Label>
            <Select
              value={strategy}
              onValueChange={(v) => setStrategy(v as CallCenterQueueStrategy)}
            >
              <SelectTrigger className="w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("callCenter.offerRingSeconds")}</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={offerRingSeconds}
              onChange={(e) => setOfferRingSeconds(e.target.value)}
              className="w-[7rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("callCenter.maxWaitSeconds")}</Label>
            <Input
              type="number"
              min={0}
              max={3600}
              value={maxWaitSeconds}
              onChange={(e) => setMaxWaitSeconds(e.target.value)}
              className="w-[7rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("callCenter.wrapUpSeconds")}</Label>
            <Input
              type="number"
              min={0}
              max={600}
              value={wrapUpSeconds}
              onChange={(e) => setWrapUpSeconds(e.target.value)}
              className="w-[7rem]"
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CallCenterQueuesPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");
  const [queueName, setQueueName] = useState("Support");
  const [strategy, setStrategy] = useState<CallCenterQueueStrategy>("sequential");
  const [offerRingSeconds, setOfferRingSeconds] = useState("15");
  const [maxWaitSeconds, setMaxWaitSeconds] = useState("120");
  const [wrapUpSeconds, setWrapUpSeconds] = useState("30");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [serviceLevelSeconds, setServiceLevelSeconds] = useState("20");
  const [memberQueueId, setMemberQueueId] = useState("");
  const [memberUserId, setMemberUserId] = useState(user?.id ?? "");
  const [memberSkills, setMemberSkills] = useState("");
  const [memberPriority, setMemberPriority] = useState("100");

  const bundle = useQuery({
    queryKey: ["call-center", "config"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterConfigBundle({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
  };

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.queuesTitle" subtitleKey="callCenter.queuesSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  return (
    <CallCenterShell titleKey="callCenter.queuesTitle" subtitleKey="callCenter.queuesSubtitle">
      {bundle.isLoading ? (
        <div className="flex justify-center py-16">
          <FecLoader density="page" />
        </div>
      ) : (
        <div className="space-y-5">
          {canEdit ? (
            <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{t("callCenter.queuesAddHeading")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.queuesAddHint")}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.queueName")}</Label>
                  <Input value={queueName} onChange={(e) => setQueueName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.strategy")}</Label>
                  <Select
                    value={strategy}
                    onValueChange={(v) => setStrategy(v as CallCenterQueueStrategy)}
                  >
                    <SelectTrigger className="w-[12rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.offerRingSeconds")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={offerRingSeconds}
                    onChange={(e) => setOfferRingSeconds(e.target.value)}
                    className="w-[7rem]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.maxWaitSeconds")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={3600}
                    value={maxWaitSeconds}
                    onChange={(e) => setMaxWaitSeconds(e.target.value)}
                    className="w-[7rem]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.wrapUpSeconds")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={600}
                    value={wrapUpSeconds}
                    onChange={(e) => setWrapUpSeconds(e.target.value)}
                    className="w-[7rem]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.queueRequiredSkills")}</Label>
                  <Input
                    value={requiredSkills}
                    onChange={(e) => setRequiredSkills(e.target.value)}
                    placeholder="arabic,sales"
                    className="w-[12rem]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("callCenter.queueServiceLevel")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={serviceLevelSeconds}
                    onChange={(e) => setServiceLevelSeconds(e.target.value)}
                    className="w-[7rem]"
                  />
                </div>
                <Button
                  type="button"
                  onClick={async () => {
                    const result = await saveCallCenterQueue({
                      name: queueName,
                      strategy,
                      wrapUpSeconds: Number(wrapUpSeconds) || 30,
                      maxWaitSeconds: Number(maxWaitSeconds) || 120,
                      offerRingSeconds: Number(offerRingSeconds) || 15,
                      requiredSkills: requiredSkills
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      serviceLevelSeconds: Number(serviceLevelSeconds) || 20,
                      isActive: true,
                      sortOrder: (bundle.data?.queues.length ?? 0) + 1,
                    });
                    if (!result.ok) toast.error(result.error);
                    else {
                      toast.success(t("callCenterAdmin.queueSaved"));
                      setRequiredSkills("");
                      await refresh();
                    }
                  }}
                >
                  <Plus className="me-1 h-4 w-4" />
                  {t("callCenterAdmin.addQueue")}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{t("callCenter.queuesListHeading")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.queuesListHint")}</p>
            </div>
            {(bundle.data?.queues ?? []).length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("callCenter.queuesEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {(bundle.data?.queues ?? []).map((q) => (
                  <QueueEditRow
                    key={`${q.id}-${q.strategy}-${q.offerRingSeconds}-${q.maxWaitSeconds}-${q.wrapUpSeconds}-${q.name}`}
                    queue={q}
                    canEdit={canEdit}
                    onSaved={refresh}
                    onDeleted={refresh}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{t("callCenterAdmin.members")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("callCenter.queuesMembersHint")}</p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>{t("callCenterAdmin.queue")}</Label>
                  <Select
                    value={memberQueueId || "none"}
                    onValueChange={(v) => setMemberQueueId(v === "none" ? "" : v)}
                  >
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
                <div className="min-w-[16rem] flex-1 space-y-1.5">
                  <Label>{t("callCenterAdmin.userId")}</Label>
                  <Input value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label>{t("callCenter.memberPriority")}</Label>
                  <Input
                    value={memberPriority}
                    onChange={(e) => setMemberPriority(e.target.value)}
                  />
                </div>
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  <Label>{t("callCenter.skills")}</Label>
                  <Input
                    value={memberSkills}
                    onChange={(e) => setMemberSkills(e.target.value)}
                    placeholder="arabic, events"
                  />
                </div>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!memberQueueId || !memberUserId) {
                      toast.error(t("callCenterAdmin.memberRequired"));
                      return;
                    }
                    const skills = memberSkills
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const result = await saveCallCenterQueueMember({
                      queueId: memberQueueId,
                      userId: memberUserId,
                      priority: Number(memberPriority) || 100,
                      isActive: true,
                      skills,
                    });
                    if (!result.ok) toast.error(result.error);
                    else {
                      toast.success(t("callCenterAdmin.memberSaved"));
                      setMemberSkills("");
                      await refresh();
                    }
                  }}
                >
                  {t("callCenterAdmin.addMember")}
                </Button>
              </div>
            ) : null}
            <ul className="divide-y divide-border/60 text-sm">
              {(bundle.data?.members ?? []).map((m) => {
                const queue = bundle.data?.queues.find((q) => q.id === m.queueId);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {queue?.name ?? m.queueId.slice(0, 8)} · {m.userId.slice(0, 8)}… · p
                      {m.priority}
                      {m.skills?.length ? ` · skills: ${m.skills.join(", ")}` : ""}
                    </span>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          const result = await removeCallCenterQueueMember({ id: m.id });
                          if (!result.ok) toast.error(result.error);
                          else await refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </CallCenterShell>
  );
}

export default CallCenterQueuesPage;

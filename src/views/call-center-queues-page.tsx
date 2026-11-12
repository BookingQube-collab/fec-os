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
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterConfigBundle,
  removeCallCenterQueue,
  removeCallCenterQueueMember,
  saveCallCenterQueue,
  saveCallCenterQueueMember,
} from "@/lib/call-center/call-center.functions";
import type { CallCenterQueueStrategy } from "@/lib/call-center/types";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterQueuesPage() {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const roleNames = roles.map((r) => r.role);
  const canUse = canUserDo(roleNames, "call_center.view");
  const canEdit = canUserDo(roleNames, "admin.view");
  const [queueName, setQueueName] = useState("Support");
  const [strategy, setStrategy] = useState<CallCenterQueueStrategy>("simultaneous");
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
        <div className="space-y-4">
          {canEdit ? (
            <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/50 bg-card p-4">
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
                    <SelectItem value="simultaneous">simultaneous</SelectItem>
                    <SelectItem value="round_robin">round_robin</SelectItem>
                    <SelectItem value="longest_idle">longest_idle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={async () => {
                  const result = await saveCallCenterQueue({
                    name: queueName,
                    strategy,
                    wrapUpSeconds: 30,
                    maxWaitSeconds: 120,
                    isActive: true,
                    sortOrder: (bundle.data?.queues.length ?? 0) + 1,
                  });
                  if (!result.ok) toast.error(result.error);
                  else {
                    toast.success(t("callCenterAdmin.queueSaved"));
                    await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
                  }
                }}
              >
                <Plus className="me-1 h-4 w-4" />
                {t("callCenterAdmin.addQueue")}
              </Button>
            </section>
          ) : null}

          <ul className="space-y-2">
            {(bundle.data?.queues ?? []).map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{q.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.strategy} · wrap {q.wrapUpSeconds}s · wait {q.maxWaitSeconds}s
                    {!q.isActive ? " · inactive" : ""}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      const result = await removeCallCenterQueue({ id: q.id });
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
              </li>
            ))}
          </ul>

          <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("callCenterAdmin.members")}</h2>
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
                      await queryClient.invalidateQueries({ queryKey: ["call-center", "config"] });
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
                          else
                            await queryClient.invalidateQueries({
                              queryKey: ["call-center", "config"],
                            });
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

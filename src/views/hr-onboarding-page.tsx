"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { checklistProgress } from "@/lib/hr-advanced";
import {
  listChecklistTemplates,
  listStaffChecklists,
  startStaffChecklist,
  updateChecklistItem,
} from "@/lib/hr-checklists.functions";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrOnboardingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [filterKind, setFilterKind] = useState<"onboarding" | "offboarding" | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"open" | "completed" | "all">("open");

  const templates = useQuery({
    queryKey: queryKeys.people.hrChecklists({ view: "templates" }),
    queryFn: () => listChecklistTemplates(),
    staleTime: STALE.people,
  });
  const staff = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });
  const lists = useQuery({
    queryKey: queryKeys.people.hrChecklists({ kind: filterKind, status: filterStatus }),
    queryFn: () =>
      listStaffChecklists({
        kind: filterKind === "all" ? undefined : filterKind,
        status: filterStatus === "all" ? undefined : filterStatus,
      }),
    staleTime: STALE.people,
  });

  const start = useMutation({
    mutationFn: startStaffChecklist,
    onSuccess: () => {
      toast.success(t("hr.onboarding.started"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrChecklists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleItem = useMutation({
    mutationFn: updateChecklistItem,
    onSuccess: (res) => {
      if (res.checklistCompleted) toast.success(t("hr.onboarding.completed"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrChecklists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.onboarding.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader
          icon={ClipboardList}
          kicker={t("hr.onboarding.kicker")}
          title={t("hr.onboarding.title")}
          subtitle={t("hr.onboarding.subtitle")}
        />

        <NeumorphicCard className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>{t("hr.onboarding.staff")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">{t("hr.onboarding.pickStaff")}</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("hr.onboarding.template")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">{t("hr.onboarding.pickTemplate")}</option>
              {(templates.data ?? []).map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {t(`hr.onboarding.kinds.${tpl.kind}`)} — {tpl.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!staffId || !templateId || start.isPending}
              onClick={() => start.mutate({ staffId, templateId })}
            >
              {t("hr.onboarding.start")}
            </Button>
          </div>
          <div>
            <Label>{t("hr.onboarding.filter")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
            >
              <option value="all">{t("hr.onboarding.allKinds")}</option>
              <option value="onboarding">{t("hr.onboarding.kinds.onboarding")}</option>
              <option value="offboarding">{t("hr.onboarding.kinds.offboarding")}</option>
            </select>
          </div>
          <div>
            <Label>{t("hr.onboarding.statusFilter")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            >
              <option value="open">{t("hr.onboarding.status.open")}</option>
              <option value="completed">{t("hr.onboarding.status.completed")}</option>
              <option value="all">{t("hr.onboarding.allStatuses")}</option>
            </select>
          </div>
        </NeumorphicCard>

        <div className="space-y-3">
          {(lists.data ?? []).length === 0 ? (
            <NeumorphicCard className="p-5">
              <p className="text-sm text-muted-foreground">{t("hr.onboarding.empty")}</p>
            </NeumorphicCard>
          ) : (
            (lists.data ?? []).map((row) => {
              const progress = checklistProgress(row.items);
              return (
                <NeumorphicCard key={row.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {row.staffName} · {t(`hr.onboarding.kinds.${row.kind}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.employeeCode ?? "—"} · {t("hr.onboarding.progress", { done: progress.done, total: progress.total, percent: progress.percent })}
                      </p>
                    </div>
                    <Badge variant={row.status === "completed" ? "success" : "muted"}>
                      {t(`hr.onboarding.status.${row.status}`)}
                    </Badge>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <ul className="space-y-2">
                    {row.items.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                        <span>{item.title}</span>
                        <div className="flex gap-2">
                          <Badge variant={item.status === "done" ? "success" : item.status === "skipped" ? "outline" : "muted"}>
                            {t(`hr.onboarding.itemStatus.${item.status}`)}
                          </Badge>
                          {row.status === "open" && item.status === "pending" ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => toggleItem.mutate({ itemId: item.id, status: "done" })}>
                                {t("hr.onboarding.markDone")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleItem.mutate({ itemId: item.id, status: "skipped" })}>
                                {t("hr.onboarding.markSkipped")}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </NeumorphicCard>
              );
            })
          )}
        </div>
      </div>
    </CapabilityGate>
  );
}

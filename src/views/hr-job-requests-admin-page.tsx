"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserRoles } from "@/hooks/use-auth";
import { canUserDo } from "@/lib/rbac";
import {
  actOnJobRequestStep,
  grantQuotaOverride,
  listJobRequestApprovals,
  listJobRequests,
  listVacancies,
  publishVacancyFromJobRequest,
  updateVacancyStatus,
} from "@/lib/hr-recruitment.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrJobRequestsAdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canOverride = canUserDo(roles, "quota.override_approve");
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [recruiterUserId, setRecruiterUserId] = useState("");
  const [vacancyReason, setVacancyReason] = useState("");

  const queue = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ admin: true }),
    queryFn: () => listJobRequests({ adminQueue: true }),
    staleTime: STALE.people,
  });

  const vacancies = useQuery({
    queryKey: queryKeys.people.hrVacancies({}),
    queryFn: () => listVacancies({}),
    staleTime: STALE.people,
  });

  const steps = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ approvals: selectedId }),
    queryFn: () => listJobRequestApprovals({ jobRequestId: selectedId! }),
    enabled: Boolean(selectedId),
    staleTime: STALE.people,
  });

  const selected = (queue.data ?? []).find((r) => r.id === selectedId) ?? null;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrJobRequests() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrVacancies() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrQuota() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const act = useMutation({
    mutationFn: (action: "approved" | "rejected" | "returned") =>
      actOnJobRequestStep({
        jobRequestId: selectedId!,
        action,
        comments: comments || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.acted"));
      setComments("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const override = useMutation({
    mutationFn: () =>
      grantQuotaOverride({ jobRequestId: selectedId!, reason: overrideReason }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.overrideGranted"));
      setOverrideReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: () =>
      publishVacancyFromJobRequest({
        jobRequestId: selectedId!,
        recruiterUserId: recruiterUserId || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.published"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vacStatus = useMutation({
    mutationFn: (input: { vacancyId: string; status: "on_hold" | "closed" | "cancelled" | "open" }) =>
      updateVacancyStatus({
        vacancyId: input.vacancyId,
        status: input.status,
        reason: vacancyReason || null,
        recruiterUserId: recruiterUserId || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.vacancyUpdated"));
      setVacancyReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="recruitment.manage"
      fallback={
        <FecPageHeader
          icon={ShieldCheck}
          kicker={t("hr.jobsAdmin.kicker")}
          title={t("hr.jobsAdmin.title")}
          subtitle={t("hr.jobsAdmin.noAccess")}
        />
      }
    >
      <HrShell>
        <FecPageHeader
          icon={ShieldCheck}
          kicker={t("hr.jobsAdmin.kicker")}
          title={t("hr.jobsAdmin.title")}
          subtitle={t("hr.jobsAdmin.subtitle")}
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link href="/people/hr/quota">{t("hr.jobsAdmin.linkQuota")}</Link>
            </Button>
          }
        />

        <HrSection title={t("hr.jobsAdmin.queue")}>
          {!queue.data?.length ? (
            <HrEmptyState message={t("hr.jobsAdmin.empty")} />
          ) : (
            <ul className="space-y-2">
              {queue.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-start text-sm hover:bg-muted/40"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.jobTitle}</span>
                      <Badge variant="secondary">{r.status}</Badge>
                      {r.currentStepRole ? (
                        <Badge variant="outline">{t(`hr.jobs.steps.${r.currentStepRole}`, r.currentStepRole)}</Badge>
                      ) : null}
                      {r.exceedsQuota ? (
                        <Badge className="bg-amber-100 text-amber-900">
                          {t("hr.jobs.exceedsQuota")} · {r.quotaOverrideStatus}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[r.locationName, r.departmentName, `${r.vacanciesCount} vac`, r.priority]
                        .filter(Boolean)
                        .join(" · ")}
                      {canViewSalary && r.salaryBudgetQar != null
                        ? ` · QAR ${r.salaryBudgetQar.toLocaleString()}`
                        : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </HrSection>

        {selected ? (
          <HrSection title={t("hr.jobsAdmin.review")}>
            <HrPanel className="space-y-4 p-4">
              <div className="text-sm">
                <p className="font-medium">{selected.jobTitle}</p>
                <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                  {selected.jobDescription || t("hr.jobsAdmin.noJd")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {selected.justification}
                </p>
              </div>

              <ol className="space-y-2 text-sm">
                {(steps.data ?? []).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`hr.jobs.steps.${s.stepRole}`, s.stepRole)}</span>
                    <Badge variant="secondary">{s.status}</Badge>
                  </li>
                ))}
              </ol>

              <div>
                <Label>{t("hr.jobsAdmin.comments")}</Label>
                <Textarea className="mt-1" value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
              </div>

              {selected.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => act.mutate("approved")} disabled={act.isPending}>
                    {t("hr.jobsAdmin.approve")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => act.mutate("returned")}
                    disabled={act.isPending}
                  >
                    {t("hr.jobsAdmin.return")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => act.mutate("rejected")}
                    disabled={act.isPending}
                  >
                    {t("hr.jobsAdmin.reject")}
                  </Button>
                </div>
              ) : null}

              {selected.exceedsQuota && selected.quotaOverrideStatus !== "approved" && canOverride ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <Label>{t("hr.jobsAdmin.overrideReason")}</Label>
                  <Textarea
                    className="mt-1"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    rows={2}
                  />
                  <Button
                    type="button"
                    className="mt-2"
                    size="sm"
                    onClick={() => override.mutate()}
                    disabled={override.isPending || overrideReason.trim().length < 3}
                  >
                    {t("hr.jobsAdmin.grantOverride")}
                  </Button>
                </div>
              ) : null}

              {selected.status === "approved" ? (
                <div className="space-y-2 rounded-md border p-3">
                  <Label>{t("hr.jobsAdmin.recruiterStub")}</Label>
                  <Input
                    className="mt-1"
                    placeholder="user uuid"
                    value={recruiterUserId}
                    onChange={(e) => setRecruiterUserId(e.target.value)}
                  />
                  <Button type="button" size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
                    {t("hr.jobsAdmin.publish")}
                  </Button>
                </div>
              ) : null}
            </HrPanel>
          </HrSection>
        ) : null}

        <HrSection title={t("hr.jobsAdmin.vacancies")}>
          {!vacancies.data?.length ? (
            <HrEmptyState message={t("hr.jobsAdmin.noVacancies")} />
          ) : (
            <ul className="space-y-2">
              {vacancies.data.map((v) => (
                <li key={v.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{v.jobTitle}</span>
                    <Badge variant="secondary">{v.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {[v.locationName, v.departmentName, `${v.vacanciesCount} open`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      className="max-w-xs"
                      placeholder={t("hr.jobsAdmin.reason")}
                      value={vacancyReason}
                      onChange={(e) => setVacancyReason(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => vacStatus.mutate({ vacancyId: v.id, status: "on_hold" })}
                    >
                      {t("hr.jobsAdmin.hold")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => vacStatus.mutate({ vacancyId: v.id, status: "closed" })}
                    >
                      {t("hr.jobsAdmin.close")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => vacStatus.mutate({ vacancyId: v.id, status: "cancelled" })}
                    >
                      {t("hr.jobsAdmin.cancel")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

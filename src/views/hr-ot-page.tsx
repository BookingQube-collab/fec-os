"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  actOnOtClaim,
  getOtMonthlySummaries,
  getOtPolicySnapshot,
  listOtClaims,
} from "@/lib/hr-ot.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

function fmtMins(m: number | null | undefined) {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function HrOtPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"queue" | "hr_approved" | "payroll_posted" | "all">("queue");
  const [month, setMonth] = useState(currentMonth);
  const [groupBy, setGroupBy] = useState<"employee" | "department" | "employment_type" | "location">(
    "employee",
  );

  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot", status }),
    queryFn: () => listOtClaims({ status }),
    staleTime: STALE.people,
  });

  const summaries = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-summary", month, groupBy }),
    queryFn: () => getOtMonthlySummaries({ month, groupBy }),
    staleTime: STALE.people,
  });

  const policy = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-policy" }),
    queryFn: () => getOtPolicySnapshot(),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
  };

  const act = useMutation({
    mutationFn: actOnOtClaim,
    onSuccess: () => {
      toast.success(t("hr.ot.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = useMemo(
    () =>
      [
        { value: "queue" as const, label: t("hr.ot.queue") },
        { value: "hr_approved" as const, label: t("hr.ot.status.hr_approved") },
        { value: "payroll_posted" as const, label: t("hr.ot.status.payroll_posted") },
        { value: "all" as const, label: t("hr.ot.status.all") },
      ] as const,
    [t],
  );

  return (
    <CapabilityGate
      capability="hr.ot.verify"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.ot.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Timer}
          kicker={t("hr.ot.kicker")}
          title={t("hr.ot.title")}
          subtitle={t("hr.ot.subtitle")}
        >
          {policy.data ? (
            <p className="text-xs text-muted-foreground hr-enter">
              {t("hr.ot.policyHint", {
                min: policy.data.minClaimableMinutes,
                weekday: policy.data.rateWeekday,
                off: policy.data.rateWeeklyOff,
                holiday: policy.data.ratePublicHoliday,
                eid: policy.data.rateEid,
              })}
            </p>
          ) : null}

          <div className="hr-filter-bar hr-enter">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                className={cn(
                  "hr-chip",
                  status === f.value && "border-[var(--hr-charcoal)] bg-[var(--hr-charcoal)] text-white",
                )}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {(list.data ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.ot.empty")} icon={Timer} />
              ) : (
                (list.data ?? []).map((row) => (
                  <div key={row.id} className="hr-list-row">
                    <div>
                      <p className="font-medium">
                        {row.staffName} · {row.workDate} · {t(`hr.ot.rateTypes.${row.rateType}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.locationName ?? "—"} · {t("hr.ot.scheduled")}:{" "}
                        {row.scheduledIn ? new Date(row.scheduledIn).toLocaleTimeString() : "—"}–
                        {row.scheduledOut ? new Date(row.scheduledOut).toLocaleTimeString() : "—"} ·{" "}
                        {t("hr.ot.attendance")}:{" "}
                        {row.actualIn ? new Date(row.actualIn).toLocaleTimeString() : "—"}–
                        {row.actualOut ? new Date(row.actualOut).toLocaleTimeString() : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("hr.ot.eligible")}: {fmtMins(row.eligibleMinutes)} · {t("hr.ot.claimed")}:{" "}
                        {fmtMins(row.claimedMinutes)} · {t("hr.ot.approved")}:{" "}
                        {fmtMins(row.approvedMinutes)} · ×{row.rateMultiplier} · {row.amountQar.toFixed(2)}{" "}
                        QAR
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t(`hr.ot.status.${row.status}`)}</Badge>
                      {row.status === "submitted" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "verify" })}
                          >
                            {t("hr.ot.verify")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "reject" })}
                          >
                            {t("hr.ot.reject")}
                          </Button>
                        </>
                      ) : null}
                      {row.status === "manager_verified" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "approve" })}
                          >
                            {t("hr.ot.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "reject" })}
                          >
                            {t("hr.ot.reject")}
                          </Button>
                        </>
                      ) : null}
                      {row.status === "hr_approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ claimId: row.id, action: "payroll_posted" })}
                        >
                          {t("hr.ot.markPayroll")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </HrPanel>

          <HrPanel delay={2}>
            <div className="space-y-3 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">{t("hr.ot.summariesTitle")}</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label>{t("hr.ot.month")}</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.ot.groupBy")}</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={groupBy}
                    onChange={(e) =>
                      setGroupBy(e.target.value as typeof groupBy)
                    }
                  >
                    <option value="employee">{t("hr.ot.group.employee")}</option>
                    <option value="department">{t("hr.ot.group.department")}</option>
                    <option value="employment_type">{t("hr.ot.group.employment_type")}</option>
                    <option value="location">{t("hr.ot.group.location")}</option>
                  </select>
                </div>
              </div>
              {(summaries.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("hr.ot.summariesEmpty")}</p>
              ) : (
                <div className="space-y-1">
                  {(summaries.data ?? []).map((row) => (
                    <div key={row.key} className="flex justify-between gap-2 text-sm border-b border-[var(--hr-border)] py-2">
                      <span>
                        {row.staffName ??
                          row.department ??
                          row.employmentType ??
                          row.locationName ??
                          row.key}
                        <span className="text-muted-foreground"> · {row.claims} {t("hr.ot.claims")}</span>
                      </span>
                      <span className="tabular-nums">
                        {fmtMins(row.approvedMinutes)} · {row.amountQar.toFixed(2)} QAR
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import {
  approveProbationDecision,
  getProbationStaffDetail,
  listProbationDashboard,
  openProbationReview,
  submitProbationDecision,
  upsertProbationDates,
} from "@/lib/hr-probation.functions";
import { HR_PROBATION_DECISIONS } from "@/lib/hr-probation";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrProbationPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [probationStart, setProbationStart] = useState("");
  const [probationEnd, setProbationEnd] = useState("");
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState("");
  const [comments, setComments] = useState("");
  const [decision, setDecision] = useState<(typeof HR_PROBATION_DECISIONS)[number]>("confirm");
  const [extendEnd, setExtendEnd] = useState("");

  const dash = useQuery({
    queryKey: queryKeys.people.hrProbation({ view: "dashboard" }),
    queryFn: () => listProbationDashboard(),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff-picker-probation" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });

  const detail = useQuery({
    queryKey: queryKeys.people.hrProbation({ view: "detail", staffId: selectedStaffId }),
    queryFn: () => getProbationStaffDetail({ staffId: selectedStaffId! }),
    enabled: Boolean(selectedStaffId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrProbation() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const saveDates = useMutation({
    mutationFn: () =>
      upsertProbationDates({
        staffId: selectedStaffId!,
        probationStart,
        probationEnd: probationEnd || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.probation.datesSaved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openReview = useMutation({
    mutationFn: () =>
      openProbationReview({
        staffId: selectedStaffId!,
        managerFeedback: feedback || null,
        performanceRating: rating || null,
        supportingComments: comments || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.probation.reviewOpened"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (reviewId: string) =>
      submitProbationDecision({
        reviewId,
        decision,
        decisionNote: comments || null,
        managerFeedback: feedback || null,
        performanceRating: rating || null,
        supportingComments: comments || null,
        extendEndDate: decision === "extend" ? extendEnd || null : null,
      }),
    onSuccess: (res) => {
      toast.success(
        res.flagsPhase6Termination
          ? t("hr.probation.flaggedPhase6")
          : t("hr.probation.decisionSubmitted"),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (reviewId: string) => approveProbationDecision({ reviewId }),
    onSuccess: () => {
      toast.success(t("hr.probation.approved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="hr.probation.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.probation.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Hourglass}
          kicker={t("hr.probation.kicker")}
          title={t("hr.probation.title")}
          subtitle={t("hr.probation.subtitle")}
        >
          <HrPanel className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("hr.probation.upcomingTitle")}
            </p>
            {!dash.data?.upcoming.length ? (
              <p className="text-sm text-muted-foreground">{t("hr.probation.upcomingEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {dash.data.upcoming.map((row) => (
                  <li key={row.staffId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <button
                      type="button"
                      className="text-left text-sm font-medium hover:underline"
                      onClick={() => {
                        setSelectedStaffId(row.staffId);
                        setProbationStart(row.probationStart);
                        setProbationEnd(row.probationEnd);
                      }}
                    >
                      {row.staffName} ({row.employeeCode})
                    </button>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">
                        {t("hr.probation.daysLeft", { days: row.daysRemaining })}
                      </Badge>
                      {row.reviewStatus ? (
                        <Badge variant="outline">{row.reviewStatus}</Badge>
                      ) : null}
                      {row.flagsPhase6Termination ? (
                        <Badge variant="destructive">{t("hr.probation.phase6Flag")}</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </HrPanel>

          <HrPanel className="space-y-3">
            <div className="space-y-1">
              <Label>{t("hr.probation.staff")}</Label>
              <SearchableSelect
                value={selectedStaffId ?? ""}
                onValueChange={(next) => {
                  setSelectedStaffId(next || null);
                  setProbationStart("");
                  setProbationEnd("");
                }}
                placeholder={t("hr.probation.pickStaff")}
                emptyOption={{ value: "", label: t("hr.probation.pickStaff") }}
                options={(staffOptions.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                  keywords: `${s.name} ${s.employeeCode ?? ""}`,
                }))}
              />
            </div>

            {selectedStaffId ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t("hr.probation.start")}</Label>
                    <Input
                      type="date"
                      value={probationStart || detail.data?.probationStart || ""}
                      onChange={(e) => setProbationStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("hr.probation.end")}</Label>
                    <Input
                      type="date"
                      value={probationEnd || detail.data?.probationEnd || ""}
                      onChange={(e) => setProbationEnd(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saveDates.isPending || !probationStart}
                  onClick={() => saveDates.mutate()}
                >
                  {t("hr.probation.saveDates")}
                </Button>

                {detail.data ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      {t("hr.probation.daysLeft", {
                        days: detail.data.daysRemaining ?? "—",
                      })}
                    </p>
                    <p>
                      {t("hr.probation.attendance", {
                        present: detail.data.attendanceSummary.present,
                        late: detail.data.attendanceSummary.late,
                        absent: detail.data.attendanceSummary.absent,
                      })}
                    </p>
                    <p className="sm:col-span-2 text-muted-foreground">
                      {t("hr.probation.warningsCount", {
                        count: detail.data.warnings.length,
                      })}{" "}
                      · {t("hr.probation.staffStatus", { status: detail.data.staff?.status ?? "—" })}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label>{t("hr.probation.managerFeedback")}</Label>
                  <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t("hr.probation.rating")}</Label>
                    <Input value={rating} onChange={(e) => setRating(e.target.value)} placeholder="optional" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("hr.probation.decision")}</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as typeof decision)}
                    >
                      {HR_PROBATION_DECISIONS.map((d) => (
                        <option key={d} value={d}>
                          {t(`hr.probation.decisions.${d}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {decision === "extend" ? (
                  <div className="space-y-1">
                    <Label>{t("hr.probation.extendEnd")}</Label>
                    <Input type="date" value={extendEnd} onChange={(e) => setExtendEnd(e.target.value)} />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>{t("hr.probation.comments")}</Label>
                  <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={openReview.isPending} onClick={() => openReview.mutate()}>
                    {t("hr.probation.openReview")}
                  </Button>
                  {(detail.data?.reviews ?? [])
                    .filter((r) => r.status === "open")
                    .slice(0, 1)
                    .map((r) => (
                      <Button
                        key={r.id}
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate(r.id)}
                      >
                        {t("hr.probation.submitDecision")}
                      </Button>
                    ))}
                  {(detail.data?.reviews ?? [])
                    .filter((r) => r.status === "pending_approval")
                    .slice(0, 1)
                    .map((r) => (
                      <Button
                        key={r.id}
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(r.id)}
                      >
                        {t("hr.probation.approve")}
                      </Button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("hr.probation.neverTerminate")}</p>
              </>
            ) : null}
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrModuleFrame } from "@/components/hr/hr-module-frame";
import { HrPanel } from "@/components/hr/hr-panel";
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
  listProbationReviews,
  openProbationReview,
  submitProbationDecision,
  upsertProbationDates,
} from "@/lib/hr-probation.functions";
import { HR_PROBATION_DECISIONS } from "@/lib/hr-probation";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function reviewBadge(status: string): "warning" | "info" | "success" | "muted" | "outline" {
  if (status === "pending_approval") return "warning";
  if (status === "open") return "info";
  if (status === "decided") return "success";
  if (status === "cancelled") return "muted";
  return "outline";
}

export default function HrProbationPage({ embedded = false }: { embedded?: boolean }) {
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
  const autoPicked = useRef(false);

  const dash = useQuery({
    queryKey: queryKeys.people.hrProbation({ view: "dashboard" }),
    queryFn: () => listProbationDashboard(),
    staleTime: STALE.people,
  });

  const reviews = useQuery({
    queryKey: queryKeys.people.hrProbation({ view: "reviews", status: "all" }),
    queryFn: () => listProbationReviews({ status: "all" }),
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

  useEffect(() => {
    if (autoPicked.current || selectedStaffId) return;
    const upcoming = dash.data?.upcoming[0];
    if (upcoming) {
      autoPicked.current = true;
      setSelectedStaffId(upcoming.staffId);
      setProbationStart(upcoming.probationStart);
      setProbationEnd(upcoming.probationEnd);
      return;
    }
    const open = reviews.data?.find((row) => row.status === "open" || row.status === "pending_approval");
    if (open) {
      autoPicked.current = true;
      setSelectedStaffId(open.staffId);
    }
  }, [dash.data, reviews.data, selectedStaffId]);

  useEffect(() => {
    if (!selectedStaffId || !detail.data) return;
    setProbationStart((current) => current || detail.data?.probationStart || "");
    setProbationEnd((current) => current || detail.data?.probationEnd || "");
  }, [detail.data, selectedStaffId]);

  const openReviewFor = (staffId: string, start?: string, end?: string) => {
    autoPicked.current = true;
    setSelectedStaffId(staffId);
    setProbationStart(start ?? "");
    setProbationEnd(end ?? "");
  };

  return (
    <CapabilityGate
      capability="hr.probation.manage"
      fallback={
        <HrPanel>
          <HrEmptyState message={t("hr.probation.noAccess")} />
        </HrPanel>
      }
    >
      <HrModuleFrame
        embedded={embedded}
        icon={Hourglass}
        kicker={t("hr.probation.kicker")}
        title={t("hr.probation.title")}
        subtitle={t("hr.probation.subtitle")}
      >
          <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <HrPanel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("hr.probation.upcomingTitle")}</h2>
            {dash.isLoading ? (
              <FecLoader label={t("common.loading")} />
            ) : !dash.data?.upcoming.length ? (
              <p className="text-sm text-muted-foreground">{t("hr.probation.upcomingEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {dash.data.upcoming.map((row) => (
                  <li key={row.staffId}>
                    <button
                      type="button"
                      className={`hr-list-row w-full min-w-0 text-start ${
                        selectedStaffId === row.staffId ? "bg-secondary" : ""
                      }`}
                      aria-pressed={selectedStaffId === row.staffId}
                      onClick={() => openReviewFor(row.staffId, row.probationStart, row.probationEnd)}
                    >
                      <span className="min-w-0 text-sm font-medium">
                        {row.staffName} ({row.employeeCode})
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {t("hr.probation.daysLeft", { days: row.daysRemaining })}
                        </Badge>
                        {row.reviewStatus ? (
                          <Badge variant={reviewBadge(row.reviewStatus)}>
                            {t(`hr.probation.statuses.${row.reviewStatus}`, {
                              defaultValue: row.reviewStatus.replace(/_/g, " "),
                            })}
                          </Badge>
                        ) : null}
                        {row.flagsPhase6Termination ? (
                          <Badge variant="destructive">{t("hr.probation.phase6Flag")}</Badge>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </HrPanel>

          <HrPanel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("hr.probation.historyTitle")}</h2>
            {reviews.isLoading ? (
              <FecLoader label={t("common.loading")} />
            ) : reviews.isError ? (
              <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
            ) : !reviews.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("hr.probation.historyEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {reviews.data.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`hr-list-row w-full min-w-0 text-start ${
                        selectedStaffId === row.staffId ? "bg-secondary" : ""
                      }`}
                      aria-pressed={selectedStaffId === row.staffId}
                      onClick={() => openReviewFor(row.staffId)}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {row.staffName ?? "—"}
                          {row.employeeCode ? ` · ${row.employeeCode}` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.probationStart} – {row.probationEnd}
                          {row.decision
                            ? ` · ${t(`hr.probation.decisions.${row.decision}`, { defaultValue: row.decision })}`
                            : ""}
                        </span>
                      </span>
                      <Badge variant={reviewBadge(row.status)}>
                        {t(`hr.probation.statuses.${row.status}`, {
                          defaultValue: row.status.replace(/_/g, " "),
                        })}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </HrPanel>
          </div>

          <HrPanel className="order-1 min-w-0 space-y-3 p-4 lg:order-2">
            <h2 className="text-sm font-semibold">{t("hr.probation.workspaceTitle")}</h2>
            <div className="space-y-1">
              <Label>{t("hr.probation.staff")}</Label>
              <SearchableSelect
                value={selectedStaffId ?? ""}
                onValueChange={(next) => {
                  autoPicked.current = true;
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
              {staffOptions.isError ? (
                <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
              ) : null}
            </div>

            {selectedStaffId ? (
              <>
                {detail.isLoading ? <FecLoader label={t("common.loading")} /> : null}
                {detail.isError ? (
                  <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
                ) : null}
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
                      ·{" "}
                      {t("hr.probation.staffStatus", {
                        status: detail.data.staff?.status
                          ? t(`hr.me.staffStatus.${detail.data.staff.status}`, {
                              defaultValue: detail.data.staff.status.replace(/_/g, " "),
                            })
                          : "—",
                      })}
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
                {(detail.data?.reviews ?? []).length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">{t("hr.probation.historyTitle")}</h3>
                    <ul className="space-y-2">
                      {detail.data?.reviews.map((row) => (
                        <li key={row.id} className="min-w-0 space-y-1 rounded-lg border border-border/60 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={reviewBadge(row.status)}>
                              {t(`hr.probation.statuses.${row.status}`, {
                                defaultValue: row.status.replace(/_/g, " "),
                              })}
                            </Badge>
                            {row.decision ? (
                              <Badge variant="outline">
                                {t(`hr.probation.decisions.${row.decision}`, { defaultValue: row.decision })}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {row.probationStart} – {row.probationEnd}
                            </span>
                          </div>
                          {row.managerFeedback ? <p>{row.managerFeedback}</p> : null}
                          {row.decisionNote ? <p className="text-muted-foreground">{row.decisionNote}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">{t("hr.probation.neverTerminate")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hr.probation.pickToReview")}</p>
            )}
          </HrPanel>
          </div>
      </HrModuleFrame>
    </CapabilityGate>
  );
}

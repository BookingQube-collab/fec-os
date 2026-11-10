"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Palmtree } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { usePermission } from "@/hooks/use-permission";
import { useRegisterHrAssist } from "@/components/hr/hr-people-assist";
import { HrEmbedFrame } from "@/components/hr/hr-embed-frame";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import {
  LeaveDocumentLightbox,
  type LeaveDocumentPreviewTarget,
} from "@/components/hr/leave-document-preview";
import { LeavePlannerGateBanner } from "@/components/hr/leave-planner-gate";
import {
  LeaveRequestPrintDialog,
  type LeaveRequestPrintPayload,
} from "@/components/hr/leave-request-print-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  actOnLeaveApproval,
  bulkReviewLeaveRequests,
  getLeaveBalanceSummary,
  grantCompOff,
  listLeaveRequests,
  listStaffForLeaveBalances,
  recordLeaveForStaff,
  reviewLeaveRequest,
  upsertLeaveBalance,
} from "@/lib/hr-leave.functions";
import { HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { invalidateLeaveLists, isLeaveListQuery } from "@/lib/people-query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

export function HrLeaveWorkspace({
  lockedStaffId,
  embedded = false,
  onChanged,
}: {
  lockedStaffId?: string;
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canManage = usePermission("hr.leave.manage");
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  useRegisterHrAssist({ staffId: lockedStaffId ?? null });
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled" | "all">("pending");
  const [selected, setSelected] = useState<string[]>([]);
  const [balanceStaffId, setBalanceStaffId] = useState("");
  const [allotted, setAllotted] = useState("21");
  const [carried, setCarried] = useState("0");
  const [balanceType, setBalanceType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");
  const [compDays, setCompDays] = useState("1");
  const [compEarned, setCompEarned] = useState("");
  const [compReason, setCompReason] = useState("");
  const [payrollImpact, setPayrollImpact] = useState(false);
  const [recordStaffId, setRecordStaffId] = useState("");
  const [recordType, setRecordType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");
  const [recordFrom, setRecordFrom] = useState("");
  const [recordTo, setRecordTo] = useState("");
  const [recordReason, setRecordReason] = useState("");
  const [recordAck, setRecordAck] = useState(false);
  const [printPayload, setPrintPayload] = useState<
    LeaveRequestPrintPayload | LeaveRequestPrintPayload[] | null
  >(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<LeaveDocumentPreviewTarget | null>(null);
  const effectiveRecordStaffId = lockedStaffId || recordStaffId;
  const effectiveBalanceStaffId = lockedStaffId || balanceStaffId;

  type LeaveListRow = Awaited<ReturnType<typeof listLeaveRequests>>[number];
  const toLeavePrintPayload = (row: LeaveListRow): LeaveRequestPrintPayload => ({
    requestNumber: row.requestNumber,
    requestDate: row.createdAt.slice(0, 10),
    staffName: row.staffName ?? "—",
    employeeCode: row.employeeCode,
    department: row.department,
    jobTitle: row.jobTitle,
    phone: row.phone,
    leaveTypeLabel: t(`hr.leave.types.${row.leaveType}`),
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    days: row.days,
    reason: row.reason,
    status: row.status,
    plannerOverride: Boolean(row.plannerOverride),
    plannerOverrideReasons: row.plannerOverrideReasons ?? [],
    steps: (row.steps ?? []).map((step) => ({
      stepRole: step.stepRole,
      status: step.status,
      actedByName: step.actedByName,
      actedAt: step.actedAt,
      actedBySignatureUrl: step.actedBySignatureUrl ?? null,
    })),
  });
  const openLeavePrint = (row: LeaveListRow) => {
    setPrintPayload(toLeavePrintPayload(row));
    setPrintOpen(true);
  };

  const listQueryKey = queryKeys.people.attendanceHr({
    view: "leave",
    status,
    staffId: lockedStaffId ?? null,
  });

  const list = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      listLeaveRequests({
        status: status === "all" ? null : status,
        staffId: lockedStaffId ?? null,
      }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
    enabled: !lockedStaffId && canManage,
  });

  const balances = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ staffId: effectiveBalanceStaffId || null }),
    queryFn: () => getLeaveBalanceSummary({ staffId: effectiveBalanceStaffId || undefined }),
    enabled: Boolean(effectiveBalanceStaffId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    invalidateLeaveLists(qc);
    onChanged?.();
  };

  /** Pending queue: drop acted cards immediately (same pattern as missed-punch). */
  const dropLeaveRowsOptimistic = async (ids: string[]) => {
    if (status !== "pending" || !ids.length) return undefined as LeaveListRow[] | undefined;
    await qc.cancelQueries({ predicate: (query) => isLeaveListQuery(query.queryKey) });
    const previous = qc.getQueryData<LeaveListRow[]>(listQueryKey);
    const remove = new Set(ids);
    qc.setQueryData<LeaveListRow[]>(listQueryKey, (old) => (old ?? []).filter((row) => !remove.has(row.id)));
    return previous;
  };

  const review = useMutation({
    mutationFn: (vars: {
      id: string;
      status: "approved" | "rejected" | "cancelled";
      reviewNote?: string | null;
      payrollImpact?: boolean;
    }) => reviewLeaveRequest(vars),
    onMutate: async (vars) => {
      const previous = await dropLeaveRowsOptimistic([vars.id]);
      return { previous };
    },
    onSuccess: (res, vars) => {
      if (vars.status === "approved" && (res.syncedDays ?? 0) > 0) {
        toast.success(t("hr.leave.synced", { days: res.syncedDays }));
      } else {
        toast.success(t("hr.leave.updated"));
      }
      setSelected([]);
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => invalidate(),
  });

  const stepAct = useMutation({
    mutationFn: async (vars: {
      leaveId: string;
      action: "approved" | "rejected";
      comments?: string | null;
      payrollImpact?: boolean;
    }) => {
      const result = await actOnLeaveApproval(vars);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (vars) => {
      // Intermediate approve keeps the row in the pending queue for the next step.
      if (vars.action !== "rejected") return { previous: undefined as LeaveListRow[] | undefined };
      const previous = await dropLeaveRowsOptimistic([vars.leaveId]);
      return { previous };
    },
    onSuccess: (res) => {
      if (res.final && (res.syncedDays ?? 0) > 0) {
        toast.success(t("hr.leave.synced", { days: res.syncedDays }));
      } else if (res.final) {
        toast.success(t("hr.leave.updated"));
      } else {
        toast.success(t("hr.leave.stepAdvanced", { step: res.nextStep ?? "" }));
      }
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => invalidate(),
  });

  const grantComp = useMutation({
    mutationFn: grantCompOff,
    onSuccess: () => {
      toast.success(t("hr.leave.compOffGranted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (vars: {
      ids: string[];
      status: "approved" | "rejected";
      reviewNote?: string | null;
    }) => bulkReviewLeaveRequests(vars),
    onMutate: async (vars) => {
      const previous = await dropLeaveRowsOptimistic(vars.ids);
      return { previous };
    },
    onSuccess: (res) => {
      toast.success(t("hr.leave.bulkUpdated", { count: res.updated }));
      if (res.errors.length) toast.error(res.errors[0]);
      setSelected([]);
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listQueryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => invalidate(),
  });

  const saveBalance = useMutation({
    mutationFn: upsertLeaveBalance,
    onSuccess: () => {
      toast.success(t("hr.leave.balanceSaved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordLeave = useMutation({
    mutationFn: recordLeaveForStaff,
    onSuccess: (res) => {
      if ("plannerBlocked" in res && res.plannerBlocked) {
        toast.error(
          (res.plannerReasons ?? [])[0] ||
            t("hr.leave.planner.blockedToast", {
              defaultValue: "Leave planner blocked this request. Use Emergency leave if needed.",
            }),
        );
        return;
      }
      if (res.blocked) {
        toast.error(t("hr.leave.overlapBlocked"));
        return;
      }
      if (res.requiresAck) {
        setRecordAck(true);
        toast.warning(t("hr.leave.conflictWarn"));
        return;
      }
      toast.success(t("hr.leave.synced", { days: res.syncedDays || res.days }));
      setRecordAck(false);
      setRecordFrom("");
      setRecordTo("");
      setRecordReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingIds = useMemo(
    () => (list.data ?? []).filter((r) => r.status === "pending").map((r) => r.id),
    [list.data],
  );

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  if (!canManage && reportsPending) {
    return embedded ? null : (
      <HrShell>
        <HrPanel>
          <HrEmptyState message={t("common.loading", { defaultValue: "Loading…" })} />
        </HrPanel>
      </HrShell>
    );
  }

  return (
    <CapabilityGate
      capability="hr.leave.manage"
      alsoAllow={hasDirectReports}
      fallback={
        embedded ? (
          <HrEmptyState message={t("hr.leave.noAccess")} />
        ) : (
          <HrShell>
            <HrPanel>
              <HrEmptyState message={t("hr.leave.noAccess")} />
            </HrPanel>
          </HrShell>
        )
      }
    >
      <HrEmbedFrame
        embedded={embedded}
        icon={Palmtree}
        kicker={t("hr.leave.kicker")}
        title={t("hr.leave.title")}
        subtitle={t("hr.leave.subtitle")}
      >
          <div className="hr-filter-bar hr-enter flex flex-wrap items-center gap-2">
            {(["pending", "approved", "rejected", "cancelled", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn("hr-chip", status === value && "border-[var(--hr-charcoal)] bg-[var(--hr-charcoal)] text-white")}
                onClick={() => setStatus(value)}
              >
                {t(`hr.leave.status.${value}`)}
              </button>
            ))}
            {canManage && !embedded ? (
              <Button asChild type="button" size="sm" variant="secondary" className="min-h-9 gap-1.5">
                <Link href="/people/leave-planner">
                  <CalendarRange className="size-3.5" aria-hidden />
                  {t("nav.hrLeavePlanner", { defaultValue: "Leave planner" })}
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 ms-auto"
              disabled={(list.data ?? []).length === 0}
              onClick={() => {
                const rows = list.data ?? [];
                if (!rows.length) return;
                setPrintPayload(rows.map((row) => toLeavePrintPayload(row)));
                setPrintOpen(true);
              }}
            >
              {t("hr.leave.print.printAll", { defaultValue: "Print all" })}
            </Button>
          </div>

          {canManage && status === "pending" && pendingIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 hr-enter">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={payrollImpact} onCheckedChange={(v) => setPayrollImpact(Boolean(v))} />
                {t("hr.leave.payrollImpactFlag")}
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(selected.length === pendingIds.length ? [] : pendingIds)}
              >
                {t("hr.leave.selectAll")}
              </Button>
              <Button
                size="sm"
                disabled={!selected.length || bulk.isPending}
                onClick={() => bulk.mutate({ ids: selected, status: "approved" })}
              >
                {t("hr.leave.bulkApprove")} ({selected.length})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!selected.length || bulk.isPending}
                onClick={() => bulk.mutate({ ids: selected, status: "rejected" })}
              >
                {t("hr.leave.bulkReject")}
              </Button>
            </div>
          ) : null}

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {(list.data ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.leave.empty")} icon={Palmtree} />
              ) : (
                (list.data ?? []).map((row) => (
                  <div key={row.id} className="hr-list-row">
                    <div className="flex items-start gap-3">
                      {row.status === "pending" ? (
                        <Checkbox
                          checked={selected.includes(row.id)}
                          onCheckedChange={(v) => toggle(row.id, Boolean(v))}
                          aria-label={t("hr.leave.select")}
                        />
                      ) : null}
                      <div>
                        <p className="font-medium">
                          {row.staffName} · {t(`hr.leave.types.${row.leaveType}`)}
                          {row.requestNumber ? (
                            <span className="ms-2 font-mono text-xs font-semibold text-muted-foreground">
                              {row.requestNumber}
                            </span>
                          ) : null}
                          {row.plannerOverride ? (
                            <Badge variant="secondary" className="ms-2 align-middle text-[0.65rem]">
                              {t("hr.leave.planner.overrideBadge", { defaultValue: "Planner override" })}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.employeeCode ?? "—"} · {row.dateFrom} → {row.dateTo} · {row.days} {t("hr.leave.days")}
                          {row.currentStepRole
                            ? ` · ${t("hr.leave.waitingStep", {
                                step:
                                  row.currentStepRole === "ops" && row.opsLane === "fnb_manager"
                                    ? t("hr.leave.steps.opsFnb", { defaultValue: "F&B Manager" })
                                    : t(`hr.leave.steps.${row.currentStepRole}`),
                              })}`
                            : ""}
                          {row.payrollImpact ? ` · ${t("hr.leave.payrollImpact")}` : ""}
                          {row.reason ? ` · ${row.reason}` : ""}
                          {row.documentId
                            ? ` · ${row.documentFileName ?? t("hr.leave.documentAttached")}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                        {t(`hr.leave.status.${row.status}`)}
                      </Badge>
                      {row.documentId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPreviewDoc({
                              leaveId: row.id,
                              fileName: row.documentFileName,
                              title: `${row.staffName ?? "Staff"} · ${t("hr.leave.sickDocument")}`,
                            })
                          }
                        >
                          {t("hr.leave.viewDocument")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => openLeavePrint(row)}>
                        {t("hr.leave.print.preview")}
                      </Button>
                      {row.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={stepAct.isPending || review.isPending}
                            onClick={() =>
                              stepAct.mutate({
                                leaveId: row.id,
                                action: "approved",
                                payrollImpact: row.currentStepRole === "hr" ? payrollImpact : false,
                              })
                            }
                          >
                            {t("hr.leave.approveStep")}
                          </Button>
                          {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={review.isPending}
                            onClick={() =>
                              review.mutate({ id: row.id, status: "approved", payrollImpact })
                            }
                          >
                            {t("hr.leave.hrFinalApprove")}
                          </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={stepAct.isPending || review.isPending}
                            onClick={() => stepAct.mutate({ leaveId: row.id, action: "rejected" })}
                          >
                            {t("hr.leave.reject")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </HrPanel>

          {canManage ? (
          <HrPanel delay={1.5}>
            <div className="space-y-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("hr.leave.recordTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("hr.leave.recordHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lockedStaffId ? null : (
                <div>
                  <Label>{t("hr.leave.staff")}</Label>
                  <SearchableSelect
                    value={recordStaffId}
                    onValueChange={setRecordStaffId}
                    placeholder={t("hr.leave.pickStaff")}
                    emptyOption={{ value: "", label: t("hr.leave.pickStaff") }}
                    options={(staffOptions.data ?? []).map((s) => ({
                      value: s.id,
                      label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                      keywords: `${s.name} ${s.employeeCode ?? ""}`,
                    }))}
                  />
                </div>
                )}
                <div>
                  <Label>{t("hr.leave.type")}</Label>
                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value as (typeof HR_LEAVE_TYPES)[number])}
                  >
                    {HR_LEAVE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {t(`hr.leave.types.${value}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("hr.leave.from")}</Label>
                  <Input type="date" value={recordFrom} onChange={(e) => setRecordFrom(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.leave.to")}</Label>
                  <Input type="date" value={recordTo} onChange={(e) => setRecordTo(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("hr.leave.reason")}</Label>
                  <Input value={recordReason} onChange={(e) => setRecordReason(e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <LeavePlannerGateBanner
                    dateFrom={recordFrom}
                    dateTo={recordTo}
                    leaveType={recordType}
                    staffId={effectiveRecordStaffId || null}
                    enabled={Boolean(effectiveRecordStaffId && recordFrom && recordTo)}
                    onSwitchToEmergency={() => setRecordType("emergency")}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    disabled={!effectiveRecordStaffId || !recordFrom || !recordTo || recordLeave.isPending}
                    onClick={() =>
                      recordLeave.mutate({
                        staffId: effectiveRecordStaffId,
                        leaveType: recordType,
                        dateFrom: recordFrom,
                        dateTo: recordTo,
                        reason: recordReason || null,
                        acknowledgeConflicts: recordAck,
                        payrollImpact,
                      })
                    }
                  >
                    {recordAck ? t("hr.leave.recordAnyway") : t("hr.leave.recordSubmit")}
                  </Button>
                </div>
              </div>
            </div>
          </HrPanel>
          ) : null}

          {canManage ? (
          <HrPanel delay={2}>
            <div className="space-y-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("hr.leave.balancesTitle")}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {lockedStaffId ? null : (
                <div>
                  <Label>{t("hr.leave.staff")}</Label>
                  <SearchableSelect
                    value={balanceStaffId}
                    onValueChange={setBalanceStaffId}
                    placeholder={t("hr.leave.pickStaff")}
                    emptyOption={{ value: "", label: t("hr.leave.pickStaff") }}
                    options={(staffOptions.data ?? []).map((s) => ({
                      value: s.id,
                      label: s.employeeCode ? `${s.name} (${s.employeeCode})` : s.name,
                      keywords: `${s.name} ${s.employeeCode ?? ""}`,
                    }))}
                  />
                </div>
                )}
                <div>
                  <Label>{t("hr.leave.type")}</Label>
                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={balanceType}
                    onChange={(e) => setBalanceType(e.target.value as (typeof HR_LEAVE_TYPES)[number])}
                  >
                    {HR_LEAVE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {t(`hr.leave.types.${value}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("hr.leave.allotted")}</Label>
                  <Input type="number" min={0} value={allotted} onChange={(e) => setAllotted(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.leave.carriedForward")}</Label>
                  <Input type="number" min={0} value={carried} onChange={(e) => setCarried(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={!effectiveBalanceStaffId || saveBalance.isPending}
                    onClick={() =>
                      saveBalance.mutate({
                        staffId: effectiveBalanceStaffId,
                        leaveType: balanceType,
                        year: new Date().getFullYear(),
                        allottedDays: Number(allotted) || 0,
                        carriedForward: Number(carried) || 0,
                      })
                    }
                  >
                    {t("hr.leave.saveBalance")}
                  </Button>
                </div>
              </div>
              {balances.data?.accrual ? (
                <p className="text-xs text-muted-foreground">
                  {t("hr.leave.accrualHint", {
                    accrued: balances.data.accrual.accruedDays,
                    months: balances.data.accrual.monthsAccrued,
                    hire: balances.data.accrual.hireDate ?? "—",
                  })}
                </p>
              ) : null}
              {balances.data?.balances?.length ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {balances.data.balances.map((b) => (
                    <div key={b.leaveType} className="rounded-xl border border-[var(--hr-border)] bg-white/70 px-3 py-2.5 text-sm">
                      <p className="font-medium">{t(`hr.leave.types.${b.leaveType}`)}</p>
                      <p className="text-muted-foreground">
                        {t("hr.leave.remaining", { remaining: b.remainingDays, allotted: b.allottedDays, used: b.usedDays })}
                      </p>
                      {b.carriedForwardDays ? (
                        <p className="text-xs text-muted-foreground">
                          {t("hr.leave.carriedLabel", { days: b.carriedForwardDays })}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 border-t border-[var(--hr-border)] pt-4 sm:grid-cols-4">
                <div>
                  <Label>{t("hr.leave.compOffEarned")}</Label>
                  <Input type="date" value={compEarned} onChange={(e) => setCompEarned(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.leave.compOffDays")}</Label>
                  <Input type="number" min={0.25} step={0.25} value={compDays} onChange={(e) => setCompDays(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.leave.reason")}</Label>
                  <Input value={compReason} onChange={(e) => setCompReason(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!effectiveBalanceStaffId || !compEarned || grantComp.isPending}
                    onClick={() =>
                      grantComp.mutate({
                        staffId: effectiveBalanceStaffId,
                        earnedOn: compEarned,
                        days: Number(compDays) || 1,
                        reason: compReason || null,
                      })
                    }
                  >
                    {t("hr.leave.grantCompOff")}
                  </Button>
                </div>
              </div>
            </div>
          </HrPanel>
          ) : null}
      </HrEmbedFrame>
      <LeaveRequestPrintDialog open={printOpen} onOpenChange={setPrintOpen} payload={printPayload} />
      <LeaveDocumentLightbox
        doc={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={(next) => {
          if (!next) setPreviewDoc(null);
        }}
      />
    </CapabilityGate>
  );
}

export default function HrLeavePage() {
  return <HrLeaveWorkspace />;
}

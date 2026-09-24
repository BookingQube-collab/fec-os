"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
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
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

export default function HrLeavePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
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

  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "leave", status }),
    queryFn: () => listLeaveRequests({ status: status === "all" ? null : status }),
    staleTime: STALE.people,
  });

  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
  });

  const balances = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ staffId: balanceStaffId || null }),
    queryFn: () => getLeaveBalanceSummary({ staffId: balanceStaffId || undefined }),
    enabled: Boolean(balanceStaffId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrLeaveBalances() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const review = useMutation({
    mutationFn: reviewLeaveRequest,
    onSuccess: (res, vars: { id: string; status: "approved" | "rejected" | "cancelled"; reviewNote?: string | null; payrollImpact?: boolean }) => {
      if (vars.status === "approved" && (res.syncedDays ?? 0) > 0) {
        toast.success(t("hr.leave.synced", { days: res.syncedDays }));
      } else {
        toast.success(t("hr.leave.updated"));
      }
      setSelected([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stepAct = useMutation({
    mutationFn: actOnLeaveApproval,
    onSuccess: (res) => {
      if (res.final && (res.syncedDays ?? 0) > 0) {
        toast.success(t("hr.leave.synced", { days: res.syncedDays }));
      } else if (res.final) {
        toast.success(t("hr.leave.updated"));
      } else {
        toast.success(t("hr.leave.stepAdvanced", { step: res.nextStep ?? "" }));
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
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
    mutationFn: bulkReviewLeaveRequests,
    onSuccess: (res) => {
      toast.success(t("hr.leave.bulkUpdated", { count: res.updated }));
      if (res.errors.length) toast.error(res.errors[0]);
      setSelected([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
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

  return (
    <CapabilityGate
      capability="hr.leave.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.leave.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Palmtree}
          kicker={t("hr.leave.kicker")}
          title={t("hr.leave.title")}
          subtitle={t("hr.leave.subtitle")}
        >
          <div className="hr-filter-bar hr-enter">
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
          </div>

          {status === "pending" && pendingIds.length > 0 ? (
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
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.employeeCode ?? "—"} · {row.dateFrom} → {row.dateTo} · {row.days} {t("hr.leave.days")}
                          {row.currentStepRole
                            ? ` · ${t("hr.leave.waitingStep", { step: t(`hr.leave.steps.${row.currentStepRole}`) })}`
                            : ""}
                          {row.payrollImpact ? ` · ${t("hr.leave.payrollImpact")}` : ""}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                        {t(`hr.leave.status.${row.status}`)}
                      </Badge>
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

          <HrPanel delay={1.5}>
            <div className="space-y-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("hr.leave.recordTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("hr.leave.recordHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="flex items-end gap-2">
                  <Button
                    disabled={!recordStaffId || !recordFrom || !recordTo || recordLeave.isPending}
                    onClick={() =>
                      recordLeave.mutate({
                        staffId: recordStaffId,
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

          <HrPanel delay={2}>
            <div className="space-y-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("hr.leave.balancesTitle")}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    disabled={!balanceStaffId || saveBalance.isPending}
                    onClick={() =>
                      saveBalance.mutate({
                        staffId: balanceStaffId,
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
                    disabled={!balanceStaffId || !compEarned || grantComp.isPending}
                    onClick={() =>
                      grantComp.mutate({
                        staffId: balanceStaffId,
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
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

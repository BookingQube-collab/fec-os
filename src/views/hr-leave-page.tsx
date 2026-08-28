"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bulkReviewLeaveRequests,
  getLeaveBalanceSummary,
  listLeaveRequests,
  listStaffForLeaveBalances,
  reviewLeaveRequest,
  upsertLeaveBalance,
} from "@/lib/hr-leave.functions";
import { HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrLeavePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled" | "all">("pending");
  const [selected, setSelected] = useState<string[]>([]);
  const [balanceStaffId, setBalanceStaffId] = useState("");
  const [allotted, setAllotted] = useState("21");
  const [balanceType, setBalanceType] = useState<(typeof HR_LEAVE_TYPES)[number]>("annual");

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
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      setSelected([]);
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
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.leave.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader icon={Palmtree} kicker={t("hr.leave.kicker")} title={t("hr.leave.title")} subtitle={t("hr.leave.subtitle")} />
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "cancelled", "all"] as const).map((value) => (
            <Button key={value} size="sm" variant={status === value ? "default" : "secondary"} onClick={() => setStatus(value)}>
              {t(`hr.leave.status.${value}`)}
            </Button>
          ))}
        </div>

        {status === "pending" && pendingIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
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

        <NeumorphicCard className="space-y-2 p-5">
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.leave.empty")}</p>
          ) : (
            (list.data ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3">
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
                      {row.reason ? ` · ${row.reason}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                    {t(`hr.leave.status.${row.status}`)}
                  </Badge>
                  {row.status === "pending" ? (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: row.id, status: "approved" })}>
                        {t("hr.leave.approve")}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: row.id, status: "rejected" })}>
                        {t("hr.leave.reject")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </NeumorphicCard>

        <NeumorphicCard className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">{t("hr.leave.balancesTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>{t("hr.leave.staff")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={balanceStaffId}
                onChange={(e) => setBalanceStaffId(e.target.value)}
              >
                <option value="">{t("hr.leave.pickStaff")}</option>
                {(staffOptions.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.employeeCode ? ` (${s.employeeCode})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("hr.leave.type")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <div className="flex items-end">
              <Button
                disabled={!balanceStaffId || saveBalance.isPending}
                onClick={() =>
                  saveBalance.mutate({
                    staffId: balanceStaffId,
                    leaveType: balanceType,
                    year: new Date().getFullYear(),
                    allottedDays: Number(allotted) || 0,
                  })
                }
              >
                {t("hr.leave.saveBalance")}
              </Button>
            </div>
          </div>
          {balances.data?.balances?.length ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {balances.data.balances.map((b) => (
                <div key={b.leaveType} className="rounded-xl border px-3 py-2 text-sm">
                  <p className="font-medium">{t(`hr.leave.types.${b.leaveType}`)}</p>
                  <p className="text-muted-foreground">
                    {t("hr.leave.remaining", { remaining: b.remainingDays, allotted: b.allottedDays, used: b.usedDays })}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}

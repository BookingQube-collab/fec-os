"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, Download, Lock, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  advancePayrollPeriod,
  generatePayrollLines,
  generatePayslips,
  getPayrollExportMatrix,
  getPayrollPeriodDetail,
  lockPayrollPeriod,
  reopenPayrollPeriod,
} from "@/lib/hr-payroll.functions";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { usePermission } from "@/hooks/use-permission";

function matrixToCsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

function downloadCsv(filename: string, matrix: string[][]) {
  const blob = new Blob([matrixToCsv(matrix)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HrPayrollPeriodPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ periodId: string }>();
  const periodId = params.periodId;
  const qc = useQueryClient();
  const [method, setMethod] = useState<string>("all");
  const [reopenReason, setReopenReason] = useState("");
  const [pending, startTransition] = useTransition();
  const canGenerate = usePermission("payroll.generate");
  const canFinance = usePermission("payroll.finance");
  const canLock = usePermission("payroll.lock");
  const canExport = usePermission("payroll.export_wps");

  const detail = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriod(periodId, { method }),
    queryFn: () =>
      getPayrollPeriodDetail({
        periodId,
        paymentMethod: method === "all" ? "all" : (method as "wps" | "cheque" | "bank_transfer"),
      }),
    staleTime: STALE.people,
    enabled: Boolean(periodId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrPayrollPeriod(periodId) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrPayrollPeriods() });
  };

  const run = (fn: () => Promise<unknown>, okMsg: string) => {
    startTransition(async () => {
      try {
        await fn();
        toast.success(okMsg);
        invalidate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("hr.payrollRuns.error"));
      }
    });
  };

  const exportMut = useMutation({
    mutationFn: (m: "wps" | "cheque" | "bank_transfer") =>
      getPayrollExportMatrix({ periodId, method: m }),
    onSuccess: (res) => {
      downloadCsv(`payroll-${res.month}-${res.method}.csv`, res.matrix);
      if (res.note) toast.message(res.note);
      else toast.success(t("hr.payrollRuns.exported"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const period = detail.data?.period;
  const lines = detail.data?.lines ?? [];
  const totals = detail.data?.totals;

  const statusBadge = useMemo(() => {
    if (!period) return null;
    const tone =
      period.status === "locked"
        ? "secondary"
        : period.status === "paid" || period.status === "processed"
          ? "success"
          : "outline";
    return <Badge variant={tone}>{t(`hr.payrollRuns.status.${period.status}`, { defaultValue: period.status })}</Badge>;
  }, [period, t]);

  return (
    <CapabilityGate
      capability="payroll.view"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.payroll.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Banknote}
          kicker={t("hr.payrollRuns.kicker")}
          title={period ? t("hr.payrollRuns.periodTitle", { month: period.month }) : t("hr.payrollRuns.periodLoading")}
          subtitle={
            period
              ? formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)
              : undefined
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/people/payroll">
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t("hr.payrollRuns.back")}
              </Link>
            </Button>
            {statusBadge}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HrKpiTile label={t("hr.payrollRuns.lines")} value={totals?.count ?? "—"} delay={0} />
            <HrKpiTile label={t("hr.payrollRuns.gross")} value={totals ? totals.gross.toFixed(0) : "—"} delay={1} />
            <HrKpiTile label={t("hr.payrollRuns.net")} value={totals ? totals.net.toFixed(0) : "—"} delay={2} />
            <HrKpiTile
              label={t("hr.payrollRuns.methods")}
              value={
                totals
                  ? `${totals.byMethod.wps}/${totals.byMethod.cheque}/${totals.byMethod.bank_transfer}`
                  : "—"
              }
              delay={3}
            />
          </div>

          <HrPanel delay={4}>
            <div className="flex flex-wrap gap-2 p-4">
              {canGenerate ? (
                <Button
                  disabled={pending || period?.status === "locked"}
                  onClick={() =>
                    run(() => generatePayrollLines({ periodId }), t("hr.payrollRuns.generated"))
                  }
                >
                  {t("hr.payrollRuns.generate")}
                </Button>
              ) : null}
              {canGenerate && detail.data?.nextStatus ? (
                <Button
                  variant="secondary"
                  disabled={pending || period?.status === "locked"}
                  onClick={() =>
                    run(() => advancePayrollPeriod({ periodId }), t("hr.payrollRuns.advanced"))
                  }
                >
                  {t("hr.payrollRuns.advance", {
                    to: t(`hr.payrollRuns.status.${detail.data.nextStatus}`, {
                      defaultValue: detail.data.nextStatus,
                    }),
                  })}
                </Button>
              ) : null}
              {canFinance &&
              period &&
              (period.status === "gm_approved" || period.status === "processed") ? (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(() => advancePayrollPeriod({ periodId }), t("hr.payrollRuns.advanced"))
                  }
                >
                  {t("hr.payrollRuns.advanceFinance")}
                </Button>
              ) : null}
              {canGenerate ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => generatePayslips({ periodId }), t("hr.payrollRuns.payslipsDone"))
                  }
                >
                  {t("hr.payrollRuns.payslips")}
                </Button>
              ) : null}
              {canLock && period && (period.status === "processed" || period.status === "paid") ? (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run(() => lockPayrollPeriod({ periodId }), t("hr.payrollRuns.locked"))}
                >
                  <Lock className="mr-1 h-4 w-4" />
                  {t("hr.payrollRuns.lock")}
                </Button>
              ) : null}
            </div>
            {canLock && period?.status === "locked" ? (
              <div className="space-y-2 border-t p-4">
                <Label htmlFor="reopen-reason">{t("hr.payrollRuns.reopenReason")}</Label>
                <Textarea
                  id="reopen-reason"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  rows={2}
                />
                <Button
                  variant="secondary"
                  disabled={pending || reopenReason.trim().length < 3}
                  onClick={() =>
                    run(
                      () => reopenPayrollPeriod({ periodId, reason: reopenReason.trim() }),
                      t("hr.payrollRuns.reopened"),
                    )
                  }
                >
                  <Unlock className="mr-1 h-4 w-4" />
                  {t("hr.payrollRuns.reopen")}
                </Button>
              </div>
            ) : null}
          </HrPanel>

          <HrPanel delay={5}>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div>
                <Label>{t("hr.payrollRuns.filterMethod")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="wps">WPS</SelectItem>
                    <SelectItem value="cheque">{t("hr.payrollRuns.cheque")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("hr.payrollRuns.bankTransfer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canExport ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportMut.isPending}
                    onClick={() => exportMut.mutate("wps")}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    WPS CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportMut.isPending}
                    onClick={() => exportMut.mutate("cheque")}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {t("hr.payrollRuns.cheque")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportMut.isPending}
                    onClick={() => exportMut.mutate("bank_transfer")}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {t("hr.payrollRuns.bankTransfer")}
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="px-4 pb-2 text-xs text-muted-foreground">{t("hr.payrollRuns.wpsNote")}</p>
          </HrPanel>

          <HrPanel flat delay={6} className="overflow-hidden">
            <div className="hr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("hr.payroll.colStaff")}</th>
                    <th>{t("hr.payrollRuns.payment")}</th>
                    <th>{t("hr.payrollRuns.gross")}</th>
                    <th>{t("hr.payrollRuns.net")}</th>
                    <th>{t("hr.payrollRuns.variance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <HrEmptyState message={t("hr.payrollRuns.emptyLines")} icon={Banknote} />
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <p className="font-medium">{line.staffName}</p>
                          <p className="text-xs text-muted-foreground">{line.employeeCode}</p>
                        </td>
                        <td className="text-xs uppercase">{line.paymentMethod}</td>
                        <td className="tabular-nums">{line.grossQar.toFixed(2)}</td>
                        <td className="tabular-nums">{line.netQar.toFixed(2)}</td>
                        <td className="tabular-nums">
                          {line.varianceVsPrev == null ? "—" : line.varianceVsPrev.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

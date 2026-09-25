"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Lock,
  Trash2,
  Unlock,
  Upload,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  advancePayrollPeriod,
  adjustPayrollLine,
  deletePayrollPeriod,
  generatePayrollLines,
  generatePayslips,
  getPayrollExportMatrix,
  lockPayrollPeriod,
  reopenPayrollPeriod,
} from "@/lib/hr-payroll.functions";
import {
  commitPayrollExcelImport,
  exportPayrollExcelMatrix,
  getPayrollPeriodWorkspace,
  markPayrollReconReviewed,
  previewPayrollExcelImport,
} from "@/lib/hr-payroll-import.functions";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { canDeletePayrollPeriod } from "@/lib/hr-payroll";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { usePermission } from "@/hooks/use-permission";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function qar(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Basic / salary cell: authorized payroll viewers see amount or an explicit missing label. */
function payrollBasicCell(snap: Record<string, unknown>, netQar: number): string {
  if (snap.missingCompensation === true) return "No salary set";
  const basic = snap.basicSalary == null ? null : Number(snap.basicSalary);
  if (basic == null || !Number.isFinite(basic)) {
    return netQar <= 0 ? "No salary set" : "—";
  }
  // Day-rate with 0 present days is earned 0, not missing salary.
  return qar(basic);
}

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

async function downloadXlsx(filename: string, sheetName: string, matrix: string[][]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const b64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

type PreviewState = Awaited<ReturnType<typeof previewPayrollExcelImport>> & {
  fileBase64: string;
  fileName: string;
};

const PAGE_SIZE = 25;

export default function HrPayrollPeriodPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ periodId: string }>();
  const periodId = params.periodId;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [allowVariance, setAllowVariance] = useState(false);
  const [adjustLineId, setAdjustLineId] = useState<string | null>(null);
  const [adjustEarn, setAdjustEarn] = useState("");
  const [adjustDed, setAdjustDed] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const canGenerate = usePermission("payroll.generate");
  const canFinance = usePermission("payroll.finance");
  const canLock = usePermission("payroll.lock");
  const canExport = usePermission("payroll.export_wps");

  const detail = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriod(periodId, {
      method,
      category,
      reviewFilter,
      search,
      workplace,
    }),
    queryFn: () =>
      getPayrollPeriodWorkspace({
        periodId,
        paymentMethod: method === "all" ? "all" : (method as "wps" | "cheque" | "bank_transfer" | "cash"),
        employmentCategory: category === "all" ? null : category,
        reviewStatus: reviewFilter === "all" ? null : reviewFilter,
        search: search.trim() || null,
        workplace: workplace.trim() || null,
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

  const exportCsvMut = useMutation({
    mutationFn: (m: "wps" | "cheque" | "bank_transfer") =>
      getPayrollExportMatrix({ periodId, method: m }),
    onSuccess: (res) => {
      downloadCsv(`payroll-${res.month}-${res.method}.csv`, res.matrix);
      if (res.note) toast.message(res.note);
      else toast.success(t("hr.payrollRuns.exported"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportXlsxMut = useMutation({
    mutationFn: (format: "full" | "wps" | "project_staff" | "summary" | "reconciliation") =>
      exportPayrollExcelMatrix({ periodId, format, paymentMethod: method === "all" ? "all" : (method as "wps") }),
    onSuccess: async (res) => {
      await downloadXlsx(
        `payroll-${res.month}-${res.format}.xlsx`,
        res.sheetName,
        res.matrix,
      );
      toast.success("Excel downloaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const period = detail.data?.period;
  const lines = detail.data?.lines ?? [];
  const kpis = detail.data?.kpis;
  const exceptions = detail.data?.exceptions ?? [];
  const recon = detail.data?.reconciliation;
  const adjustments = detail.data?.adjustments ?? [];
  const canDelete = Boolean(canGenerate && period && canDeletePayrollPeriod(period.status));

  const pageCount = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
  const pageLines = lines.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const statusBadge = useMemo(() => {
    if (!period) return null;
    const tone =
      period.status === "locked"
        ? "secondary"
        : period.status === "paid" || period.status === "processed"
          ? "success"
          : period.source === "excel_import"
            ? "outline"
            : "outline";
    return (
      <Badge variant={tone}>
        {t(`hr.payrollRuns.status.${period.status}`, { defaultValue: period.status.replace(/_/g, " ") })}
      </Badge>
    );
  }, [period, t]);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      try {
        const fileBase64 = await fileToBase64(file);
        const res = await previewPayrollExcelImport({
          fileBase64,
          fileName: file.name,
          preferredMonthSheet: null,
        });
        setPreview({ ...res, fileBase64, fileName: file.name });
        toast.success(
          `Preview: ${res.counts.main} monthly + ${res.counts.projectStaff} project staff`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import preview failed");
      }
    });
  };

  const commitImport = () => {
    if (!preview) return;
    run(
      () =>
        commitPayrollExcelImport({
          fileBase64: preview.fileBase64,
          fileName: preview.fileName,
          batchId: preview.batchId,
          allowVariance,
          matchedOnly: true,
        }).then((res) => {
          setPreview(null);
          if (res.periodId && res.periodId !== periodId) {
            window.location.href = `/people/payroll/${res.periodId}`;
          }
          return res;
        }),
      allowVariance
        ? "Historical import committed (variance lines marked for review)"
        : "Historical import committed",
    );
  };

  const reviewBadge = (status: string) => {
    if (status === "matched" || status === "ok" || status === "reviewed") {
      return <Badge variant="success">{status}</Badge>;
    }
    if (status === "variance") {
      return <Badge variant="outline">{status}</Badge>;
    }
    return <Badge variant="destructive">{status}</Badge>;
  };

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
          title={
            period
              ? period.displayName ??
                t("hr.payrollRuns.periodTitle", { month: period.month })
              : t("hr.payrollRuns.periodLoading")
          }
          subtitle={
            period
              ? `${formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)} · ${period.source}`
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
            {period?.reconciledAt ? <Badge variant="success">Reconciled</Badge> : null}
          </div>

          {detail.isError ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {detail.error instanceof Error ? detail.error.message : t("hr.payrollRuns.error")}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <HrKpiTile label="Employees" value={kpis?.employees ?? "—"} delay={0} />
            <HrKpiTile label="Basic" value={kpis ? qar(kpis.basic) : "—"} delay={1} />
            <HrKpiTile label="Allowances" value={kpis ? qar(kpis.allowances) : "—"} delay={1} />
            <HrKpiTile label="Gross" value={kpis ? qar(kpis.gross) : "—"} delay={2} />
            <HrKpiTile label="Regular OT" value={kpis ? qar(kpis.regularOt) : "—"} delay={2} />
            <HrKpiTile label="PH OT" value={kpis ? qar(kpis.phOt) : "—"} delay={2} />
            <HrKpiTile label="Bonus" value={kpis ? qar(kpis.bonus) : "—"} delay={3} />
            <HrKpiTile label="Extra" value={kpis ? qar(kpis.extra) : "—"} delay={3} />
            <HrKpiTile label="Deductions" value={kpis ? qar(kpis.deductions) : "—"} delay={3} />
            <HrKpiTile label="Advances" value={kpis ? qar(kpis.advances) : "—"} delay={3} />
            <HrKpiTile label="Net Payable" value={kpis ? qar(kpis.net) : "—"} delay={4} />
            <HrKpiTile
              label="WPS / Cash / Bank / Cheq"
              value={
                kpis
                  ? `${qar(kpis.wps)} / ${qar(kpis.cash)} / ${qar(kpis.bankTransfer)} / ${qar(kpis.cheque)}`
                  : "—"
              }
              delay={4}
            />
          </div>

          {exceptions.length > 0 ? (
            <HrPanel delay={4} className="mt-3">
              <div className="space-y-2 p-4">
                <p className="text-sm font-medium">Exceptions ({exceptions.length})</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {exceptions.slice(0, 40).map((ex, i) => (
                    <li key={`${ex.kind}-${ex.employeeName}-${i}`}>
                      <Badge variant={ex.severity === "critical" ? "destructive" : "outline"} className="mr-2">
                        {ex.kind}
                      </Badge>
                      {ex.employeeName}: {ex.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </HrPanel>
          ) : null}

          <HrPanel delay={4} className="mt-3">
            <div className="flex flex-wrap gap-2 p-4">
              {canGenerate ? (
                <Button
                  disabled={pending || period?.status === "locked"}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        const res = await generatePayrollLines({ periodId });
                        const parts = [t("hr.payrollRuns.generated")];
                        if (res.missingCompensation) {
                          parts.push(
                            t("hr.payrollRuns.generateMissingComp", { count: res.missingCompensation }),
                          );
                        }
                        if (res.attendanceBlocked) {
                          parts.push(
                            t("hr.payrollRuns.generateAttendanceBlocked", {
                              count: res.attendanceBlocked,
                            }),
                          );
                        }
                        toast.success(parts.join(" · "));
                        invalidate();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("hr.payrollRuns.error"));
                      }
                    })
                  }
                >
                  {t("hr.payrollRuns.generate")}
                </Button>
              ) : null}
              {canGenerate ? (
                <Button
                  variant="secondary"
                  disabled={pending || period?.status === "locked"}
                  onClick={() =>
                    run(() => advancePayrollPeriod({ periodId }), t("hr.payrollRuns.advanced"))
                  }
                >
                  Advance workflow
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
              {canGenerate ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    Import Excel
                  </Button>
                </>
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
              {canDelete ? (
                <Button
                  variant="outline"
                  className="border-destructive text-destructive"
                  disabled={pending}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {t("hr.payrollRuns.delete")}
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

          {preview ? (
            <HrPanel delay={5} className="mt-3">
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  <p className="font-medium">
                    Preview — {preview.periodName} ({preview.month})
                  </p>
                  <Badge variant={preview.reconciliation.summary.successfullyReconciled ? "success" : "outline"}>
                    {preview.reconciliation.summary.successfullyReconciled
                      ? "Ready to reconcile"
                      : "Needs review"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{preview.note}</p>
                <div className="grid gap-2 sm:grid-cols-4 text-sm">
                  <div>Matched: {preview.reconciliation.summary.matched}</div>
                  <div>Variance: {preview.reconciliation.summary.variance}</div>
                  <div>Unmatched: {preview.reconciliation.summary.unmatched}</div>
                  <div>Excel net: {qar(preview.reconciliation.summary.excelNetTotal)}</div>
                </div>
                <div className="hr-table-wrap max-h-56 overflow-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Excel Net</th>
                        <th>System Net</th>
                        <th>Diff</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.reconciliation.rows.slice(0, 50).map((r) => (
                        <tr key={`${r.employeeName}-${r.status}`}>
                          <td>{r.employeeName}</td>
                          <td className="tabular-nums">{qar(r.excelNetPay)}</td>
                          <td className="tabular-nums">{qar(r.systemNetPay)}</td>
                          <td className="tabular-nums">{qar(r.difference)}</td>
                          <td>{reviewBadge(r.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allowVariance}
                    onChange={(e) => setAllowVariance(e.target.checked)}
                  />
                  Allow commit with unexplained variance (marks lines for review; does not overwrite production generated lines outside import sources)
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending} onClick={commitImport}>
                    Commit historical import
                  </Button>
                  <Button variant="secondary" disabled={pending} onClick={() => setPreview(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </HrPanel>
          ) : null}

          <HrPanel delay={5} className="mt-3">
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div>
                <Label>Search</Label>
                <Input
                  className="w-48"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Name / code / QID"
                />
              </div>
              <div>
                <Label>Workplace</Label>
                <Input
                  className="w-44"
                  value={workplace}
                  onChange={(e) => {
                    setWorkplace(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Filter location"
                />
              </div>
              <div>
                <Label>{t("hr.payrollRuns.filterMethod")}</Label>
                <Select
                  value={method}
                  onValueChange={(v) => {
                    setMethod(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="wps">WPS</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">{t("hr.payrollRuns.bankTransfer")}</SelectItem>
                    <SelectItem value="cheque">{t("hr.payrollRuns.cheque")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="project_staff">Project Staff</SelectItem>
                    <SelectItem value="secondment">Secondment</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Review</Label>
                <Select
                  value={reviewFilter}
                  onValueChange={(v) => {
                    setReviewFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="variance">Variance</SelectItem>
                    <SelectItem value="unmatched">Unmatched</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canExport ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportXlsxMut.isPending}
                    onClick={() => exportXlsxMut.mutate("full")}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Full Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportXlsxMut.isPending}
                    onClick={() => exportXlsxMut.mutate("summary")}
                  >
                    Summary
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportXlsxMut.isPending}
                    onClick={() => exportXlsxMut.mutate("reconciliation")}
                  >
                    Recon Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportXlsxMut.isPending}
                    onClick={() => exportXlsxMut.mutate("project_staff")}
                  >
                    Project Staff
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportCsvMut.isPending}
                    onClick={() => exportCsvMut.mutate("wps")}
                  >
                    WPS CSV
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="px-4 pb-2 text-xs text-muted-foreground">{t("hr.payrollRuns.wpsNote")}</p>
          </HrPanel>

          <HrPanel flat delay={6} className="mt-3 overflow-hidden">
            <div className="hr-table-wrap hr-payroll-grid-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="hr-sticky-col">Employee</th>
                    <th className="hr-sticky-col-2">Code</th>
                    <th>Position</th>
                    <th>Workplace</th>
                    <th>Type</th>
                    <th>Basic</th>
                    <th>Allow.</th>
                    <th>Earned</th>
                    <th>OT Reg</th>
                    <th>OT PH</th>
                    <th>Extra</th>
                    <th>Deduct</th>
                    <th>Net</th>
                    <th>Pay</th>
                    <th>Excel</th>
                    <th>System</th>
                    <th>Var</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLines.length === 0 ? (
                    <tr>
                      <td colSpan={18}>
                        <HrEmptyState message={t("hr.payrollRuns.emptyLines")} icon={Banknote} />
                      </td>
                    </tr>
                  ) : (
                    pageLines.map((line) => {
                      const open = expanded === line.id;
                      const snap = line.snapshot ?? {};
                      return (
                        <Fragment key={line.id}>
                          <tr>
                            <td className="hr-sticky-col">
                              <button
                                type="button"
                                className="flex items-center gap-1 text-left font-medium"
                                onClick={() => setExpanded(open ? null : line.id)}
                              >
                                {open ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {line.staffName}
                              </button>
                            </td>
                            <td className="hr-sticky-col-2 text-xs text-muted-foreground">
                              {line.employeeCode}
                            </td>
                            <td className="text-xs">{line.position ?? "—"}</td>
                            <td className="text-xs">{line.workplace ?? line.locationName ?? "—"}</td>
                            <td className="text-xs">
                              {line.employmentCategory ?? line.employmentType ?? "—"}
                            </td>
                            <td className="tabular-nums">{payrollBasicCell(snap, line.netQar)}</td>
                            <td className="tabular-nums">
                              {snap.missingCompensation === true
                                ? "—"
                                : qar(Number(snap.allowances) || 0)}
                            </td>
                            <td className="tabular-nums">{qar(Number(snap.earnedGross) || line.grossQar)}</td>
                            <td className="tabular-nums">{qar(Number(snap.otPayReg) || 0)}</td>
                            <td className="tabular-nums">{qar(Number(snap.otPayPh) || 0)}</td>
                            <td className="tabular-nums">{qar(Number(snap.extraPay) || 0)}</td>
                            <td className="tabular-nums">
                              {qar(
                                Number(snap.deduction) ||
                                  (Array.isArray(line.deductions)
                                    ? line.deductions.reduce(
                                        (sum, d) =>
                                          sum +
                                          (Number((d as { amountQar?: number }).amountQar) || 0),
                                        0,
                                      )
                                    : 0),
                              )}
                            </td>
                            <td className="tabular-nums font-medium">{qar(line.netQar)}</td>
                            <td className="text-xs uppercase">{line.paymentMethod}</td>
                            <td className="tabular-nums">{qar(line.importedNetQar)}</td>
                            <td className="tabular-nums">{qar(line.systemNetQar)}</td>
                            <td className="tabular-nums">{qar(line.varianceImportQar)}</td>
                            <td>{reviewBadge(line.reviewStatus)}</td>
                          </tr>
                          {open ? (
                            <tr>
                              <td colSpan={18} className="bg-muted/30 whitespace-normal">
                                <div className="grid gap-3 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Notes</p>
                                    <p>{line.notes ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Working days / hours</p>
                                    <p>
                                      {line.workingDays ?? "—"} / {line.workingHours ?? "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Source</p>
                                    <p>{line.lineSource}</p>
                                  </div>
                                  <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
                                    {canFinance && line.reviewStatus === "variance" ? (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={pending}
                                        onClick={() =>
                                          run(
                                            () => markPayrollReconReviewed({ lineId: line.id }),
                                            "Marked reviewed",
                                          )
                                        }
                                      >
                                        Mark variance reviewed
                                      </Button>
                                    ) : null}
                                    {canFinance ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setAdjustLineId(line.id);
                                          setAdjustEarn("");
                                          setAdjustDed("");
                                          setAdjustNotes(line.notes ?? "");
                                        }}
                                      >
                                        Adjust line
                                      </Button>
                                    ) : null}
                                  </div>
                                  {adjustLineId === line.id ? (
                                    <div className="sm:col-span-2 lg:col-span-3 grid gap-2 rounded border p-3 sm:grid-cols-4">
                                      <div>
                                        <Label>Other earnings</Label>
                                        <Input
                                          value={adjustEarn}
                                          onChange={(e) => setAdjustEarn(e.target.value)}
                                          type="number"
                                        />
                                      </div>
                                      <div>
                                        <Label>Other deductions</Label>
                                        <Input
                                          value={adjustDed}
                                          onChange={(e) => setAdjustDed(e.target.value)}
                                          type="number"
                                        />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <Label>Reason / notes</Label>
                                        <Input
                                          value={adjustNotes}
                                          onChange={(e) => setAdjustNotes(e.target.value)}
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        disabled={pending}
                                        onClick={() =>
                                          run(
                                            () =>
                                              adjustPayrollLine({
                                                lineId: line.id,
                                                otherEarningsQar: adjustEarn
                                                  ? Number(adjustEarn)
                                                  : null,
                                                otherDeductionsQar: adjustDed
                                                  ? Number(adjustDed)
                                                  : null,
                                                notes: adjustNotes || null,
                                              }),
                                            "Line adjusted",
                                          )
                                        }
                                      >
                                        Save adjustment
                                      </Button>
                                    </div>
                                  ) : null}
                                  <div
                                    className="sm:col-span-2 lg:col-span-3 rounded border bg-background p-3"
                                    id={`payslip-${line.id}`}
                                  >
                                    <p className="font-medium">Payslip — {period?.month}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {line.staffName} · {line.employeeCode} · QAR
                                    </p>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                      <span>Gross</span>
                                      <span className="tabular-nums text-end">{qar(line.grossQar)}</span>
                                      <span>Net payable</span>
                                      <span className="tabular-nums text-end font-medium">{qar(line.netQar)}</span>
                                    </div>
                                    <Button
                                      className="mt-2"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.print()}
                                    >
                                      Print
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span>
                {lines.length} rows · page {page + 1}/{pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </HrPanel>

          {recon && recon.rows.length > 0 ? (
            <HrPanel delay={7} className="mt-3">
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">Reconciliation</p>
                  <Badge variant={recon.successfullyReconciled ? "success" : "outline"}>
                    {recon.successfullyReconciled ? "Successfully reconciled" : "Open differences"}
                  </Badge>
                </div>
                <div className="hr-table-wrap max-h-64 overflow-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Excel Net Pay</th>
                        <th>System Net Pay</th>
                        <th>Difference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recon.rows.map((r) => (
                        <tr key={`${r.employeeName}-${r.excelNetPay}`}>
                          <td>{r.employeeName}</td>
                          <td className="tabular-nums">{qar(r.excelNetPay)}</td>
                          <td className="tabular-nums">{qar(r.systemNetPay)}</td>
                          <td className="tabular-nums">{qar(r.difference)}</td>
                          <td>{reviewBadge(r.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </HrPanel>
          ) : null}

          {adjustments.length > 0 ? (
            <HrPanel delay={8} className="mt-3">
              <div className="space-y-2 p-4">
                <p className="font-medium">Pending adjustments (incl. Eid OT)</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {adjustments.map((a) => (
                    <li key={String(a.id)}>
                      <Badge variant="outline" className="mr-2">
                        {String(a.adj_type)}
                      </Badge>
                      {qar(Number(a.amount_qar))} · {String(a.status)} · {String(a.reason ?? "")}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Unapproved adjustments and OT do not enter final net automatically.
                </p>
              </div>
            </HrPanel>
          ) : null}
        </HrSection>
      </HrShell>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.payrollRuns.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {period
                ? t("hr.payrollRuns.deleteConfirm", { month: period.month })
                : t("hr.payrollRuns.delete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !period}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!period) return;
                startTransition(async () => {
                  try {
                    await deletePayrollPeriod({ periodId, confirmMonth: period.month });
                    toast.success(t("hr.payrollRuns.deleted"));
                    window.location.href = "/people/payroll";
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("hr.payrollRuns.error"));
                  }
                });
              }}
            >
              {t("hr.payrollRuns.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CapabilityGate>
  );
}

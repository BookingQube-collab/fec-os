"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, ClipboardCheck, Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import {
  formatPayrollBlockReasons,
  payrollBlockReasonLabel,
  type PayrollStaffRow,
} from "@/lib/attendance-hr/payroll";
import {
  defaultPayrollPeriod,
  formatPayrollRange,
  monthBounds,
} from "@/lib/attendance-hr/roster-period";
import { formatOtPolicySummary } from "@/lib/hr-advanced";
import { getOtPolicy } from "@/lib/hr-announcements.functions";
import { createPayrollPeriod, listPayrollPeriods } from "@/lib/hr-payroll.functions";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

function ymdParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function monthParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  return value;
}

export default function HrPayrollPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get("locationId");
    if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl)) return fromUrl;
    return storeLocationId || "all";
  });
  const [{ month, dateFrom, dateTo }, setPeriod] = useState(() => {
    const defaults = defaultPayrollPeriod(
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }),
    );
    const from = ymdParam(searchParams.get("from"));
    const to = ymdParam(searchParams.get("to"));
    const m = monthParam(searchParams.get("month"));
    if (from && to && from <= to) {
      return { month: m ?? from.slice(0, 7), dateFrom: from, dateTo: to };
    }
    if (m) {
      const bounds = monthBounds(m);
      return { month: m, dateFrom: bounds.dateFrom, dateTo: bounds.dateTo };
    }
    return defaults;
  });
  const [createMonth, setCreateMonth] = useState(month);
  const [fixRow, setFixRow] = useState<PayrollStaffRow | null>(null);
  const [pending, startTransition] = useTransition();
  const canGenerate = usePermission("payroll.generate");
  const { data: sites } = useSites();
  const loc = locationId === "all" ? null : locationId;
  const fixReasons = fixRow ? formatPayrollBlockReasons(fixRow.blockReasons ?? []) : [];
  const fixDays = (fixRow?.blockDays ?? []).filter((d) => d.workDate).slice(0, 40);

  const payroll = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "payroll", locationId: loc, dateFrom, dateTo }),
    queryFn: () => getPayrollAttendanceSummary({ locationId: loc, dateFrom, dateTo }),
    staleTime: STALE.people,
  });

  const periods = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods(),
    queryFn: () => listPayrollPeriods({ status: "all" }),
    staleTime: STALE.people,
  });

  const otPolicy = useQuery({
    queryKey: queryKeys.people.hrOtPolicy(),
    queryFn: () => getOtPolicy(),
    staleTime: STALE.people,
  });

  const otHint = otPolicy.data
    ? formatOtPolicySummary({
        overtimeAfterMinutes: otPolicy.data.overtimeAfterMinutes,
        maxDailyOtMinutes: otPolicy.data.maxDailyOtMinutes,
        maxWeeklyOtMinutes: otPolicy.data.maxWeeklyOtMinutes,
        requiresPreapproval: otPolicy.data.requiresPreapproval,
      })
    : null;

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: "payroll", from: dateFrom, to: dateTo });
    if (loc) params.set("locationId", loc);
    return `/api/people/attendance-hr/export?${params.toString()}`;
  }, [dateFrom, dateTo, loc]);

  const rows = payroll.data?.rows ?? [];
  const blocked = rows.filter((r) => !r.payrollReady);
  const ready = rows.filter((r) => r.payrollReady);

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
          kicker={t("hr.payroll.kicker")}
          title={t("hr.payroll.title")}
          subtitle={t("hr.payroll.subtitle", { range: formatPayrollRange(dateFrom, dateTo, i18n.language) })}
        >
          <HrPanel delay={0}>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("hr.payrollRuns.periodsTitle")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("hr.payrollRuns.periodsHint")}</p>
                </div>
                {canGenerate ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <Label htmlFor="hr-payroll-create-month">{t("hr.payroll.month")}</Label>
                      <Input
                        id="hr-payroll-create-month"
                        type="month"
                        value={createMonth}
                        onChange={(e) => setCreateMonth(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={pending || !createMonth}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const created = await createPayrollPeriod({ month: createMonth });
                            toast.success(t("hr.payrollRuns.created"));
                            void qc.invalidateQueries({ queryKey: queryKeys.people.hrPayrollPeriods() });
                            window.location.href = `/people/payroll/${created.id}`;
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : t("hr.payrollRuns.error"));
                          }
                        });
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t("hr.payrollRuns.create")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const month = "2026-08";
                            const existing = (periods.data ?? []).find((p) => p.month === month);
                            if (existing) {
                              window.location.href = `/people/payroll/${existing.id}`;
                              return;
                            }
                            const created = await createPayrollPeriod({
                              month,
                              notes: "August 2026 — open period then use Import Excel for historical workbook",
                            });
                            toast.success("August 2026 period ready — use Import Excel on the period page");
                            void qc.invalidateQueries({ queryKey: queryKeys.people.hrPayrollPeriods() });
                            window.location.href = `/people/payroll/${created.id}`;
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : t("hr.payrollRuns.error"));
                          }
                        });
                      }}
                    >
                      August 2026 import…
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="hr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("hr.payroll.month")}</th>
                      <th>{t("hr.payrollRuns.cycle")}</th>
                      <th>{t("hr.payroll.colStatus")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(periods.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <HrEmptyState message={t("hr.payrollRuns.emptyPeriods")} icon={Banknote} />
                        </td>
                      </tr>
                    ) : (
                      (periods.data ?? []).map((p) => (
                        <tr key={p.id}>
                          <td className="font-medium">
                            {p.displayName ?? p.month}
                            {p.source && p.source !== "generated" ? (
                              <span className="ml-2 text-xs text-muted-foreground">({p.source})</span>
                            ) : null}
                          </td>
                          <td className="text-xs">
                            {formatPayrollRange(p.dateFrom, p.dateTo, i18n.language)}
                          </td>
                          <td>
                            <Badge variant={p.status === "locked" ? "secondary" : "outline"}>
                              {t(`hr.payrollRuns.status.${p.status}`, { defaultValue: p.status })}
                            </Badge>
                          </td>
                          <td className="text-end">
                            <Button variant="secondary" size="sm" asChild>
                              <Link href={`/people/payroll/${p.id}`}>{t("common.view")}</Link>
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </HrPanel>

          <HrPanel delay={1}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <div>
                <Label htmlFor="hr-payroll-month">{t("hr.payrollRuns.readinessMonth")}</Label>
                <Input
                  id="hr-payroll-month"
                  type="month"
                  value={month}
                  onChange={(e) => setPeriod({ month: e.target.value, ...monthBounds(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("hr.payroll.location")}</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allBranches")}</SelectItem>
                    {(sites ?? []).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {formatLocationLabel(site.code, site.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 lg:col-span-2">
                <Button asChild>
                  <a href={exportHref}>{t("hr.payroll.export")}</a>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/people/attendance/corrections">
                    <ClipboardCheck className="mr-1 h-4 w-4" />
                    {t("hr.payroll.corrections")}
                  </Link>
                </Button>
              </div>
            </div>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground sm:px-5">
              {t("hr.payrollRuns.readinessHint")}
            </p>
          </HrPanel>

          {otHint ? (
            <HrPanel delay={1}>
              <div className="hr-notice">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("hr.payroll.otPolicy")}
                  </p>
                  <p className="mt-1 text-sm font-medium">{otHint}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("hr.payroll.otPolicyHint")}</p>
                </div>
              </div>
            </HrPanel>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <HrKpiTile
              label={t("hr.payroll.ready")}
              value={payroll.data?.readyCount ?? ready.length}
              tone="ok"
              delay={2}
            />
            <HrKpiTile
              label={t("hr.payroll.blocked")}
              value={payroll.data?.blockedCount ?? blocked.length}
              tone="alert"
              delay={3}
            />
          </div>

          <HrPanel flat delay={4} className="overflow-hidden">
            <div className="hr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("hr.payroll.colStaff")}</th>
                    <th>{t("hr.payroll.colLocation")}</th>
                    <th>{t("hr.payroll.colPresent")}</th>
                    <th>{t("hr.payroll.colMissed")}</th>
                    <th>{t("hr.payroll.colOt")}</th>
                    <th>{t("hr.payroll.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <HrEmptyState message={t("hr.payroll.empty")} icon={Banknote} />
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.staffId}>
                        <td>
                          <p className="font-medium">{row.staffName}</p>
                          <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
                        </td>
                        <td className="text-xs">{row.locationLabel ?? "—"}</td>
                        <td className="tabular-nums">{row.daysPresent}</td>
                        <td className="tabular-nums">{row.missedPunches}</td>
                        <td className="tabular-nums">{Math.round((row.overtimeMinutes / 60) * 100) / 100}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={row.payrollReady ? "success" : "destructive"}>
                              {row.payrollReady ? t("hr.payroll.readyBadge") : t("hr.payroll.blockedBadge")}
                            </Badge>
                            {!row.payrollReady ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-1.5 text-destructive"
                                aria-label={t("hr.payroll.fix")}
                                onClick={() => setFixRow(row)}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span className="text-xs underline underline-offset-2">{t("hr.payroll.fix")}</span>
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HrPanel>
        </HrSection>

        <Dialog open={Boolean(fixRow)} onOpenChange={(open) => !open && setFixRow(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("hr.payroll.fixTitle")}</DialogTitle>
              <DialogDescription>
                {fixRow
                  ? `${fixRow.staffName}${fixRow.employeeCode ? ` · ${fixRow.employeeCode}` : ""}`
                  : null}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t("hr.payroll.fixHint")}</p>
              {fixReasons.length > 0 ? (
                <ul className="space-y-1.5">
                  {fixReasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <span className="font-medium">{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{t("hr.payroll.fixNoReasons")}</p>
              )}
              {fixDays.length > 0 ? (
                <div>
                  <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("hr.payroll.fixDays")}
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded border p-2 text-xs">
                    {fixDays.map((d) => (
                      <li key={`${d.workDate}-${d.code}`} className="flex justify-between gap-2">
                        <span className="tabular-nums text-muted-foreground">{d.workDate}</span>
                        <span>{payrollBlockReasonLabel(d.code)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="secondary" asChild>
                <Link href="/people/attendance/corrections">{t("hr.payroll.fixOpenCorrections")}</Link>
              </Button>
              <Button type="button" onClick={() => setFixRow(null)}>
                {t("common.close", { defaultValue: "Close" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </HrShell>
    </CapabilityGate>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

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
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import {
  defaultPayrollPeriod,
  formatPayrollRange,
  monthBounds,
} from "@/lib/attendance-hr/roster-period";
import { formatOtPolicySummary } from "@/lib/hr-advanced";
import { getOtPolicy } from "@/lib/hr-announcements.functions";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

export default function HrPayrollPage() {
  const { t, i18n } = useTranslation();
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [locationId, setLocationId] = useState(storeLocationId || "all");
  const [{ month, dateFrom, dateTo }, setPeriod] = useState(() =>
    defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" })),
  );
  const { data: sites } = useSites();
  const loc = locationId === "all" ? null : locationId;

  const payroll = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "payroll", locationId: loc, dateFrom, dateTo }),
    queryFn: () => getPayrollAttendanceSummary({ locationId: loc, dateFrom, dateTo }),
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
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <div>
                <Label htmlFor="hr-payroll-month">{t("hr.payroll.month")}</Label>
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
                          <Badge variant={row.payrollReady ? "success" : "destructive"}>
                            {row.payrollReady ? t("hr.payroll.readyBadge") : t("hr.payroll.blockedBadge")}
                          </Badge>
                          {!row.payrollReady ? (
                            <Link href="/people/attendance/corrections" className="ms-2 text-xs underline underline-offset-2">
                              {t("hr.payroll.fix")}
                            </Link>
                          ) : null}
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

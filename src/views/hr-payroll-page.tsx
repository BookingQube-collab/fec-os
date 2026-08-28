"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
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
        <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.payroll.noAccess")}</p>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Banknote}
          kicker={t("hr.payroll.kicker")}
          title={t("hr.payroll.title")}
          subtitle={t("hr.payroll.subtitle", { range: formatPayrollRange(dateFrom, dateTo, i18n.language) })}
        />

        <NeumorphicCard className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="flex items-end gap-2">
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
        </NeumorphicCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <NeumorphicCard className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("hr.payroll.ready")}</p>
            <p className="mt-1 text-2xl font-semibold">{payroll.data?.readyCount ?? ready.length}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("hr.payroll.blocked")}</p>
            <p className="mt-1 text-2xl font-semibold">{payroll.data?.blockedCount ?? blocked.length}</p>
          </NeumorphicCard>
        </div>

        <NeumorphicCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colStaff")}</th>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colLocation")}</th>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colPresent")}</th>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colMissed")}</th>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colOt")}</th>
                <th className="px-3 py-2 text-left">{t("hr.payroll.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("hr.payroll.empty")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.staffId} className="border-t">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.staffName}</p>
                      <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">{row.locationLabel ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{row.daysPresent}</td>
                    <td className="px-3 py-2 tabular-nums">{row.missedPunches}</td>
                    <td className="px-3 py-2 tabular-nums">{Math.round((row.overtimeMinutes / 60) * 100) / 100}</td>
                    <td className="px-3 py-2">
                      <Badge variant={row.payrollReady ? "success" : "destructive"}>
                        {row.payrollReady ? t("hr.payroll.readyBadge") : t("hr.payroll.blockedBadge")}
                      </Badge>
                      {!row.payrollReady ? (
                        <Link href="/people/attendance/corrections" className="ml-2 text-xs underline">
                          {t("hr.payroll.fix")}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}

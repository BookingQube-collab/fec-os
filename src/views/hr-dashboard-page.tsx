"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrDayBoard, type HrDayOverview } from "@/components/hr/hr-day-board";
import { useRegisterHrAssist } from "@/components/hr/hr-people-assist";
import { OrgDepartmentsFilter } from "@/components/people/exclude-org-departments-filter";
import { FecEmptyState, FecFilter, FecFilterGroup, FecPageHeader, FecSkeleton } from "@/components/fec";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePeopleDashboard } from "@/hooks/queries/usePeopleDashboard";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import {
  ALL_ORG_DEPARTMENTS_CHECKED,
  activeShowOnlyOrgDepartments,
  type OrgDepartmentChecks,
} from "@/lib/exclude-org-departments";
import { getHrOverview } from "@/lib/hr-overview.functions";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { Users } from "lucide-react";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

/** Calendar month containing `todayYmd` (1st through the last day). FEC month stays on `defaultPayrollPeriod`. */
function calendarMonthPeriod(todayYmd: string): { dateFrom: string; dateTo: string } {
  const month = todayYmd.slice(0, 7);
  const [year, mo] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(last).padStart(2, "0")}` };
}

export default function HrDashboardPage() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const { data: sites } = useSites();
  const canPayroll = usePermission("payroll.view");
  const [locationId, setLocationId] = useState("all");
  const [periodMode, setPeriodMode] = useState<"fec" | "month">("fec");
  const [orgChecks, setOrgChecks] = useState<OrgDepartmentChecks>(ALL_ORG_DEPARTMENTS_CHECKED);

  const today = qatarToday();
  const bounds = periodMode === "month" ? calendarMonthPeriod(today) : defaultPayrollPeriod(today);
  const showOnly = activeShowOnlyOrgDepartments(orgChecks, "all");
  const locationFilter = locationId === "all" ? null : locationId;

  const displayName = profile?.display_name?.trim() || user?.email?.split("@")[0] || "";
  const directory = usePeopleDashboard({ locationId: locationFilter });

  const overview = useQuery({
    queryKey: queryKeys.people.hrOverview({
      locationId: locationFilter,
      dateFrom: bounds.dateFrom,
      dateTo: bounds.dateTo,
      showOnly,
    }),
    queryFn: () =>
      getHrOverview({
        locationId: locationFilter,
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        showOnlyDepartments: showOnly.length ? [...showOnly] : undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: STALE.people,
  });

  const d = overview.data;
  const overviewState = overview.isError && !d ? "error" : overview.isLoading && !d ? "loading" : "ready";
  const assistPatch = useMemo(
    () => ({
      locationId: locationFilter,
      dateFrom: bounds.dateFrom,
      dateTo: bounds.dateTo,
      commandState: overviewState === "error" ? ("error" as const) : overviewState === "loading" ? ("loading" as const) : ("ready" as const),
      command: d
        ? {
            periodFrom: bounds.dateFrom,
            periodTo: bounds.dateTo,
            today: d.today,
            headcount: d.headcount,
            onLeaveToday: d.onLeaveToday,
            expiredDocs: d.expiredDocs,
            expiringDocs: d.expiringDocs,
            pendingLeave: d.pendingLeave,
            presentToday: d.presentToday,
          }
        : null,
    }),
    [locationFilter, bounds.dateFrom, bounds.dateTo, overviewState, d],
  );
  useRegisterHrAssist(assistPatch);

  const filters = (
    <div className="flex flex-wrap items-end gap-3 px-1">
      <div className="min-w-[10rem] flex-1 sm:max-w-xs">
        <Label htmlFor="hr-dashboard-site">{t("common.site")}</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger id="hr-dashboard-site" className="mt-1.5 bg-card">
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
      <div className="min-w-[12rem] flex-1 sm:max-w-xs">
        <Label>{t("common.department")}</Label>
        <OrgDepartmentsFilter checks={orgChecks} onChange={setOrgChecks} className="mt-1.5" />
      </div>
      <div className="min-w-0">
        <Label>{t("hr.dashboard.filters.period")}</Label>
        <FecFilterGroup className="mt-1.5">
          <FecFilter active={periodMode === "fec"} onClick={() => setPeriodMode("fec")}>
            {t("hr.dashboard.filters.fecMonth")}
          </FecFilter>
          <FecFilter active={periodMode === "month"} onClick={() => setPeriodMode("month")}>
            {t("hr.dashboard.filters.thisMonth")}
          </FecFilter>
        </FecFilterGroup>
      </div>
    </div>
  );

  return (
    <CapabilityGate
      capability="people.view_roster"
      fallback={
        <div className="min-w-0 space-y-6">
          <FecPageHeader
            icon={Users}
            kicker={t("hr.dashboard.kicker")}
            title={t("hr.dashboard.title")}
            subtitle={t("hr.dashboard.noAccess")}
          />
        </div>
      }
    >
      <div className="min-w-0">
        {overviewState === "error" ? (
          <div className="space-y-4">
            {filters}
            <FecEmptyState message={t("hr.dashboard.loadError")} />
          </div>
        ) : overviewState === "loading" || !d ? (
          <div className="space-y-4">
            {filters}
            <div className="grid gap-3 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <FecSkeleton key={i} className="h-36 rounded-3xl" />
              ))}
            </div>
          </div>
        ) : (
          <HrDayBoard
            data={d as HrDayOverview}
            canPayroll={canPayroll}
            filters={filters}
            displayName={displayName}
            salaryRows={directory.data?.salary_by_location ?? null}
            salaryLoading={directory.isPending && !directory.data}
            recentHires={directory.data?.recent_hires ?? []}
            directoryDepartments={directory.data?.staff_by_department ?? []}
            directoryLocations={directory.data?.staff_by_location ?? []}
          />
        )}
      </div>
    </CapabilityGate>
  );
}

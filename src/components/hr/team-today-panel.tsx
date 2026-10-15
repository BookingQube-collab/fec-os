"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { getTeamToday } from "@/lib/hr/team-today.functions";
import type { TeamTodayStatus } from "@/lib/hr/team-today";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const STATUS_VARIANT: Record<TeamTodayStatus, "success" | "warning" | "info" | "muted"> = {
  present: "success",
  annual_leave: "warning",
  sick_leave: "info",
  not_present: "muted",
};

function statusKey(status: TeamTodayStatus): string {
  if (status === "annual_leave") return "hr.teamToday.status.annualLeave";
  if (status === "sick_leave") return "hr.teamToday.status.sickLeave";
  if (status === "not_present") return "hr.teamToday.status.notPresent";
  return "hr.teamToday.status.present";
}

export function TeamTodayPanel() {
  const { t } = useTranslation();
  const team = useQuery({
    queryKey: queryKeys.people.teamToday(),
    queryFn: () => getTeamToday({}),
    staleTime: STALE.people,
  });

  const data = team.data;
  const unique = new Map<string, TeamTodayStatus>();
  for (const group of data?.groups ?? []) {
    for (const row of group.people) unique.set(row.staffId, row.status);
  }
  const counts = { present: 0, annual_leave: 0, sick_leave: 0, not_present: 0 };
  for (const status of unique.values()) counts[status] += 1;

  const siteLabel = data?.singleLocation ? data.groups[0]?.label || t("hr.teamToday.noSite") : "";
  const subtitle = !data
    ? t("hr.teamToday.subtitle")
    : data.singleLocation
      ? t("hr.teamToday.subtitleSite", { site: siteLabel, date: formatWorkDateDdMmYyyy(data.today) })
      : data.companyWide
        ? t("hr.teamToday.subtitleCompany", { date: formatWorkDateDdMmYyyy(data.today) })
        : t("hr.teamToday.subtitleLocations", { date: formatWorkDateDdMmYyyy(data.today) });

  return (
    <section className="rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 stroke-[1.5] text-muted-foreground" />
            {t("hr.teamToday.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {data && unique.size > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("hr.teamToday.summary", {
              present: counts.present,
              annual: counts.annual_leave,
              sick: counts.sick_leave,
              absent: counts.not_present,
            })}
          </p>
        ) : null}
      </div>

      {team.isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ) : team.isError ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t("hr.teamToday.loadError")}</p>
      ) : !data || data.groups.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t("hr.teamToday.empty")}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {data.groups.map((group) => (
            <div key={group.locationId ?? "none"}>
              {data.singleLocation ? null : (
                <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label || t("hr.teamToday.noSite")}
                </h3>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-start text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">{t("hr.teamToday.colName")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("hr.teamToday.colRole")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("hr.teamToday.colToday")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("hr.teamToday.colAnnual")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.people.map((row) => (
                      <tr key={row.staffId} className="border-b border-border/30 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-foreground">{row.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.jobTitle || "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={STATUS_VARIANT[row.status]}>{t(statusKey(row.status))}</Badge>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                          {row.annualRemaining == null ? "—" : row.annualRemaining}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

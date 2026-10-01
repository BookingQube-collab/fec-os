"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useSites } from "@/hooks/queries/useSites";
import { locationRosterCoverage } from "@/lib/attendance-hr/roster-location-coverage";
import { listUploadedRosterAssignments } from "@/lib/attendance-hr/roster-register.functions";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type RosterLocationCoverageProps = {
  dateFrom: string;
  dateTo: string;
};

/**
 * Period coverage for every active site the Location filter uses.
 * Grid location, staff, and department filters are intentionally not applied.
 */
export function RosterLocationCoverage({ dateFrom, dateTo }: RosterLocationCoverageProps) {
  const { t } = useTranslation();
  const sites = useSites();
  const coverage = useQuery({
    queryKey: queryKeys.people.rosterRegister({
      dateFrom,
      dateTo,
      locationCoverage: true,
    }),
    queryFn: () =>
      listUploadedRosterAssignments({
        dateFrom,
        dateTo,
        sourceUploadOnly: false,
      }),
    staleTime: STALE.people,
    enabled: Boolean(dateFrom && dateTo),
  });

  const items = useMemo(
    () => locationRosterCoverage(sites.data ?? [], coverage.data?.rows ?? [], (site) => formatLocationRecord(site)),
    [sites.data, coverage.data?.rows],
  );

  if (sites.isError || coverage.isError) {
    return (
      <section className="surface-card p-4" aria-label={t("people.roster.locationCoverageTitle")}>
        <p className="text-sm text-destructive">{t("people.roster.locationCoverageLoadFailed")}</p>
      </section>
    );
  }

  if (!sites.data || !coverage.data) {
    return (
      <section className="surface-card p-4" aria-label={t("people.roster.locationCoverageTitle")}>
        <p className="text-sm text-muted-foreground">{t("people.roster.locationCoverageLoading")}</p>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="surface-card p-4" aria-label={t("people.roster.locationCoverageTitle")}>
      <ul className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
        {items.map((item) => {
          const status = item.uploaded
            ? t("people.roster.locationCoverageUploaded")
            : t("people.roster.locationCoverageMissingStatus");
          const rowsLabel = t("people.roster.registerCount", { count: item.rowCount });
          const staffLabel = t("people.roster.registerStaffCount", { count: item.staffCount });
          return (
            <li
              key={item.id}
              className={cn(
                "flex min-h-11 w-[12.5rem] shrink-0 snap-start flex-col justify-center gap-1 rounded-xl border bg-card px-3 py-2 sm:w-auto sm:min-w-[12rem] sm:max-w-[18rem]",
                item.uploaded ? "border-border/70" : "border-[color:var(--color-warning)]",
              )}
              aria-label={
                item.uploaded ? `${item.label}: ${status}, ${rowsLabel}, ${staffLabel}` : `${item.label}: ${status}`
              }
            >
              <p className="truncate text-sm font-medium leading-tight text-foreground" title={item.label}>
                {item.label}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={item.uploaded ? "success" : "warning"}>{status}</Badge>
                {item.uploaded ? (
                  <span className="text-xs text-muted-foreground">
                    {rowsLabel}
                    <span aria-hidden="true"> · </span>
                    {staffLabel}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

/* Hallmark · component: panel · genre: modern-minimal · theme: FEC HR day
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import { getTeamToday } from "@/lib/hr/team-today.functions";
import {
  countTeamTodayPeople,
  filterTeamTodayByLocation,
  summarizeTeamTodayByLocation,
  type TeamTodayLocationSummary,
  type TeamTodayStatus,
} from "@/lib/hr/team-today";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

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

/** Split `CODE — Name` labels from formatLocationLabel into hierarchy parts. */
function splitSiteLabel(label: string): { code: string; name: string | null } {
  const parts = label
    .split(/\s*[—–]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { code: parts[0]!, name: parts.slice(1).join(" — ") };
  return { code: label.trim() || "—", name: null };
}

type TeamTodayPanelProps = {
  /** When set, only that site. When null, a short per-site summary. */
  locationId?: string | null;
  /** Nested under Your day — no second heavy card chrome. */
  embedded?: boolean;
  /** When set, site rows drill into names (and clear returns to the summary). */
  onSelectLocation?: (locationId: string | null) => void;
};

export function TeamTodayPanel({
  locationId = null,
  embedded = false,
  onSelectLocation,
}: TeamTodayPanelProps) {
  const { t } = useTranslation();
  const team = useQuery({
    queryKey: queryKeys.people.teamToday(locationId),
    queryFn: () => getTeamToday({}),
    staleTime: STALE.people,
    select: (raw) => filterTeamTodayByLocation(raw, locationId),
  });

  const data = team.data;
  const counts = data ? countTeamTodayPeople(data.groups) : null;
  const siteSummaries =
    data && !locationId && !data.singleLocation ? summarizeTeamTodayByLocation(data.groups) : null;
  const people =
    data && (locationId || data.singleLocation)
      ? data.groups.flatMap((group) => group.people)
      : [];
  const siteLabel =
    data?.singleLocation || locationId
      ? data?.groups[0]?.label || (locationId ? t("hr.teamToday.selectedSite") : t("hr.teamToday.noSite"))
      : "";
  const canDrill = Boolean(onSelectLocation);
  const showingPeople = Boolean(locationId || data?.singleLocation);
  const subtitle = !data
    ? t("hr.teamToday.subtitle")
    : showingPeople
      ? t("hr.teamToday.subtitleSite", { site: siteLabel, date: formatWorkDateDdMmYyyy(data.today) })
      : canDrill
        ? t("hr.teamToday.subtitleBrief", { date: formatWorkDateDdMmYyyy(data.today) })
        : t("hr.teamToday.subtitleLocations", { date: formatWorkDateDdMmYyyy(data.today) });

  return (
    <section
      className={cn(
        embedded
          ? "rounded-xl border border-border/40 bg-background/60"
          : "rounded-2xl border border-border/50 bg-card shadow-elevated-xs",
      )}
    >
      <div className="flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 shrink-0 stroke-[1.5] text-muted-foreground" />
            {t("hr.teamToday.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          {canDrill && locationId ? (
            <button
              type="button"
              onClick={() => onSelectLocation?.(null)}
              className="mt-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("hr.teamToday.showAllSites")}
            </button>
          ) : null}
        </div>
        {counts && counts.present + counts.annual_leave + counts.sick_leave + counts.not_present > 0 ? (
          <div
            className="flex flex-wrap gap-1.5 sm:justify-end"
            aria-label={t("hr.teamToday.summaryAria")}
          >
            <Badge variant="success" className="tabular-nums">
              {t("hr.teamToday.chipPresent", { count: counts.present })}
            </Badge>
            <Badge variant="warning" className="tabular-nums">
              {t("hr.teamToday.chipAnnual", { count: counts.annual_leave })}
            </Badge>
            <Badge variant="info" className="tabular-nums">
              {t("hr.teamToday.chipSick", { count: counts.sick_leave })}
            </Badge>
            <Badge variant="muted" className="tabular-nums">
              {t("hr.teamToday.chipAbsent", { count: counts.not_present })}
            </Badge>
          </div>
        ) : null}
      </div>

      {team.isLoading ? (
        <div className="space-y-2 border-t border-border/30 px-3 py-3 sm:px-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </div>
      ) : team.isError ? (
        <p className="border-t border-border/30 px-3 py-4 text-sm text-muted-foreground sm:px-4">
          {t("hr.teamToday.loadError")}
        </p>
      ) : !data || data.groups.length === 0 ? (
        <p className="border-t border-border/30 px-3 py-4 text-sm text-muted-foreground sm:px-4">
          {locationId ? t("hr.teamToday.emptySite") : t("hr.teamToday.empty")}
        </p>
      ) : siteSummaries ? (
        <SiteSummaryTable
          sites={siteSummaries}
          canDrill={canDrill}
          onSelectLocation={onSelectLocation}
        />
      ) : (
        <ul className="divide-y divide-border/30 border-t border-border/30">
          {people.map((row) => (
            <li
              key={row.staffId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm sm:px-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.jobTitle || "—"}</p>
              </div>
              <Badge variant={STATUS_VARIANT[row.status]}>{t(statusKey(row.status))}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SiteSummaryTable({
  sites,
  canDrill,
  onSelectLocation,
}: {
  sites: TeamTodayLocationSummary[];
  canDrill: boolean;
  onSelectLocation?: (locationId: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-t border-border/30">
      <div
        className="hidden grid-cols-[minmax(0,1fr)_repeat(4,minmax(2.75rem,3.5rem))] items-center gap-2 border-b border-border/25 bg-muted/30 px-3 py-1.5 sm:grid sm:px-4"
        aria-hidden
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("hr.teamToday.colSite")}
        </span>
        <span className="text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("hr.teamToday.colIn")}
        </span>
        <span className="text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("hr.teamToday.colLeave")}
        </span>
        <span className="text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("hr.teamToday.colOut")}
        </span>
        <span className="text-end text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("hr.teamToday.colTotal")}
        </span>
      </div>
      <ul className="divide-y divide-border/25">
        {sites.map((site) => {
          const { code, name } = splitSiteLabel(site.label || t("hr.teamToday.noSite"));
          const leave = site.annualLeave + site.sickLeave;
          const rowLabel = t("hr.teamToday.siteRowAria", {
            site: site.label || t("hr.teamToday.noSite"),
            present: site.present,
            leave,
            absent: site.notPresent,
            total: site.total,
          });
          const metrics = (
            <>
              <MetricCell value={site.present} label={t("hr.teamToday.colIn")} tone="present" />
              <MetricCell value={leave} label={t("hr.teamToday.colLeave")} tone="leave" />
              <MetricCell value={site.notPresent} label={t("hr.teamToday.colOut")} tone="out" />
              <MetricCell value={site.total} label={t("hr.teamToday.colTotal")} tone="total" />
            </>
          );

          const body = (
            <>
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{code}</p>
                  {name ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{name}</p>
                  ) : null}
                </div>
                {canDrill && site.locationId ? (
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70 rtl:rotate-180"
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-0 sm:contents">{metrics}</div>
            </>
          );

          if (canDrill && site.locationId) {
            return (
              <li key={site.locationId}>
                <button
                  type="button"
                  onClick={() => onSelectLocation?.(site.locationId)}
                  aria-label={rowLabel}
                  className="grid w-full grid-cols-1 gap-0 px-3 py-2.5 text-start transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/55 sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(2.75rem,3.5rem))] sm:items-center sm:gap-2 sm:px-4"
                >
                  {body}
                </button>
              </li>
            );
          }

          return (
            <li
              key={site.locationId ?? "none"}
              className="grid grid-cols-1 gap-0 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(2.75rem,3.5rem))] sm:items-center sm:gap-2 sm:px-4"
              aria-label={rowLabel}
            >
              {body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MetricCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "present" | "leave" | "out" | "total";
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-muted/25 px-1 py-1 sm:items-end sm:bg-transparent sm:px-0 sm:py-0">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums leading-none",
          tone === "present" && "rag-green",
          tone === "leave" && "rag-amber",
          tone === "out" && "text-muted-foreground",
          tone === "total" && "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
        {label}
      </span>
    </div>
  );
}

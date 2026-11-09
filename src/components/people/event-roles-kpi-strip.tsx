"use client";

/* Hallmark · redesign · Event Roles KPI strip · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Crew / Overview)
 */

import { CalendarCheck2, CalendarDays, HardHat, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type EventRolesKpis = {
  eventName: string | null;
  eventNumber: string | null;
  totalRoles: number;
  shiftRoles: number;
  labourRoles: number;
};

function KpiCard({
  title,
  children,
  icon: Icon,
  iconClass,
  cardClass,
}: {
  title: string;
  children: React.ReactNode;
  icon: LucideIcon;
  iconClass: string;
  cardClass?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]",
        cardClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-1.5">{children}</div>
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
    </article>
  );
}

export function EventRolesKpiStrip({
  kpis,
  isLoading,
  hasEvent,
}: {
  kpis: EventRolesKpis;
  isLoading?: boolean;
  hasEvent: boolean;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[7.25rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  const mixLabel =
    hasEvent && kpis.totalRoles > 0
      ? t("peopleEvent.roles.kpiMix", {
          shift: kpis.shiftRoles,
          labour: kpis.labourRoles,
        })
      : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title={t("peopleEvent.roles.kpiSelectedEvent")}
        icon={CalendarDays}
        iconClass="bg-violet-100 text-[#7c3aed]"
      >
        <p className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {hasEvent ? (kpis.eventName ?? t("peopleEvent.roles.kpiEventFallback")) : "—"}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {hasEvent ? (kpis.eventNumber ?? "—") : t("peopleEvent.roles.pickEventShort")}
        </p>
      </KpiCard>

      <KpiCard
        title={t("peopleEvent.roles.kpiTotalRoles")}
        icon={Users}
        iconClass="bg-emerald-100 text-emerald-700"
      >
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {hasEvent ? kpis.totalRoles : "—"}
        </p>
        {mixLabel ? (
          <span className="mt-2 inline-flex max-w-full items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {mixLabel}
          </span>
        ) : null}
      </KpiCard>

      <KpiCard
        title={t("peopleEvent.roles.kpiShiftRoles")}
        icon={CalendarCheck2}
        iconClass="bg-sky-100 text-sky-700"
        cardClass="bg-sky-50/40"
      >
        <p className="text-2xl font-bold tracking-tight text-sky-800">
          {hasEvent ? kpis.shiftRoles : "—"}
        </p>
      </KpiCard>

      <KpiCard
        title={t("peopleEvent.roles.kpiLabourRoles")}
        icon={HardHat}
        iconClass="bg-orange-100 text-orange-700"
        cardClass="bg-orange-50/40"
      >
        <p className="text-2xl font-bold tracking-tight text-orange-700">
          {hasEvent ? kpis.labourRoles : "—"}
        </p>
      </KpiCard>
    </div>
  );
}

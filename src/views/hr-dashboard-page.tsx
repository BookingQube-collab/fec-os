"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ClipboardList,
  FileText,
  MapPinned,
  Megaphone,
  Palmtree,
  Settings2,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { getHrOverview } from "@/lib/hr-overview.functions";
import { FILTER_CHIP } from "@/lib/ui/command-surface";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const TILE_TINTS: Record<string, KpiTint> = {
  headcount: "sky",
  presentToday: "green",
  onLeaveToday: "amber",
  pendingLeave: "orange",
  fieldCheckedIn: "sky",
  payrollBlocked: "red",
  expiringDocs: "amber",
  openOnboarding: "slate",
  activeAnnouncements: "slate",
};

export default function HrDashboardPage() {
  const { t, i18n } = useTranslation();
  const overview = useQuery({
    queryKey: queryKeys.people.hrOverview({}),
    queryFn: () => getHrOverview({}),
    staleTime: STALE.people,
  });

  const d = overview.data;
  const periodLabel = d
    ? formatPayrollRange(d.period.dateFrom, d.period.dateTo, i18n.language)
    : "—";

  const tiles = [
    { key: "headcount", value: d?.headcount ?? "—", href: "/people", icon: Users },
    { key: "presentToday", value: d?.presentToday ?? "—", href: "/people/attendance/reports", icon: UserCheck },
    { key: "onLeaveToday", value: d?.onLeaveToday ?? "—", href: "/people/leave", icon: Palmtree },
    { key: "pendingLeave", value: d?.pendingLeave ?? "—", href: "/people/leave", icon: ClipboardList },
    { key: "fieldCheckedIn", value: d?.fieldCheckedIn ?? "—", href: "/people/field", icon: MapPinned },
    { key: "payrollBlocked", value: d?.payrollBlocked ?? "—", href: "/people/payroll", icon: Banknote },
    { key: "expiringDocs", value: d?.expiringDocs ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "openOnboarding", value: d?.openOnboarding ?? "—", href: "/people/hr/onboarding", icon: ClipboardList },
    { key: "activeAnnouncements", value: d?.activeAnnouncements ?? "—", href: "/people/hr/announcements", icon: Megaphone },
  ] as const;

  const links = [
    { href: "/people/payroll", labelKey: "hr.dashboard.links.payroll", icon: Banknote },
    { href: "/people/leave", labelKey: "hr.dashboard.links.leave", icon: Palmtree },
    { href: "/people/field", labelKey: "hr.dashboard.links.field", icon: MapPinned },
    { href: "/people/attendance/reports", labelKey: "hr.dashboard.links.attendance", icon: ClipboardList },
    { href: "/people/hr/documents", labelKey: "hr.dashboard.links.documents", icon: FileText },
    { href: "/people/hr/announcements", labelKey: "hr.dashboard.links.announcements", icon: Megaphone },
    { href: "/people/hr/onboarding", labelKey: "hr.dashboard.links.onboarding", icon: ClipboardList },
    { href: "/people/hr/settings", labelKey: "hr.dashboard.links.settings", icon: Settings2 },
    { href: "/people/hr/reports", labelKey: "hr.dashboard.links.reports", icon: FileText },
  ] as const;

  return (
    <CapabilityGate
      capability="people.view_roster"
      fallback={
        <div className="space-y-6">
          <PageHeader
            icon={Users}
            kicker={t("hr.dashboard.kicker")}
            title={t("hr.dashboard.title")}
            subtitle={t("hr.dashboard.noAccess")}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          kicker={t("hr.dashboard.kicker")}
          title={t("hr.dashboard.title")}
          subtitle={t("hr.dashboard.subtitle", { range: periodLabel })}
        />

        {d?.otPolicySummary ? (
          <NeumorphicCard className="p-4 sm:p-5" accent="amber">
            <div className="flex flex-wrap items-start gap-3 pe-2">
              <Timer className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("hr.dashboard.otPolicy")}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{d.otPolicySummary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("hr.dashboard.otPolicyHint")}</p>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href="/people/hr/settings">{t("hr.dashboard.links.settings")}</Link>
              </Button>
            </div>
          </NeumorphicCard>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <TintedKpiCard
              key={tile.key}
              title={t(`hr.dashboard.tiles.${tile.key}`)}
              value={tile.value}
              href={tile.href}
              icon={tile.icon}
              tint={TILE_TINTS[tile.key] ?? "slate"}
              viewLabel={t("common.view")}
            />
          ))}
        </div>

        <NeumorphicCard className="p-4 sm:p-5">
          <nav className="flex flex-wrap gap-2" aria-label={t("hr.dashboard.title")}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={cn(FILTER_CHIP, "gap-1.5")}>
                <link.icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.6} />
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}

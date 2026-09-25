"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  FileText,
  Hourglass,
  MapPinned,
  Megaphone,
  Palmtree,
  Briefcase,
  Plane,
  Settings2,
  Timer,
  UserCheck,
  Users,
  BarChart3,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import {
  FecButton as Button,
  FecEmptyState,
  FecPageHeader,
  FecStatCard,
  type KpiTint,
} from "@/components/fec";
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
  pendingOt: "orange",
  fieldCheckedIn: "sky",
  payrollBlocked: "red",
  payrollExceptions: "amber",
  expiredDocs: "red",
  expiringDocs: "amber",
  expiringQids: "amber",
  expiringPassports: "amber",
  missingCvs: "orange",
  unattestedEducational: "orange",
  openOnboarding: "slate",
  activeAnnouncements: "slate",
  activeWarnings: "amber",
  thirdWarningEscalations: "red",
  upcomingProbationDecisions: "orange",
  servingNotice: "amber",
  terminationQueue: "red",
  upcomingAirTickets: "sky",
  overdueAirTickets: "red",
  openVacancies: "sky",
  pendingJobRequests: "orange",
  quotaShortage: "amber",
  quotaExcess: "sky",
  joiningSoon: "sky",
  leavingSoon: "amber",
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
    { key: "servingNotice", value: d?.servingNotice ?? "—", href: "/people/hr/resignations", icon: Hourglass },
    { key: "pendingLeave", value: d?.pendingLeave ?? "—", href: "/people/leave", icon: ClipboardList },
    { key: "pendingOt", value: d?.pendingOt ?? "—", href: "/people/hr/ot", icon: Timer },
    { key: "fieldCheckedIn", value: d?.fieldCheckedIn ?? "—", href: "/people/field", icon: MapPinned },
    { key: "payrollBlocked", value: d?.payrollBlocked ?? "—", href: "/people/payroll", icon: Banknote },
    { key: "payrollExceptions", value: d?.payrollExceptions ?? "—", href: "/people/payroll", icon: Banknote },
    { key: "expiredDocs", value: d?.expiredDocs ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "expiringDocs", value: d?.expiringDocs ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "expiringQids", value: d?.expiringQids ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "expiringPassports", value: d?.expiringPassports ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "missingCvs", value: d?.missingCvs ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "unattestedEducational", value: d?.unattestedEducational ?? "—", href: "/people/hr/documents", icon: FileText },
    { key: "openOnboarding", value: d?.openOnboarding ?? "—", href: "/people/hr/onboarding", icon: ClipboardList },
    { key: "activeAnnouncements", value: d?.activeAnnouncements ?? "—", href: "/people/hr/announcements", icon: Megaphone },
    { key: "activeWarnings", value: d?.activeWarnings ?? "—", href: "/people/hr/warnings", icon: AlertTriangle },
    { key: "thirdWarningEscalations", value: d?.thirdWarningEscalations ?? "—", href: "/people/hr/warnings", icon: AlertTriangle },
    { key: "upcomingProbationDecisions", value: d?.upcomingProbationDecisions ?? "—", href: "/people/hr/probation", icon: Hourglass },
    { key: "terminationQueue", value: d?.terminationQueue ?? "—", href: "/people/hr/terminations", icon: AlertTriangle },
    { key: "upcomingAirTickets", value: d?.upcomingAirTickets ?? "—", href: "/people/hr/air-tickets", icon: Plane },
    { key: "overdueAirTickets", value: d?.overdueAirTickets ?? "—", href: "/people/hr/air-tickets", icon: Plane },
    { key: "openVacancies", value: d?.openVacancies ?? "—", href: "/people/recruitment/jobs/admin", icon: Briefcase },
    { key: "pendingJobRequests", value: d?.pendingJobRequests ?? "—", href: "/people/recruitment/jobs/admin", icon: Briefcase },
    { key: "quotaShortage", value: d?.quotaShortage ?? "—", href: "/people/hr/quota", icon: BarChart3 },
    { key: "quotaExcess", value: d?.quotaExcess ?? "—", href: "/people/hr/quota", icon: BarChart3 },
    { key: "joiningSoon", value: d?.joiningSoon ?? "—", href: "/people", icon: UserPlus },
    { key: "leavingSoon", value: d?.leavingSoon ?? "—", href: "/people/hr/resignations", icon: UserMinus },
  ] as const;

  const links = [
    { href: "/people/payroll", labelKey: "hr.dashboard.links.payroll", icon: Banknote },
    { href: "/people/leave", labelKey: "hr.dashboard.links.leave", icon: Palmtree },
    { href: "/people/hr/ot", labelKey: "hr.dashboard.links.ot", icon: Timer },
    { href: "/people/hr/warnings", labelKey: "hr.dashboard.links.warnings", icon: AlertTriangle },
    { href: "/people/hr/probation", labelKey: "hr.dashboard.links.probation", icon: Hourglass },
    { href: "/people/hr/resignations", labelKey: "hr.dashboard.links.resignations", icon: Hourglass },
    { href: "/people/hr/terminations", labelKey: "hr.dashboard.links.terminations", icon: AlertTriangle },
    { href: "/people/hr/air-tickets", labelKey: "hr.dashboard.links.airTickets", icon: Plane },
    { href: "/people/hr/quota", labelKey: "hr.dashboard.links.quota", icon: BarChart3 },
    { href: "/people/recruitment/jobs", labelKey: "hr.dashboard.links.jobRequests", icon: Briefcase },
    { href: "/people/recruitment/jobs/admin", labelKey: "hr.dashboard.links.jobAdmin", icon: Briefcase },
    { href: "/people/field", labelKey: "hr.dashboard.links.field", icon: MapPinned },
    { href: "/people/attendance/reports", labelKey: "hr.dashboard.links.attendance", icon: ClipboardList },
    { href: "/people/hr/documents", labelKey: "hr.dashboard.links.documents", icon: FileText },
    { href: "/people/hr/announcements", labelKey: "hr.dashboard.links.announcements", icon: Megaphone },
    { href: "/people/hr/onboarding", labelKey: "hr.dashboard.links.onboarding", icon: ClipboardList },
    { href: "/people/hr/shift-policy", labelKey: "hr.dashboard.links.shiftPolicy", icon: Timer },
    { href: "/people/hr/settings", labelKey: "hr.dashboard.links.settings", icon: Settings2 },
    { href: "/people/hr/reports", labelKey: "hr.dashboard.links.reports", icon: FileText },
  ] as const;

  const breakdowns = [
    { titleKey: "hr.dashboard.byCategory", rows: d?.breakdowns?.byCategory ?? [] },
    { titleKey: "hr.dashboard.byDepartment", rows: d?.breakdowns?.byDepartment ?? [] },
    { titleKey: "hr.dashboard.byLocation", rows: d?.breakdowns?.byLocation ?? [] },
  ];

  return (
    <CapabilityGate
      capability="people.view_roster"
      fallback={
        <div className="space-y-6">
          <FecPageHeader
            icon={Users}
            kicker={t("hr.dashboard.kicker")}
            title={t("hr.dashboard.title")}
            subtitle={t("hr.dashboard.noAccess")}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <FecPageHeader
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
            <FecStatCard
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {breakdowns.map((block) => (
            <NeumorphicCard key={block.titleKey} className="p-4 sm:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t(block.titleKey)}
              </p>
              {block.rows.length === 0 ? (
                <FecEmptyState message={t("hr.dashboard.breakdownEmpty")} className="mt-2 border-0 bg-transparent" />
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {block.rows.slice(0, 8).map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{row.label}</span>
                      <span className="tabular-nums font-semibold">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </NeumorphicCard>
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

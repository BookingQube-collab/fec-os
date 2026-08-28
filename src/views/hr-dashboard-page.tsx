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
  UserCheck,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { getHrOverview } from "@/lib/hr-overview.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

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
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.dashboard.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          kicker={t("hr.dashboard.kicker")}
          title={t("hr.dashboard.title")}
          subtitle={t("hr.dashboard.subtitle", { range: periodLabel })}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <Link key={tile.key} href={tile.href} className="block">
              <NeumorphicCard className="flex items-center gap-3 p-4 transition hover:opacity-90">
                <tile.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t(`hr.dashboard.tiles.${tile.key}`)}</p>
                  <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
                </div>
              </NeumorphicCard>
            </Link>
          ))}
        </div>

        <NeumorphicCard className="flex flex-wrap gap-2 p-4">
          {links.map((link) => (
            <Button key={link.href} asChild size="sm" variant="secondary">
              <Link href={link.href}>
                <link.icon className="mr-1.5 h-3.5 w-3.5" />
                {t(link.labelKey)}
              </Link>
            </Button>
          ))}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}

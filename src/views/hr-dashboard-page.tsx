"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrWorkspaceMap } from "@/components/hr/hr-workspace-map";
import { OrgDepartmentsFilter } from "@/components/people/exclude-org-departments-filter";
import {
  FecButton as Button,
  FecEmptyState,
  FecFilter,
  FecFilterGroup,
  FecPageHeader,
  FecSkeleton,
  FecStatCard,
} from "@/components/fec";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSites } from "@/hooks/queries/useSites";
import { defaultPayrollPeriod, formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import {
  ALL_ORG_DEPARTMENTS_CHECKED,
  activeShowOnlyOrgDepartments,
  type OrgDepartmentChecks,
} from "@/lib/exclude-org-departments";
import { getHrOverview } from "@/lib/hr-overview.functions";
import type { NamedCount } from "@/lib/hr-overview";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { FILTER_CHIP } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

const HrDashboardCharts = dynamic(
  () => import("@/components/hr/hr-dashboard-charts").then((m) => m.HrDashboardCharts),
  { ssr: false, loading: () => <FecSkeleton className="h-72 rounded-2xl" /> },
);

const SECTIONS = ["overview", "people", "attendance", "payroll", "documents"] as const;
type Section = (typeof SECTIONS)[number];

const TILE_TINTS = {
  headcount: "sky",
  permanent: "green",
  secondment: "orange",
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
} as const;

type TileKey = Exclude<keyof typeof TILE_TINTS, "permanent" | "secondment">;

const TILES: Array<{ key: TileKey; href: string; icon: LucideIcon }> = [
  { key: "headcount", href: "/people", icon: Users },
  { key: "presentToday", href: "/people/attendance/reports", icon: UserCheck },
  { key: "onLeaveToday", href: "/people/leave", icon: Palmtree },
  { key: "servingNotice", href: "/people/hr/resignations", icon: Hourglass },
  { key: "pendingLeave", href: "/people/leave", icon: ClipboardList },
  { key: "pendingOt", href: "/people/hr/ot", icon: Timer },
  { key: "fieldCheckedIn", href: "/people/field", icon: MapPinned },
  { key: "payrollBlocked", href: "/people/payroll", icon: Banknote },
  { key: "payrollExceptions", href: "/people/payroll", icon: Banknote },
  { key: "expiredDocs", href: "/people/hr/documents", icon: FileText },
  { key: "expiringDocs", href: "/people/hr/documents", icon: FileText },
  { key: "expiringQids", href: "/people/hr/documents", icon: FileText },
  { key: "expiringPassports", href: "/people/hr/documents", icon: FileText },
  { key: "missingCvs", href: "/people/hr/documents", icon: FileText },
  { key: "unattestedEducational", href: "/people/hr/documents", icon: FileText },
  { key: "openOnboarding", href: "/people/hr/onboarding", icon: ClipboardList },
  { key: "activeAnnouncements", href: "/people/hr/announcements", icon: Megaphone },
  { key: "activeWarnings", href: "/people/hr/warnings", icon: AlertTriangle },
  { key: "thirdWarningEscalations", href: "/people/hr/warnings", icon: AlertTriangle },
  { key: "upcomingProbationDecisions", href: "/people/hr/probation", icon: Hourglass },
  { key: "terminationQueue", href: "/people/hr/terminations", icon: AlertTriangle },
  { key: "upcomingAirTickets", href: "/people/hr/air-tickets", icon: Plane },
  { key: "overdueAirTickets", href: "/people/hr/air-tickets", icon: Plane },
  { key: "openVacancies", href: "/people/recruitment/jobs/admin", icon: Briefcase },
  { key: "pendingJobRequests", href: "/people/recruitment/jobs/admin", icon: Briefcase },
  { key: "quotaShortage", href: "/people/hr/quota", icon: BarChart3 },
  { key: "quotaExcess", href: "/people/hr/quota", icon: BarChart3 },
  { key: "joiningSoon", href: "/people", icon: UserPlus },
  { key: "leavingSoon", href: "/people/hr/resignations", icon: UserMinus },
];

const SECTION_TILES: Record<Section, TileKey[]> = {
  overview: ["headcount", "presentToday", "onLeaveToday", "expiredDocs", "expiringDocs", "payrollBlocked", "payrollExceptions"],
  people: [
    "headcount",
    "servingNotice",
    "joiningSoon",
    "leavingSoon",
    "openOnboarding",
    "activeAnnouncements",
    "activeWarnings",
    "thirdWarningEscalations",
    "upcomingProbationDecisions",
    "terminationQueue",
    "upcomingAirTickets",
    "overdueAirTickets",
    "openVacancies",
    "pendingJobRequests",
    "quotaShortage",
    "quotaExcess",
  ],
  attendance: ["presentToday", "onLeaveToday", "pendingLeave", "pendingOt", "fieldCheckedIn"],
  payroll: ["payrollBlocked", "payrollExceptions", "pendingOt"],
  documents: ["expiredDocs", "expiringDocs", "expiringQids", "expiringPassports", "missingCvs", "unattestedEducational"],
};

const LINKS: Array<{ href: string; labelKey: string; icon: LucideIcon }> = [
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
];

const SECTION_LINKS: Record<Section, string[]> = {
  overview: ["/people/hr/reports"],
  people: [
    "/people/hr/warnings",
    "/people/hr/probation",
    "/people/hr/resignations",
    "/people/hr/terminations",
    "/people/hr/air-tickets",
    "/people/hr/quota",
    "/people/recruitment/jobs",
    "/people/recruitment/jobs/admin",
    "/people/hr/announcements",
    "/people/hr/onboarding",
  ],
  attendance: ["/people/leave", "/people/hr/ot", "/people/field", "/people/attendance/reports", "/people/hr/shift-policy"],
  payroll: ["/people/payroll", "/people/hr/settings"],
  documents: ["/people/hr/documents"],
};

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

function countNamed(rows: NamedCount[], name: string): number {
  const want = name.toLowerCase();
  let total = 0;
  for (const row of rows) {
    if (row.key.toLowerCase() === want || row.label.toLowerCase() === want) total += row.count;
  }
  return total;
}

function TileGrid({
  keys,
  values,
  viewLabel,
}: {
  keys: TileKey[];
  values: Partial<Record<TileKey, number>> | null;
  viewLabel: string;
}) {
  const { t } = useTranslation();
  const byKey = new Map(TILES.map((tile) => [tile.key, tile]));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {keys.map((key) => {
        const tile = byKey.get(key);
        if (!tile) return null;
        return (
          <FecStatCard
            key={key}
            title={t(`hr.dashboard.tiles.${key}`)}
            value={values ? (values[key] ?? 0) : "—"}
            href={tile.href}
            icon={tile.icon}
            tint={TILE_TINTS[key] ?? "slate"}
            viewLabel={viewLabel}
          />
        );
      })}
    </div>
  );
}

function LinkRow({ hrefs }: { hrefs: string[] }) {
  const { t } = useTranslation();
  const wanted = new Set(hrefs);
  const links = LINKS.filter((link) => wanted.has(link.href));
  if (!links.length) return null;
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t("hr.dashboard.title")}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={cn(FILTER_CHIP, "gap-1.5")}>
          <link.icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.6} />
          {t(link.labelKey)}
        </Link>
      ))}
    </nav>
  );
}

function BreakdownList({ title, rows, empty }: { title: string; rows: NamedCount[]; empty: string }) {
  return (
    <div className="surface-card min-w-0 p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <FecEmptyState message={empty} className="mt-2 border-0 bg-transparent" />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{row.label}</span>
              <span className="tabular-nums font-semibold">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HrDashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: sites } = useSites();
  const [section, setSection] = useState<Section>("overview");
  const [locationId, setLocationId] = useState("all");
  const [periodMode, setPeriodMode] = useState<"fec" | "month">("fec");
  const [orgChecks, setOrgChecks] = useState<OrgDepartmentChecks>(ALL_ORG_DEPARTMENTS_CHECKED);

  const today = qatarToday();
  const bounds = periodMode === "month" ? calendarMonthPeriod(today) : defaultPayrollPeriod(today);
  const showOnly = activeShowOnlyOrgDepartments(orgChecks, "all");
  const locationFilter = locationId === "all" ? null : locationId;

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
  const periodLabel = d
    ? formatPayrollRange(d.period.dateFrom, d.period.dateTo, i18n.language)
    : formatPayrollRange(bounds.dateFrom, bounds.dateTo, i18n.language);

  const values = useMemo(() => {
    if (!d) return null;
    const counts = d as Record<TileKey, number>;
    const out = {} as Record<TileKey, number>;
    for (const tile of TILES) out[tile.key] = counts[tile.key] ?? 0;
    return out;
  }, [d]);

  const categoryRows = d?.breakdowns?.byCategory ?? [];
  const permanent = categoryRows.length > 0 ? countNamed(categoryRows, "permanent") : null;
  const secondment = categoryRows.length > 0 ? countNamed(categoryRows, "secondment") : null;

  const documents = [
    { key: "expired", label: t("hr.dashboard.tiles.expiredDocs"), count: d?.expiredDocs ?? 0 },
    { key: "expiring", label: t("hr.dashboard.tiles.expiringDocs"), count: d?.expiringDocs ?? 0 },
    { key: "qid", label: t("hr.dashboard.tiles.expiringQids"), count: d?.expiringQids ?? 0 },
    { key: "passport", label: t("hr.dashboard.tiles.expiringPassports"), count: d?.expiringPassports ?? 0 },
  ];

  const viewLabel = t("common.view");

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
      <div className="min-w-0 space-y-6">
        <FecPageHeader
          icon={Users}
          kicker={t("hr.dashboard.kicker")}
          title={t("hr.dashboard.title")}
          subtitle={t("hr.dashboard.subtitle", { range: periodLabel })}
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1 sm:max-w-xs">
            <Label htmlFor="hr-dashboard-site">{t("common.site")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="hr-dashboard-site" className="mt-1.5">
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

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("hr.dashboard.title")}>
          {SECTIONS.map((value) => (
            <FecFilter
              key={value}
              active={section === value}
              role="tab"
              aria-selected={section === value}
              onClick={() => setSection(value)}
            >
              {t(`hr.dashboard.sections.${value}`)}
            </FecFilter>
          ))}
        </div>

        {overview.isError && !d ? (
          <FecEmptyState message={t("hr.dashboard.loadError")} />
        ) : overview.isLoading && !d ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <FecSkeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="min-w-0 space-y-4" role="tabpanel">
            {section === "overview" ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <FecStatCard
                    title={t("hr.dashboard.tiles.headcount")}
                    value={d ? d.headcount : "—"}
                    href="/people"
                    icon={Users}
                    tint="sky"
                    viewLabel={viewLabel}
                  />
                  <FecStatCard
                    title={t("people.staff.kpiPermanent")}
                    value={permanent ?? "—"}
                    href="/people?tab=staff&type=permanent"
                    icon={Users}
                    tint="green"
                    viewLabel={viewLabel}
                  />
                  <FecStatCard
                    title={t("people.staff.kpiSecondment")}
                    value={secondment ?? "—"}
                    href="/people?tab=staff&status=secondment"
                    icon={Users}
                    tint="orange"
                    viewLabel={viewLabel}
                  />
                </div>
                <TileGrid
                  keys={SECTION_TILES.overview.filter((key) => key !== "headcount")}
                  values={values}
                  viewLabel={viewLabel}
                />
                {d ? (
                  <HrDashboardCharts
                    byLocation={d.breakdowns?.byLocation ?? []}
                    byCategory={d.breakdowns?.byCategory ?? []}
                    documents={documents}
                  />
                ) : null}
                <HrWorkspaceMap />
              </>
            ) : (
              <TileGrid keys={SECTION_TILES[section]} values={values} viewLabel={viewLabel} />
            )}

            {section === "payroll" && d?.otPolicySummary ? (
              <div className="surface-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
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
              </div>
            ) : null}

            {section === "people" ? (
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                <BreakdownList
                  title={t("hr.dashboard.byCategory")}
                  rows={d?.breakdowns?.byCategory ?? []}
                  empty={t("hr.dashboard.breakdownEmpty")}
                />
                <BreakdownList
                  title={t("hr.dashboard.byDepartment")}
                  rows={d?.breakdowns?.byDepartment ?? []}
                  empty={t("hr.dashboard.breakdownEmpty")}
                />
                <BreakdownList
                  title={t("hr.dashboard.byLocation")}
                  rows={d?.breakdowns?.byLocation ?? []}
                  empty={t("hr.dashboard.breakdownEmpty")}
                />
              </div>
            ) : null}

            <div className="surface-card p-4 sm:p-5">
              <LinkRow hrefs={SECTION_LINKS[section]} />
            </div>
          </div>
        )}
      </div>
    </CapabilityGate>
  );
}

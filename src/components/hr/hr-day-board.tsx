"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FileText, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

import type { NamedCount } from "@/lib/hr-overview";
import { fmtNumber, fmtQar } from "@/lib/currency";
import { formatLocationLabel } from "@/lib/locations/normalize";
import type { PeopleDashboardSalaryLocation } from "@/lib/queries/people-dashboard.core";
import { cn } from "@/lib/utils";

export type HrDayOverview = {
  headcount: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeave: number;
  pendingOt: number;
  fieldCheckedIn: number;
  payrollBlocked: number;
  payrollExceptions: number;
  expiredDocs: number;
  expiringDocs: number;
  expiringQids: number;
  expiringPassports: number;
  missingCvs: number;
  unattestedEducational: number;
  joiningSoon: number;
  leavingSoon: number;
  openOnboarding: number;
  activeAnnouncements: number;
  activeWarnings: number;
  thirdWarningEscalations: number;
  upcomingProbationDecisions: number;
  servingNotice: number;
  terminationQueue: number;
  upcomingAirTickets: number;
  overdueAirTickets: number;
  openVacancies: number;
  pendingJobRequests: number;
  quotaShortage: number;
  quotaExcess: number;
  breakdowns: {
    byCategory: NamedCount[];
    byDepartment: NamedCount[];
    byLocation: NamedCount[];
  };
  otPolicySummary: string | null;
  today: string;
};

export type HrDayHire = {
  id: string;
  full_name: string;
  job_title: string | null;
  location_code: string;
  location_name: string;
  hire_date: string;
};

type TabId = "overview" | "people" | "documents";

type Metric = { label: string; value: number; href: string; tone?: "mint" | "peach" | "lilac" | "sand" };

const TONES = ["mint", "peach", "lilac", "sand"] as const;

const tick = { fontSize: 11, fill: "var(--hr-day-muted)" };
const tooltipStyle = {
  background: "var(--hr-day-card)",
  border: "1px solid var(--hr-day-line)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--hr-day-ink)",
};

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduce;
}

function shortLabel(label: string) {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

function shareWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(6, Math.round((value / max) * 100));
}

function Sparkline({ rows, animate }: { rows: NamedCount[]; animate: boolean }) {
  const points = rows.slice(0, 12).map((row, index) => ({ index, count: row.count }));
  if (points.length < 2) return null;
  return (
    <div className="hr-day__spark" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--hr-day-purple)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={animate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CountBars({
  rows,
  empty,
  animate,
  seriesLabel,
}: {
  rows: NamedCount[];
  empty: string;
  animate: boolean;
  seriesLabel: string;
}) {
  const data = rows.slice(0, 8).map((row) => ({ label: shortLabel(row.label), full: row.label, count: row.count }));
  if (!data.length) return <p className="hr-day__empty">{empty}</p>;
  return (
    <div className="hr-day__plot">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={22}>
          <CartesianGrid vertical={false} stroke="var(--hr-day-line)" />
          <XAxis dataKey="label" tick={tick} interval={0} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [fmtNumber(Number(value ?? 0)), seriesLabel]}
            labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? _)}
          />
          <Bar dataKey="count" fill="var(--hr-day-teal)" radius={[8, 8, 0, 0]} isAnimationActive={animate} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedPayBars({
  rows,
  animate,
  labels,
}: {
  rows: PeopleDashboardSalaryLocation[];
  animate: boolean;
  labels: { recorded: string; missing: string; daily: string };
}) {
  const data = rows.slice(0, 8).map((row) => {
    const missing = row.missing_monthly;
    const daily = row.daily_rate_only;
    return {
      label: shortLabel(formatLocationLabel(row.code, row.name)),
      full: formatLocationLabel(row.code, row.name),
      recorded: Math.max(0, row.roster_headcount - missing - daily),
      missing,
      daily,
    };
  });
  return (
    <div className="hr-day__plot">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={22}>
          <CartesianGrid vertical={false} stroke="var(--hr-day-line)" />
          <XAxis dataKey="label" tick={tick} interval={0} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [fmtNumber(Number(value ?? 0)), String(name)]}
            labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? _)}
          />
          <Bar dataKey="recorded" name={labels.recorded} stackId="pay" fill="var(--hr-day-teal)" isAnimationActive={animate} />
          <Bar dataKey="missing" name={labels.missing} stackId="pay" fill="var(--hr-day-teal-deep)" isAnimationActive={animate} />
          <Bar
            dataKey="daily"
            name={labels.daily}
            stackId="pay"
            fill="var(--hr-day-bar)"
            radius={[8, 8, 0, 0]}
            isAnimationActive={animate}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PurpleBars({
  rows,
  empty,
  animate,
  valueKey,
  seriesLabel,
  formatValue,
}: {
  rows: Array<{ label: string; full: string; value: number }>;
  empty: string;
  animate: boolean;
  valueKey?: string;
  seriesLabel: string;
  formatValue: (value: number) => string;
}) {
  if (!rows.length) return <p className="hr-day__empty">{empty}</p>;
  return (
    <div className="hr-day__plot hr-day__plot--short">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barSize={20}>
          <CartesianGrid vertical={false} stroke="var(--hr-day-line)" />
          <XAxis dataKey="label" tick={tick} interval={0} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatValue(Number(value ?? 0)), seriesLabel]}
            labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? _)}
          />
          <Bar
            dataKey={valueKey ?? "value"}
            fill="var(--hr-day-bar)"
            radius={[8, 8, 0, 0]}
            isAnimationActive={animate}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AttendanceDonut({
  present,
  onLeave,
  unmarked,
  animate,
  labels,
}: {
  present: number;
  onLeave: number;
  unmarked: number;
  animate: boolean;
  labels: { present: string; leave: string; unmarked: string };
}) {
  const slices = [
    { key: "present", name: labels.present, value: present, fill: "var(--hr-day-teal)" },
    { key: "leave", name: labels.leave, value: onLeave, fill: "var(--hr-day-bar)" },
    { key: "unmarked", name: labels.unmarked, value: unmarked, fill: "var(--hr-day-peach)" },
  ].filter((slice) => slice.value > 0);
  return (
    <div className="hr-day__donut-plot">
      {slices.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={animate}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtNumber(Number(value ?? 0)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      ) : null}
      <div className="hr-day__donut-center">
        <div>
          <div className="hr-day__donut-value">{fmtNumber(present)}</div>
          <div className="hr-day__donut-caption">{labels.present}</div>
        </div>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  column,
  countLabel,
  rows,
  empty,
  unnamed,
}: {
  title: string;
  column: string;
  countLabel: string;
  rows: NamedCount[];
  empty: string;
  unnamed: string;
}) {
  const visible = rows.slice(0, 12);
  const total = visible.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="hr-day__card">
      <h2 className="hr-day__card-title">{title}</h2>
      {visible.length === 0 ? (
        <p className="hr-day__empty">{empty}</p>
      ) : (
        <div className="hr-day__table-wrap">
          <table className="hr-day__table">
            <thead>
              <tr>
                <th>{column}</th>
                <th>{countLabel}</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const share = total ? Math.round((row.count / total) * 100) : 0;
                return (
                  <tr key={row.key}>
                    <td>{row.key === "unassigned" ? unnamed : row.label}</td>
                    <td className="hr-day__count">{fmtNumber(row.count)}</td>
                    <td>
                      <span className="hr-day__share">
                        <span className="hr-day__track" aria-hidden>
                          <span style={{ width: `${share}%` }} />
                        </span>
                        {share}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function HrDayBoard({
  data,
  canPayroll,
  filters,
  displayName,
  salaryRows,
  salaryLoading,
  recentHires,
  directoryDepartments = [],
  directoryLocations = [],
}: {
  data: HrDayOverview;
  canPayroll: boolean;
  filters?: ReactNode;
  displayName?: string;
  salaryRows: PeopleDashboardSalaryLocation[] | null;
  salaryLoading: boolean;
  recentHires: HrDayHire[];
  directoryDepartments?: Array<{ department: string; count: number }>;
  directoryLocations?: Array<{ code: string; name: string; count: number }>;
}) {
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  const animate = !reduce;
  const [tab, setTab] = useState<TabId>("overview");
  const tile = (key: string) => t(`hr.dashboard.tiles.${key}`);
  const empty = t("hr.dashboard.charts.empty");
  const name = displayName?.trim();
  const usingDirectoryBreakdown =
    data.breakdowns.byDepartment.length === 0 && data.breakdowns.byLocation.length === 0;
  const departments = data.breakdowns.byDepartment.length
    ? data.breakdowns.byDepartment
    : directoryDepartments.map((row) => ({ key: row.department || "unassigned", label: row.department || "unassigned", count: row.count }));
  const locations = data.breakdowns.byLocation.length
    ? data.breakdowns.byLocation
    : directoryLocations.map((row) => ({
        key: row.code || "unassigned",
        label: formatLocationLabel(row.code, row.name),
        count: row.count,
      }));
  const unmarked = Math.max(0, data.headcount - data.presentToday - data.onLeaveToday);
  const docAttention = data.expiredDocs + data.expiringDocs;

  const kpis: Metric[] =
    tab === "documents"
      ? [
          { label: tile("expiredDocs"), value: data.expiredDocs, href: "/people/hr/documents" },
          { label: tile("expiringDocs"), value: data.expiringDocs, href: "/people/hr/documents" },
          { label: tile("missingCvs"), value: data.missingCvs, href: "/people/hr/documents" },
          { label: tile("unattestedEducational"), value: data.unattestedEducational, href: "/people/hr/documents" },
        ]
      : tab === "people"
        ? [
            { label: tile("headcount"), value: data.headcount, href: "/people" },
            { label: tile("joiningSoon"), value: data.joiningSoon, href: "/people/hr/onboarding" },
            { label: tile("leavingSoon"), value: data.leavingSoon, href: "/people/hr/resignations" },
            { label: tile("fieldCheckedIn"), value: data.fieldCheckedIn, href: "/people/field" },
          ]
        : [
            { label: tile("headcount"), value: data.headcount, href: "/people" },
            { label: tile("presentToday"), value: data.presentToday, href: "/people/attendance" },
            { label: tile("onLeaveToday"), value: data.onLeaveToday, href: "/people/leave" },
            { label: tile("pendingLeave"), value: data.pendingLeave, href: "/people/leave" },
          ];

  const priorities: Metric[] = [
    { label: tile("pendingLeave"), value: data.pendingLeave, href: "/people/leave" },
    { label: tile("expiredDocs"), value: data.expiredDocs, href: "/people/hr/documents" },
    { label: tile("expiringDocs"), value: data.expiringDocs, href: "/people/hr/documents" },
    { label: tile("activeWarnings"), value: data.activeWarnings, href: "/people/hr/warnings" },
    { label: tile("openOnboarding"), value: data.openOnboarding, href: "/people/hr/onboarding" },
    { label: tile("openVacancies"), value: data.openVacancies, href: "/people/recruitment" },
    { label: tile("pendingOt"), value: data.pendingOt, href: "/people/hr/ot" },
    { label: tile("servingNotice"), value: data.servingNotice, href: "/people/hr/resignations" },
    ...(canPayroll
      ? [{ label: tile("payrollExceptions"), value: data.payrollExceptions, href: "/people/payroll" } satisfies Metric]
      : []),
  ];

  const checklist: Metric[] = [
    { label: tile("expiredDocs"), value: data.expiredDocs, href: "/people/hr/documents" },
    { label: tile("expiringDocs"), value: data.expiringDocs, href: "/people/hr/documents" },
    { label: tile("expiringQids"), value: data.expiringQids, href: "/people/hr/documents" },
    { label: tile("expiringPassports"), value: data.expiringPassports, href: "/people/hr/documents" },
    { label: tile("missingCvs"), value: data.missingCvs, href: "/people/hr/documents" },
    { label: tile("unattestedEducational"), value: data.unattestedEducational, href: "/people/hr/documents" },
    { label: tile("openOnboarding"), value: data.openOnboarding, href: "/people/hr/onboarding" },
    { label: tile("upcomingProbationDecisions"), value: data.upcomingProbationDecisions, href: "/people/hr/probation" },
    { label: tile("terminationQueue"), value: data.terminationQueue, href: "/people/hr/terminations" },
    { label: tile("overdueAirTickets"), value: data.overdueAirTickets, href: "/people/hr/air-tickets" },
  ];

  const documentBars: NamedCount[] = [
    { key: "expired", label: tile("expiredDocs"), count: data.expiredDocs },
    { key: "expiring", label: tile("expiringDocs"), count: data.expiringDocs },
    { key: "qid", label: tile("expiringQids"), count: data.expiringQids },
    { key: "passport", label: tile("expiringPassports"), count: data.expiringPassports },
    { key: "cv", label: tile("missingCvs"), count: data.missingCvs },
    { key: "edu", label: tile("unattestedEducational"), count: data.unattestedEducational },
  ];

  const showPayStack = tab === "overview" && (salaryRows?.length ?? 0) > 0;
  const chartRows = tab === "people" ? locations : departments;
  const chartTitle = showPayStack
    ? t("hr.dashboard.day.stackTitle")
    : tab === "documents"
      ? t("hr.dashboard.charts.documentExpiry")
      : tab === "people"
        ? t("hr.dashboard.day.chartLocations")
        : t("hr.dashboard.day.chartDepartments");
  const chartHint = showPayStack
    ? t("hr.dashboard.day.stackHint")
    : tab === "documents"
      ? t("hr.dashboard.charts.documentExpiryHint")
      : usingDirectoryBreakdown
        ? t("hr.dashboard.day.directoryChartHint")
        : t("hr.dashboard.day.chartHint");
  const stackRoster = (salaryRows ?? []).reduce((sum, row) => sum + row.roster_headcount, 0);
  const stackRecorded = (salaryRows ?? []).reduce(
    (sum, row) => sum + Math.max(0, row.roster_headcount - row.missing_monthly - row.daily_rate_only),
    0,
  );
  const salaryTotal = (salaryRows ?? []).reduce((sum, row) => sum + row.monthly_salary_qar, 0);
  const locationPeople = locations.reduce((sum, row) => sum + row.count, 0);
  const salaryBars = (salaryRows ?? []).slice(0, 8).map((row) => ({
    label: shortLabel(formatLocationLabel(row.code, row.name)),
    full: formatLocationLabel(row.code, row.name),
    value: row.monthly_salary_qar,
  }));
  const peopleBars = locations.slice(0, 8).map((row) => ({
    label: shortLabel(row.key === "unassigned" ? t("hr.dashboard.day.unassigned") : row.label),
    full: row.key === "unassigned" ? t("hr.dashboard.day.unassigned") : row.label,
    value: row.count,
  }));
  const categoryMax = Math.max(...data.breakdowns.byCategory.map((row) => row.count), 1);
  const pendingCount = priorities.reduce((sum, row) => sum + row.value, 0);
  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
    { id: "overview", label: t("hr.dashboard.sections.overview"), icon: LayoutDashboard },
    { id: "people", label: t("hr.dashboard.sections.people"), icon: Users },
    { id: "documents", label: t("hr.dashboard.sections.documents"), icon: FileText },
  ];

  return (
    <div data-hr-day-board className="hr-day">
      <header className="hr-day__hero">
        <h1 className="hr-day__title">
          {name ? t("hr.dashboard.day.greetingNamed", { name }) : t("hr.dashboard.day.greeting")}
        </h1>
        <div className="hr-day__hero-side">
          <Sparkline rows={departments.length ? departments : locations} animate={animate} />
          <p className="hr-day__pending" aria-label={t("hr.dashboard.day.pending", { count: pendingCount })}>
            {fmtNumber(pendingCount)}
          </p>
        </div>
      </header>

      <div role="tablist" aria-label={t("hr.dashboard.sections.overview")} className="fec-inner-tabs">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn("fec-inner-tab", tab === item.id && "is-active")}
            onClick={() => setTab(item.id)}
          >
            <Icon aria-hidden />
            {item.label}
          </button>
          );
        })}
      </div>

      {filters ? <div className="hr-day__filters">{filters}</div> : null}

      <section className="hr-day__card">
        <h2 className="hr-day__section-title">{t("hr.dashboard.day.nextTitle")}</h2>
        <div className="hr-day__moves">
          <Link href="/people/leave" className="hr-day__move">
            <span className="hr-day__move-value">{fmtNumber(data.pendingLeave)}</span>
            <span className="hr-day__move-label">{t("hr.dashboard.day.nextLeave")}</span>
            <span className="hr-day__move-hint">{t("hr.dashboard.day.nextLeaveHint")}</span>
          </Link>
          <Link href="/people/hr/documents" className="hr-day__move">
            <span className="hr-day__move-value">{fmtNumber(docAttention)}</span>
            <span className="hr-day__move-label">{t("hr.dashboard.day.nextDocs")}</span>
            <span className="hr-day__move-hint">{t("hr.dashboard.day.nextDocsHint")}</span>
          </Link>
          <Link href="/people/attendance" className="hr-day__move">
            <span className="hr-day__move-value">{fmtNumber(data.presentToday)}</span>
            <span className="hr-day__move-label">{t("hr.dashboard.day.nextAttendance")}</span>
            <span className="hr-day__move-hint">{t("hr.dashboard.day.nextAttendanceHint")}</span>
          </Link>
        </div>
      </section>

      <div className="hr-day__kpis">
        {kpis.map((metric, index) => (
          <Link key={metric.label} href={metric.href} className={cn("hr-day__kpi", `hr-day__kpi--${TONES[index % TONES.length]}`)}>
            <p className="hr-day__kpi-value">{fmtNumber(metric.value)}</p>
            <p className="hr-day__kpi-label">{metric.label}</p>
          </Link>
        ))}
      </div>

      <div className="hr-day__split hr-day__split--chart">
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{chartTitle}</h2>
          <p className="hr-day__hint">{chartHint}</p>
          {showPayStack ? (
            <>
              <div className="hr-day__totals">
                <div>
                  <p className="hr-day__total-value">{fmtNumber(stackRoster)}</p>
                  <p className="hr-day__total-label">{tile("headcount")}</p>
                </div>
                <div>
                  <p className="hr-day__total-value">{fmtNumber(stackRecorded)}</p>
                  <p className="hr-day__total-label">{t("hr.dashboard.day.stackRecorded")}</p>
                </div>
              </div>
              <StackedPayBars
                rows={salaryRows ?? []}
                animate={animate}
                labels={{
                  recorded: t("hr.dashboard.day.stackRecorded"),
                  missing: t("hr.dashboard.day.stackMissing"),
                  daily: t("hr.dashboard.day.stackDaily"),
                }}
              />
              <ul className="hr-day__legend">
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-teal)" }} />
                  {t("hr.dashboard.day.stackRecorded")}
                </li>
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-teal-deep)" }} />
                  {t("hr.dashboard.day.stackMissing")}
                </li>
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-bar)" }} />
                  {t("hr.dashboard.day.stackDaily")}
                </li>
              </ul>
            </>
          ) : (
            <>
              <div className="hr-day__totals">
                <div>
                  <p className="hr-day__total-value">
                    {fmtNumber(
                      (tab === "documents" ? documentBars : chartRows).reduce((sum, row) => sum + row.count, 0),
                    )}
                  </p>
                  <p className="hr-day__total-label">{t("hr.dashboard.day.headcountTotal")}</p>
                </div>
              </div>
              <CountBars
                rows={tab === "documents" ? documentBars : chartRows}
                empty={empty}
                animate={animate}
                seriesLabel={t("hr.dashboard.charts.count")}
              />
            </>
          )}
          {data.otPolicySummary && tab !== "documents" ? (
            <p className="hr-day__hint">
              <span className="hr-day__count">{t("hr.dashboard.otPolicy")}. </span>
              {data.otPolicySummary}
            </p>
          ) : null}
        </section>

        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.priorities")}</h2>
          <ul className="hr-day__list">
            {priorities.map((row) => (
              <li key={row.href + row.label}>
                <Link href={row.href} className="hr-day__row">
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span className="hr-day__count">{fmtNumber(row.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="hr-day__split hr-day__split--mid">
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.attendanceTitle")}</h2>
          <p className="hr-day__hint">{t("hr.dashboard.day.attendanceHint")}</p>
          <div className="hr-day__donut">
            <AttendanceDonut
              present={data.presentToday}
              onLeave={data.onLeaveToday}
              unmarked={unmarked}
              animate={animate}
              labels={{
                present: tile("presentToday"),
                leave: tile("onLeaveToday"),
                unmarked: t("hr.dashboard.day.notMarked"),
              }}
            />
            <div>
              <ul className="hr-day__legend">
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-teal)" }} />
                  {tile("presentToday")} · {fmtNumber(data.presentToday)}
                </li>
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-bar)" }} />
                  {tile("onLeaveToday")} · {fmtNumber(data.onLeaveToday)}
                </li>
                <li>
                  <span className="hr-day__swatch" style={{ background: "var(--hr-day-peach)" }} />
                  {t("hr.dashboard.day.notMarked")} · {fmtNumber(unmarked)}
                </li>
              </ul>
              {data.breakdowns.byCategory.length === 0 ? (
                <p className="hr-day__empty">{empty}</p>
              ) : (
                data.breakdowns.byCategory.slice(0, 5).map((row) => (
                  <Link key={row.key} href="/people" className="hr-day__meter">
                    <span className="hr-day__meter-top">
                      <span className="min-w-0 truncate">{row.label}</span>
                      <span className="hr-day__count">{fmtNumber(row.count)}</span>
                    </span>
                    <span className="hr-day__track" aria-hidden>
                      <span style={{ width: `${shareWidth(row.count, categoryMax)}%` }} />
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.checklist")}</h2>
          <ul className="hr-day__list">
            {checklist.map((row) => (
              <li key={row.label}>
                <Link href={row.href} className="hr-day__row">
                  <span className="hr-day__check">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className={cn("hr-day__pill", row.value > 0 && "is-open")}>
                      {row.value > 0 ? t("hr.dashboard.day.checklistOpen") : t("hr.dashboard.day.checklistClear")}
                    </span>
                  </span>
                  <span className="hr-day__count">{fmtNumber(row.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="hr-day__split hr-day__split--pay">
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.payTitle")}</h2>
          <p className="hr-day__hint">{t("hr.dashboard.day.payHint")}</p>
          {salaryLoading ? (
            <p className="hr-day__empty">{t("common.loading")}</p>
          ) : salaryRows == null ? (
            <p className="hr-day__empty">{t("hr.dashboard.smart.payrollHidden")}</p>
          ) : salaryBars.length === 0 ? (
            <p className="hr-day__empty">{t("hr.dashboard.day.payEmpty")}</p>
          ) : (
            <>
              <div className="hr-day__totals">
                <div>
                  <p className="hr-day__total-value">{fmtQar(salaryTotal)}</p>
                  <p className="hr-day__total-label">{t("hr.dashboard.day.payTitle")}</p>
                </div>
              </div>
              <PurpleBars
                rows={salaryBars}
                empty={t("hr.dashboard.day.payEmpty")}
                animate={animate}
                seriesLabel={t("hr.dashboard.day.payTitle")}
                formatValue={fmtQar}
              />
            </>
          )}
        </section>
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.snapshotPay")}</h2>
          <p className="hr-day__hint">
            {canPayroll ? t("hr.dashboard.day.signalsHint") : t("hr.dashboard.smart.payrollHidden")}
          </p>
          <ul className="hr-day__list">
            {canPayroll ? (
              <>
                <li>
                  <Link href="/people/payroll" className="hr-day__row">
                    <span>{tile("payrollBlocked")}</span>
                    <span className="hr-day__count">{fmtNumber(data.payrollBlocked)}</span>
                  </Link>
                </li>
                <li>
                  <Link href="/people/payroll" className="hr-day__row">
                    <span>{tile("payrollExceptions")}</span>
                    <span className="hr-day__count">{fmtNumber(data.payrollExceptions)}</span>
                  </Link>
                </li>
              </>
            ) : null}
            <li>
              <Link href="/people/leave" className="hr-day__row">
                <span>{tile("pendingLeave")}</span>
                <span className="hr-day__count">{fmtNumber(data.pendingLeave)}</span>
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <div className="hr-day__split hr-day__split--pay">
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.payPeopleTitle")}</h2>
          <p className="hr-day__hint">
            {usingDirectoryBreakdown ? t("hr.dashboard.day.directoryChartHint") : t("hr.dashboard.day.payPeopleHint")}
          </p>
          {peopleBars.length ? (
            <div className="hr-day__totals">
              <div>
                <p className="hr-day__total-value">{fmtNumber(locationPeople)}</p>
                <p className="hr-day__total-label">{tile("headcount")}</p>
              </div>
            </div>
          ) : null}
          <PurpleBars
            rows={peopleBars}
            empty={empty}
            animate={animate}
            seriesLabel={t("hr.dashboard.day.colPeople")}
            formatValue={fmtNumber}
          />
        </section>
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.snapshotPeople")}</h2>
          <p className="hr-day__hint">{t("hr.dashboard.day.presentOf", { present: data.presentToday, total: data.headcount })}</p>
          <ul className="hr-day__list">
            <li>
              <Link href="/people/attendance" className="hr-day__row">
                <span>{tile("presentToday")}</span>
                <span className="hr-day__count">{fmtNumber(data.presentToday)}</span>
              </Link>
            </li>
            <li>
              <Link href="/people/leave" className="hr-day__row">
                <span>{tile("onLeaveToday")}</span>
                <span className="hr-day__count">{fmtNumber(data.onLeaveToday)}</span>
              </Link>
            </li>
            <li>
              <Link href="/people/field" className="hr-day__row">
                <span>{tile("fieldCheckedIn")}</span>
                <span className="hr-day__count">{fmtNumber(data.fieldCheckedIn)}</span>
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <BreakdownTable
        title={t("hr.dashboard.day.tableTitle")}
        column={t("common.department")}
        countLabel={t("hr.dashboard.day.colPeople")}
        rows={departments}
        empty={t("hr.dashboard.breakdownEmpty")}
        unnamed={t("hr.dashboard.day.unassigned")}
      />
      <BreakdownTable
        title={t("hr.dashboard.day.tableLocations")}
        column={t("common.site")}
        countLabel={t("hr.dashboard.day.colPeople")}
        rows={locations}
        empty={t("hr.dashboard.breakdownEmpty")}
        unnamed={t("hr.dashboard.day.unassigned")}
      />

      {recentHires.length ? (
        <section className="hr-day__card">
          <h2 className="hr-day__card-title">{t("hr.dashboard.day.hiresTitle")}</h2>
          <div className="hr-day__table-wrap">
            <table className="hr-day__table">
              <thead>
                <tr>
                  <th>{t("hr.dashboard.day.colName")}</th>
                  <th>{t("hr.dashboard.day.colRole")}</th>
                  <th>{t("hr.dashboard.day.colSite")}</th>
                  <th>{t("hr.dashboard.day.colDate")}</th>
                </tr>
              </thead>
              <tbody>
                {recentHires.slice(0, 8).map((hire) => (
                  <tr key={hire.id}>
                    <td>{hire.full_name}</td>
                    <td>{hire.job_title || "—"}</td>
                    <td>{formatLocationLabel(hire.location_code, hire.location_name)}</td>
                    <td>{hire.hire_date.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

    </div>
  );
}

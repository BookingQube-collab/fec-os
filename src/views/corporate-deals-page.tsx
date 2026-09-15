"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileBarChart, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import {
  useCorporateDealCodes,
  useCorporateDealImport,
  useCorporateDealLog,
  useCorporateDealMom,
  useCorporateDealMomMutate,
  useCorporateDealPartners,
  useCorporateDealReport,
} from "@/hooks/queries/useCorporateDeals";
import { DEAL_CATEGORIES, DEAL_VENUES, PARTNER_MASTER } from "@/lib/corporate-deals/constants";
import { ACTION_STATUSES } from "@/lib/weekly-review/constants";
import { CHART, chartGridProps, chartTick, chartTooltipStyle, CHART_MARGIN } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

const TREND_MARGIN = { top: 12, right: 16, left: 8, bottom: 16 } as const;

function money(n: number) {
  return `QAR ${n.toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn(bodyClassName ?? "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

function NumCell({ children, className }: { children: ReactNode; className?: string }) {
  return <TableCell className={cn("text-end tabular-nums", className)}>{children}</TableCell>;
}

function PartnerStatusBadge({
  status,
  activeLabel,
  idleLabel,
}: {
  status: string;
  activeLabel: string;
  idleLabel: string;
}) {
  const active = status === "Active";
  return (
    <Badge variant={active ? "success" : "muted"} className="whitespace-nowrap font-medium">
      {active ? activeLabel : idleLabel}
    </Badge>
  );
}

function CategoryBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="max-w-[11rem] truncate border-border/70 bg-muted/25 font-normal tracking-normal text-muted-foreground"
    >
      {label}
    </Badge>
  );
}

export default function CorporateDealsPage() {
  const { t } = useTranslation();
  const canView = usePermission("corporate_deals.view");
  const canEdit = usePermission("corporate_deals.edit");
  const [week, setWeek] = useState<string | null>(null);
  const reportQ = useCorporateDealReport(week);
  const report = reportQ.data as Record<string, unknown> | undefined;
  const weeks = (report?.weeks as string[] | undefined) ?? [];
  const activeWeek = week ?? (report?.iso_week as string | null) ?? null;

  const partnersQ = useCorporateDealPartners();
  const codesQ = useCorporateDealCodes(false);
  const unmappedQ = useCorporateDealCodes(true);
  const logQ = useCorporateDealLog(activeWeek);
  const momQ = useCorporateDealMom();
  const momMut = useCorporateDealMomMutate();
  const importMut = useCorporateDealImport();

  const [csvText, setCsvText] = useState("");
  const [importKind, setImportKind] = useState<"week" | "month" | "trend">("week");
  const [importPeriod, setImportPeriod] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const kpis = report?.kpis as
    | {
        redemptions: number;
        tickets: number;
        discount: number;
        discount_per_redemption: number;
        active_partners: number;
        aggregator_share: number;
      }
    | undefined;
  const compare = report?.compare as { message: string | null; delta_redemptions: number | null } | undefined;
  const top10 = (report?.top10 as Array<{ partner_name: string; redemptions: number; discount: number }>) ?? [];
  const split = report?.corporate_vs_aggregator as
    | { corporate: { discount: number; redemptions: number }; aggregator: { discount: number; redemptions: number }; share: number }
    | undefined;
  const noUsage = (report?.no_usage_partners as string[]) ?? [];
  const dormant =
    (report?.dormant_partners as Array<{
      partner_name: string;
      redemption_mechanism: string;
      kind: "month" | "week";
      action: string;
      month_redemptions: number;
    }>) ?? [];
  const dormantPrize = report?.dormant_prize as { redemptions: number; tickets: number } | null | undefined;
  const loyaltyInhouse =
    (report?.loyalty_inhouse as Array<{
      promocode: string;
      description: string | null;
      venue: string;
      week_redemptions: number;
      week_tickets: number;
      month_redemptions: number;
      month_tickets: number;
      prev_month_redemptions?: number;
    }>) ?? [];
  const byVenueWeek =
    (report?.by_venue_week as Array<{
      venue: string;
      redemptions: number;
      tickets: number;
      discount: number;
      share: number;
      corporate_redemptions?: number;
      aggregator_redemptions?: number;
    }>) ?? [];
  const byVenueMtd =
    (report?.by_venue_mtd as Array<{
      venue: string;
      redemptions: number;
      tickets: number;
      discount: number;
      share: number;
    }>) ?? [];
  const weeklyTrend = (report?.weekly_trend as Array<{ iso_week: string; corporate_discount: number; aggregator_discount: number }>) ?? [];
  const partners = (report?.partners as Array<Record<string, unknown>>) ?? [];
  const mtd = report?.mtd as { redemptions: number; tickets: number; discount: number; active_partners: number } | undefined;
  const categorySplitMtd =
    (report?.category_split_mtd as Array<{ category: string; redemptions: number; tickets: number; discount: number }>) ?? [];
  const monthlyTrend =
    (report?.monthly_trend as Array<{
      period_month: string;
      corporate_discount: number;
      aggregator_discount: number;
      corporate_redemptions?: number;
      aggregator_redemptions?: number;
    }>) ?? [];
  const unmatchedVenues = (report?.new_or_unmatched_venues as string[]) ?? [];
  const brief = report?.brief as
    | {
        meta: {
          prepared_by: string;
          reviewed_by: string;
          meeting_label: string;
          week_label: string;
          next_review: string;
          source: string;
        };
        incidents_banner: { title: string; detail: string };
        incident_points: Array<{
          rank: number;
          title: string;
          detail: string;
          ask: string;
          status_label: string;
          severity: string;
        }>;
        decisions: Array<{
          rank: number;
          title: string;
          detail: string;
          ask: string;
          where: string;
          severity: string;
        }>;
        venue_notes: Array<{ title: string; detail: string }>;
      }
    | null
    | undefined;
  const preparedBy = brief?.meta.prepared_by ?? "Head of Ops";
  const reviewedBy = brief?.meta.reviewed_by ?? null;

  const onPreview = async () => {
    try {
      const res = (await importMut.mutateAsync({
        action: "preview",
        csv: csvText,
        kind: importKind,
        period: importPeriod || null,
      })) as Record<string, unknown>;
      setPreview(res);
      if (res.period) setImportPeriod(String(res.period));
      toast.success(t("corporateDeals.import.previewReady"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.tryAgain"));
    }
  };

  const onCommit = async (replace: boolean) => {
    try {
      const res = (await importMut.mutateAsync({
        action: "commit",
        csv: csvText,
        kind: importKind,
        period: importPeriod,
        replace,
      })) as Record<string, unknown>;
      if (res.status === "duplicate") {
        toast.message(t("corporateDeals.import.duplicateWeek"));
        return;
      }
      toast.success(
        t("corporateDeals.import.done", {
          rows: res.rows_imported,
          unmapped: (res.unmapped_codes as string[] | undefined)?.length ?? 0,
        }),
      );
      setPreview(null);
      if (importKind === "week" && res.period) setWeek(String(res.period));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.tryAgain"));
    }
  };

  const saveCode = async (code: Record<string, unknown>) => {
    try {
      await importMut.mutateAsync({
        action: "save_code",
        id: code.id,
        promocode: code.promocode,
        partner_name: code.partner_name ?? null,
        category: code.category,
        venue: code.venue ?? "Not specified",
        notes: code.notes ?? null,
      });
      toast.success(t("corporateDeals.mapping.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.tryAgain"));
    }
  };

  const unmappedCount = useMemo(() => {
    if (report?.unmapped_count != null) return Number(report.unmapped_count);
    return (unmappedQ.data as unknown[] | undefined)?.length ?? 0;
  }, [report, unmappedQ.data]);

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("weeklyReports.noAccess")}</p>;
  }

  return (
    <div className="corporate-deals-page space-y-6">
      <PageHeader
        className="print:hidden"
        icon={FileBarChart}
        title={t("corporateDeals.title")}
        subtitle={t("corporateDeals.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={activeWeek ?? undefined}
              onValueChange={(v) => setWeek(v)}
              disabled={!weeks.length}
            >
              <SelectTrigger className="w-44" aria-label={t("corporateDeals.week")}>
                <SelectValue placeholder={t("corporateDeals.week")} />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              {t("corporateDeals.exportPdf")}
            </Button>
          </div>
        }
      />

      {unmappedCount > 0 ? (
        <Alert className="print:hidden border-amber-500/40">
          <AlertDescription>
            {t("corporateDeals.unmappedBanner", { count: unmappedCount })}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="dashboard">
        <TabsList className="print:hidden mb-1 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="dashboard">{t("corporateDeals.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="summary">{t("corporateDeals.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="import">{t("corporateDeals.tabs.import")}</TabsTrigger>
          <TabsTrigger value="log">{t("corporateDeals.tabs.log")}</TabsTrigger>
          <TabsTrigger value="mapping">{t("corporateDeals.tabs.mapping")}</TabsTrigger>
          <TabsTrigger value="partners">{t("corporateDeals.tabs.partners")}</TabsTrigger>
          <TabsTrigger value="mom">{t("corporateDeals.tabs.mom")}</TabsTrigger>
          <TabsTrigger value="readme">{t("corporateDeals.tabs.readme")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="corporate-deals-dashboard mt-4 space-y-5">
          {reportQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !activeWeek ? (
            <p className="text-sm text-muted-foreground">{t("corporateDeals.empty")}</p>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="text-xl font-semibold">{t("corporateDeals.title")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("corporateDeals.preparedBy", { name: preparedBy })} · {activeWeek}
                    {brief?.meta.week_label ? ` · ${brief.meta.week_label}` : ""}
                    {report?.previous_week
                      ? ` · ${t("corporateDeals.prevWeek")}: ${String(report.previous_week)}`
                      : ""}
                  </p>
                  {brief?.meta.meeting_label ? (
                    <p className="text-xs text-muted-foreground">
                      {t("corporateDeals.meetingDate", { date: brief.meta.meeting_label })}
                      {brief.meta.source ? ` · ${brief.meta.source}` : ""}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {reviewedBy
                    ? t("corporateDeals.reviewedByNamed", { name: reviewedBy })
                    : t("corporateDeals.reviewedBy")}
                </p>
              </header>

              {report?.caveat ? (
                <Alert>
                  <AlertDescription>{String(report.caveat)}</AlertDescription>
                </Alert>
              ) : null}
              {compare?.message ? (
                <p className="text-sm text-muted-foreground">{compare.message}</p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <TintedKpiCard compact tint="sky" title={t("corporateDeals.kpi.redemptions")} value={kpis?.redemptions ?? 0} />
                <TintedKpiCard compact tint="green" title={t("corporateDeals.kpi.tickets")} value={kpis?.tickets ?? 0} />
                <TintedKpiCard
                  compact
                  tint="orange"
                  title={t("corporateDeals.kpi.discount")}
                  value={money(kpis?.discount ?? 0)}
                />
                <TintedKpiCard
                  compact
                  tint="sky"
                  title={t("corporateDeals.kpi.activePartners")}
                  value={kpis?.active_partners ?? 0}
                />
                <TintedKpiCard
                  compact
                  tint="green"
                  title={t("corporateDeals.kpi.aggregatorShare")}
                  value={pct(kpis?.aggregator_share ?? 0)}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title={t("corporateDeals.charts.top10")}>
                  {top10.length === 0 ? (
                    <ChartEmpty label={t("corporateDeals.charts.empty")} />
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={top10} margin={CHART_MARGIN}>
                          <CartesianGrid {...chartGridProps} />
                          <XAxis dataKey="partner_name" tick={chartTick} interval={0} angle={-25} textAnchor="end" height={70} />
                          <YAxis tick={chartTick} />
                          <Tooltip contentStyle={chartTooltipStyle} />
                          <Bar dataKey="redemptions" fill={CHART.info} name={t("corporateDeals.kpi.redemptions")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>

                <ChartCard title={t("corporateDeals.charts.corpVsAgg")}>
                  {!split ? (
                    <ChartEmpty label={t("corporateDeals.charts.empty")} />
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: t("corporateDeals.category.corporate"),
                              discount: split.corporate.discount,
                              redemptions: split.corporate.redemptions,
                            },
                            {
                              name: t("corporateDeals.category.aggregator"),
                              discount: split.aggregator.discount,
                              redemptions: split.aggregator.redemptions,
                            },
                          ]}
                          margin={CHART_MARGIN}
                        >
                          <CartesianGrid {...chartGridProps} />
                          <XAxis dataKey="name" tick={chartTick} />
                          <YAxis tick={chartTick} />
                          <Tooltip contentStyle={chartTooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="discount" fill={CHART.teal} name={t("corporateDeals.kpi.discount")} />
                          <Bar dataKey="redemptions" fill={CHART.amber} name={t("corporateDeals.kpi.redemptions")} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="surface-card p-4">
                  <h3 className="font-semibold">{t("corporateDeals.byVenue")}</h3>
                  {byVenueWeek.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t("corporateDeals.charts.empty")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.kpi.redemptions")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.kpi.tickets")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.category.corporate")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.category.aggregator")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.fields.share")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byVenueWeek.map((v) => (
                          <TableRow key={v.venue}>
                            <TableCell>{v.venue}</TableCell>
                            <TableCell className="text-end">{v.redemptions}</TableCell>
                            <TableCell className="text-end">{v.tickets}</TableCell>
                            <TableCell className="text-end">{v.corporate_redemptions ?? "—"}</TableCell>
                            <TableCell className="text-end">{v.aggregator_redemptions ?? "—"}</TableCell>
                            <TableCell className="text-end">{pct(v.share)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {brief?.venue_notes?.length ? (
                    <ul className="mt-3 space-y-2">
                      {brief.venue_notes.map((n) => (
                        <li key={n.title} className="rounded-md border border-border/60 px-2.5 py-2">
                          <div className="text-sm font-medium">{n.title}</div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {unmatchedVenues.length > 0 ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      {t("corporateDeals.unmatchedVenues", { list: unmatchedVenues.join(", ") })}
                    </p>
                  ) : null}
                </div>
                <div className="surface-card p-4">
                  <h3 className="font-semibold">
                    {dormant.length > 0
                      ? t("corporateDeals.dormantTitle", { count: dormant.length })
                      : t("corporateDeals.noUsage")}
                  </h3>
                  {dormant.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("corporateDeals.dormantSubtitle", {
                        monthCount: dormant.filter((d) => d.kind === "month").length,
                        weekCount: dormant.filter((d) => d.kind === "week").length,
                      })}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-2">
                    {dormant.length === 0 && noUsage.length === 0 ? (
                      <li className="text-sm text-muted-foreground">{t("corporateDeals.allActive")}</li>
                    ) : dormant.length === 0 ? (
                      noUsage.map((n) => (
                        <li key={n} className="text-sm text-muted-foreground">
                          {n}
                        </li>
                      ))
                    ) : (
                      dormant.map((d) => (
                        <li
                          key={d.partner_name}
                          className={cn(
                            "flex gap-3 rounded-md border px-2.5 py-2",
                            d.kind === "month" ? "border-destructive/25 bg-destructive/5" : "border-border/70 bg-muted/30",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              d.kind === "month"
                                ? "bg-destructive text-destructive-foreground"
                                : "bg-destructive/40 text-destructive-foreground",
                            )}
                            aria-hidden
                          >
                            0
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold leading-tight">{d.partner_name}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {d.kind === "month"
                                ? t("corporateDeals.dormantMonthNote", { mechanism: d.redemption_mechanism })
                                : t("corporateDeals.dormantWeekNote", { mechanism: d.redemption_mechanism })}
                            </div>
                            <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{d.action}</div>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                  {dormantPrize ? (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        {t("corporateDeals.dormantPrizeTitle")}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("corporateDeals.dormantPrize", {
                          redemptions: dormantPrize.redemptions,
                          tickets: dormantPrize.tickets,
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="surface-card p-4">
                <h3 className="font-semibold">{t("corporateDeals.loyaltyTitle")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("corporateDeals.loyaltySubtitle")}</p>
                {loyaltyInhouse.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("corporateDeals.loyaltyEmpty")}</p>
                ) : (
                  <Table className="mt-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("corporateDeals.fields.code")}</TableHead>
                        <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.summary.week")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.summary.mtd")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.loyaltyPrevMonth")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loyaltyInhouse.map((row) => (
                        <TableRow key={row.promocode}>
                          <TableCell>
                            <div className="font-medium">{row.promocode}</div>
                            {row.description ? (
                              <div className="text-xs text-muted-foreground">{row.description}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>{row.venue}</TableCell>
                          <TableCell className="text-end">
                            {row.week_redemptions > 0
                              ? `${row.week_redemptions} / ${row.week_tickets}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-end">
                            {row.month_redemptions > 0
                              ? `${row.month_redemptions} / ${row.month_tickets}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-end">
                            {(row.prev_month_redemptions ?? 0) > 0 ? row.prev_month_redemptions : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={2} className="font-semibold">
                          {t("corporateDeals.loyaltyTotal")}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {loyaltyInhouse.reduce((s, r) => s + r.week_redemptions, 0)} /{" "}
                          {loyaltyInhouse.reduce((s, r) => s + r.week_tickets, 0)}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {loyaltyInhouse.reduce((s, r) => s + r.month_redemptions, 0)} /{" "}
                          {loyaltyInhouse.reduce((s, r) => s + r.month_tickets, 0)}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {loyaltyInhouse.reduce((s, r) => s + (r.prev_month_redemptions ?? 0), 0) || "—"}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>

              {brief ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="surface-card p-4">
                    <h3 className="font-semibold">{t("corporateDeals.incidentsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("corporateDeals.incidentsSubtitle")}</p>
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                      <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        {brief.incidents_banner.title}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{brief.incidents_banner.detail}</p>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {brief.incident_points.map((item) => (
                        <li key={item.rank} className="flex gap-3 rounded-md border px-2.5 py-2">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                            {item.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold leading-tight">{item.title}</div>
                              <Badge variant="secondary">{item.status_label}</Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{item.ask}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="surface-card p-4">
                    <h3 className="font-semibold">{t("corporateDeals.decisionsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("corporateDeals.decisionsSubtitle")}</p>
                    <ul className="mt-3 space-y-2">
                      {brief.decisions.map((item) => (
                        <li
                          key={item.rank}
                          className={cn(
                            "flex gap-3 rounded-md border px-2.5 py-2",
                            item.severity === "crit"
                              ? "border-destructive/30 bg-destructive/5"
                              : item.severity === "gold"
                                ? "border-amber-500/30 bg-amber-500/5"
                                : "border-border/70",
                          )}
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                            {item.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold leading-tight">{item.title}</div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{item.ask}</p>
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted-foreground whitespace-pre-line">
                            {item.where}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("corporateDeals.decisionsMomNote")}
                      {brief.meta.next_review ? ` · ${t("corporateDeals.nextReview", { date: brief.meta.next_review })}` : ""}
                    </p>
                  </div>
                </div>
              ) : null}

              <ChartCard title={t("corporateDeals.charts.weeklyTrend")}>
                {weeklyTrend.length === 0 ? (
                  <ChartEmpty label={t("corporateDeals.charts.empty")} className="h-64" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyTrend} margin={TREND_MARGIN}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="iso_week" tick={chartTick} />
                        <YAxis tick={chartTick} width={56} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="corporate_discount" stroke={CHART.info} name={t("corporateDeals.category.corporate")} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="aggregator_discount" stroke={CHART.amber} name={t("corporateDeals.category.aggregator")} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="summary" className="mt-4 space-y-5">
          {!activeWeek ? (
            <p className="text-sm text-muted-foreground">{t("corporateDeals.empty")}</p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="section-kicker">{t("corporateDeals.summary.week")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TintedKpiCard compact tint="sky" title={t("corporateDeals.kpi.redemptions")} value={kpis?.redemptions ?? 0} />
                    <TintedKpiCard compact tint="green" title={t("corporateDeals.kpi.tickets")} value={kpis?.tickets ?? 0} />
                    <TintedKpiCard compact tint="orange" title={t("corporateDeals.kpi.discount")} value={money(kpis?.discount ?? 0)} />
                    <TintedKpiCard compact tint="amber" title={t("corporateDeals.kpi.activePartners")} value={kpis?.active_partners ?? 0} />
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="section-kicker">{t("corporateDeals.summary.mtd")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TintedKpiCard compact tint="sky" title={t("corporateDeals.kpi.redemptions")} value={mtd?.redemptions ?? 0} />
                    <TintedKpiCard compact tint="green" title={t("corporateDeals.kpi.tickets")} value={mtd?.tickets ?? 0} />
                    <TintedKpiCard compact tint="orange" title={t("corporateDeals.kpi.discount")} value={money(mtd?.discount ?? 0)} />
                    <TintedKpiCard compact tint="amber" title={t("corporateDeals.kpi.activePartners")} value={mtd?.active_partners ?? 0} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={t("corporateDeals.summary.categorySplit")} bodyClassName="overflow-x-auto p-0 sm:p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.redemptions")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.discount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorySplitMtd.map((c) => (
                        <TableRow key={c.category} className="odd:bg-muted/20 hover:bg-muted/35">
                          <TableCell>
                            <CategoryBadge label={c.category} />
                          </TableCell>
                          <NumCell>{c.redemptions}</NumCell>
                          <NumCell>{money(c.discount)}</NumCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </SectionCard>
                <SectionCard title={t("corporateDeals.summary.venueSplit")} bodyClassName="overflow-x-auto p-0 sm:p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.summary.weekShort")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.summary.mtdShort")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {([...new Set([...byVenueWeek.map((v) => v.venue), ...byVenueMtd.map((v) => v.venue)])] as string[]).map(
                        (venue) => {
                          const w = byVenueWeek.find((x) => x.venue === venue);
                          const m = byVenueMtd.find((x) => x.venue === venue);
                          return (
                            <TableRow key={venue} className="odd:bg-muted/20 hover:bg-muted/35">
                              <TableCell className="font-medium">{venue}</TableCell>
                              <NumCell>{w ? `${w.redemptions} / ${w.tickets}` : "—"}</NumCell>
                              <NumCell>{m ? `${m.redemptions} / ${m.tickets}` : "—"}</NumCell>
                            </TableRow>
                          );
                        },
                      )}
                    </TableBody>
                  </Table>
                </SectionCard>
              </div>

              <SectionCard
                title={t("corporateDeals.summary.partners")}
                subtitle={t("corporateDeals.summary.partnersHint")}
                bodyClassName="p-0 sm:p-0"
              >
                <div className="[&>div]:max-h-[min(32rem,65vh)]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card/95 shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur supports-[backdrop-filter]:bg-card/90">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t("corporateDeals.fields.partner")}</TableHead>
                        <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.redemptions")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.tickets")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.discount")}</TableHead>
                        <TableHead>{t("corporateDeals.fields.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partners.map((p) => (
                        <TableRow key={String(p.partner_name)} className="odd:bg-muted/15 hover:bg-muted/30">
                          <TableCell className="font-medium">{String(p.partner_name)}</TableCell>
                          <TableCell>
                            <CategoryBadge label={String(p.category)} />
                          </TableCell>
                          <NumCell>{Number(p.redemptions)}</NumCell>
                          <NumCell>{Number(p.tickets)}</NumCell>
                          <NumCell>{money(Number(p.discount))}</NumCell>
                          <TableCell>
                            <PartnerStatusBadge
                              status={String(p.status)}
                              activeLabel={t("corporateDeals.statusActive")}
                              idleLabel={t("corporateDeals.statusNoUsage")}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>

              <ChartCard title={t("corporateDeals.charts.monthlyTrend")}>
                {monthlyTrend.length === 0 ? (
                  <ChartEmpty label={t("corporateDeals.charts.empty")} className="h-72" />
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyTrend} margin={TREND_MARGIN}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="period_month" tick={chartTick} />
                        <YAxis tick={chartTick} width={64} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="corporate_discount" stroke={CHART.info} name={t("corporateDeals.category.corporate")} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="aggregator_discount" stroke={CHART.amber} name={t("corporateDeals.category.aggregator")} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="import" className="space-y-4 print:hidden">
          {!canEdit ? (
            <p className="text-sm text-muted-foreground">{t("corporateDeals.readOnly")}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Select value={importKind} onValueChange={(v) => setImportKind(v as typeof importKind)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">{t("corporateDeals.import.kindWeek")}</SelectItem>
                    <SelectItem value="month">{t("corporateDeals.import.kindMonth")}</SelectItem>
                    <SelectItem value="trend">{t("corporateDeals.import.kindTrend")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="w-40"
                  placeholder={importKind === "week" ? "2026-W37" : "2026-09"}
                  value={importPeriod}
                  onChange={(e) => setImportPeriod(e.target.value)}
                />
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void file.text().then(setCsvText);
                  }}
                />
              </div>
              <textarea
                className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={t("corporateDeals.import.paste")}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void onPreview()} disabled={!csvText || importMut.isPending}>
                  {t("corporateDeals.import.preview")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onCommit(false)}
                  disabled={!csvText || !importPeriod || importMut.isPending}
                >
                  {t("corporateDeals.import.commit")}
                </Button>
                {preview?.duplicate_week ? (
                  <Button type="button" variant="destructive" onClick={() => void onCommit(true)}>
                    {t("corporateDeals.import.replace")}
                  </Button>
                ) : null}
              </div>
              {preview ? (
                <div className="surface-card space-y-2 p-4 text-sm">
                  <p>
                    {t("corporateDeals.import.previewStats", {
                      rows: preview.row_count,
                      period: String(preview.period ?? "—"),
                      unmapped: (preview.unmapped_codes as string[] | undefined)?.length ?? 0,
                    })}
                  </p>
                  {Number(preview.missing_event_title ?? 0) > 0 ? (
                    <p className="text-amber-700 dark:text-amber-400">
                      {t("corporateDeals.import.missingEventTitle", {
                        count: Number(preview.missing_event_title),
                      })}
                    </p>
                  ) : null}
                  {preview.duplicate_week ? (
                    <p className="text-amber-700 dark:text-amber-400">{t("corporateDeals.import.duplicateWeek")}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="log" className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("corporateDeals.fields.code")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.partner")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.event")}</TableHead>
                  <TableHead>{t("corporateDeals.kpi.redemptions")}</TableHead>
                  <TableHead>{t("corporateDeals.kpi.tickets")}</TableHead>
                  <TableHead>{t("corporateDeals.kpi.discount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((logQ.data as Array<Record<string, unknown>>) ?? []).map((row) => (
                  <TableRow key={String(row.id)}>
                    <TableCell className="font-mono text-xs">{String(row.promocode)}</TableCell>
                    <TableCell>{String(row.partner_name ?? "—")}</TableCell>
                    <TableCell>{String(row.category)}</TableCell>
                    <TableCell>{String(row.venue)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                      {String(row.event_title ?? "—")}
                    </TableCell>
                    <TableCell>{Number(row.times_used)}</TableCell>
                    <TableCell>{Number(row.tickets)}</TableCell>
                    <TableCell>{money(Number(row.total_discount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-3 print:hidden">
          <p className="text-sm text-muted-foreground">{t("corporateDeals.mapping.help")}</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("corporateDeals.fields.code")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.partner")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {((codesQ.data as Array<Record<string, unknown>>) ?? []).slice(0, 200).map((row) => (
                  <CodeMapRow
                    key={String(row.id)}
                    row={row}
                    canEdit={canEdit}
                    onSave={saveCode}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="partners" className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("corporateDeals.fields.partner")}</TableHead>
                <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                <TableHead>{t("corporateDeals.fields.mechanism")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((partnersQ.data as Array<Record<string, unknown>>) ?? PARTNER_MASTER).map((p) => (
                <TableRow key={String((p as { name: string }).name)}>
                  <TableCell>{String((p as { name: string }).name)}</TableCell>
                  <TableCell>{String((p as { category: string }).category)}</TableCell>
                  <TableCell>
                    {String(
                      (p as { redemption_mechanism?: string }).redemption_mechanism ??
                        PARTNER_MASTER.find((m) => m.name === (p as { name: string }).name)?.redemption_mechanism ??
                        "",
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="mom" className="mt-4 space-y-4 print:hidden">
          <Alert>
            <AlertDescription>{t("corporateDeals.mom.reuseNote")}</AlertDescription>
          </Alert>
          <SectionCard
            title={t("corporateDeals.tabs.mom")}
            actions={
              canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={momMut.isPending}
                  onClick={() => {
                    void momMut
                      .mutateAsync({
                        action: "save_mom",
                        action_text: "",
                        venue_text: "Corporate deals",
                        owner: "",
                        due: "",
                        status: "open",
                        update_note: null,
                        sort_order: ((momQ.data as unknown[] | undefined)?.length ?? 0) + 1,
                      })
                      .then(() => toast.success(t("corporateDeals.mom.saved")))
                      .catch((e: Error) => toast.error(e.message));
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t("corporateDeals.mom.add")}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{t("corporateDeals.readOnly")}</p>
              )
            }
            bodyClassName="overflow-x-auto p-0 sm:p-0"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                  <TableHead>{t("corporateDeals.mom.decision")}</TableHead>
                  <TableHead>{t("corporateDeals.mom.owner")}</TableHead>
                  <TableHead>{t("corporateDeals.mom.due")}</TableHead>
                  <TableHead>{t("corporateDeals.fields.status")}</TableHead>
                  <TableHead>{t("corporateDeals.mom.update")}</TableHead>
                  {canEdit ? <TableHead className="w-28 text-end">{t("common.actions")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {((momQ.data as Array<Record<string, unknown>>) ?? []).map((row) => (
                  <MomActionRow
                    key={String(row.id)}
                    row={row}
                    canEdit={canEdit}
                    busy={momMut.isPending}
                    onSave={async (patch) => {
                      try {
                        await momMut.mutateAsync({ action: "save_mom", ...patch });
                        toast.success(t("corporateDeals.mom.saved"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    onDelete={async (id) => {
                      try {
                        await momMut.mutateAsync({ action: "delete_mom", id });
                        toast.success(t("corporateDeals.mom.deleted"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  />
                ))}
                {(momQ.data as unknown[] | undefined)?.length ? null : (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("corporateDeals.mom.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="readme" className="prose prose-sm dark:prose-invert max-w-none space-y-2">
          <h2>{t("corporateDeals.readme.title")}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t("corporateDeals.readme.s1")}</li>
            <li>{t("corporateDeals.readme.s2")}</li>
            <li>{t("corporateDeals.readme.s3")}</li>
            <li>{t("corporateDeals.readme.s4")}</li>
            <li>{t("corporateDeals.readme.s5")}</li>
            <li>{t("corporateDeals.readme.s6")}</li>
            <li>{t("corporateDeals.readme.s7")}</li>
          </ol>
          <p className="text-sm text-muted-foreground">{t("corporateDeals.readme.defs")}</p>
        </TabsContent>
      </Tabs>

      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

function MomActionRow({
  row,
  canEdit,
  busy,
  onSave,
  onDelete,
}: {
  row: Record<string, unknown>;
  canEdit: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [venue, setVenue] = useState(String(row.venue_text ?? ""));
  const [action, setAction] = useState(String(row.action ?? ""));
  const [owner, setOwner] = useState(String(row.owner ?? ""));
  const [due, setDue] = useState(String(row.due ?? ""));
  const [status, setStatus] = useState(String(row.status ?? "open"));
  const [update, setUpdate] = useState(String(row.update_note ?? ""));

  if (!canEdit) {
    return (
      <TableRow>
        <TableCell>{venue || "—"}</TableCell>
        <TableCell>{action || "—"}</TableCell>
        <TableCell>{owner || "—"}</TableCell>
        <TableCell>{due || "—"}</TableCell>
        <TableCell>
          <Badge variant={status === "done" ? "success" : status === "wip" ? "warning" : "info"}>
            {t(`weeklyReview.actionStatus.${status}`, { defaultValue: status })}
          </Badge>
        </TableCell>
        <TableCell>{update || "—"}</TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="align-top odd:bg-muted/10 hover:bg-muted/25">
      <TableCell>
        <Input className="h-8 min-w-28" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 min-w-48" value={action} onChange={(e) => setAction(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 min-w-28" value={owner} onChange={(e) => setOwner(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 min-w-24" value={due} onChange={(e) => setDue(e.target.value)} />
      </TableCell>
      <TableCell>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`weeklyReview.actionStatus.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input className="h-8 min-w-40" value={update} onChange={(e) => setUpdate(e.target.value)} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-end">
        <div className="inline-flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              void onSave({
                id: row.id,
                review_id: row.review_id,
                venue_text: venue || null,
                action_text: action,
                owner: owner || null,
                due: due || null,
                status,
                update_note: update || null,
                sort_order: row.sort_order,
              })
            }
          >
            {t("corporateDeals.mom.save")}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
            aria-label={t("corporateDeals.mom.delete")}
            onClick={() => void onDelete(String(row.id))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CodeMapRow({
  row,
  canEdit,
  onSave,
}: {
  row: Record<string, unknown>;
  canEdit: boolean;
  onSave: (row: Record<string, unknown>) => Promise<void>;
}) {
  const [partner, setPartner] = useState(String(row.partner_name ?? (row.corporate_deal_partners as { name?: string } | null)?.name ?? ""));
  const [category, setCategory] = useState(String(row.category ?? "Unmapped"));
  const [venue, setVenue] = useState(String(row.venue ?? "Not specified"));

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{String(row.promocode)}</TableCell>
      <TableCell>
        {canEdit ? (
          <Select value={partner || "_none"} onValueChange={(v) => setPartner(v === "_none" ? "" : v)}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {PARTNER_MASTER.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          partner || "—"
        )}
      </TableCell>
      <TableCell>
        {canEdit ? (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          category
        )}
      </TableCell>
      <TableCell>
        {canEdit ? (
          <Select value={venue} onValueChange={setVenue}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_VENUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          venue
        )}
      </TableCell>
      {canEdit ? (
        <TableCell>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void onSave({
                id: row.id,
                promocode: row.promocode,
                partner_name: partner || null,
                category,
                venue,
                notes: row.notes,
              })
            }
          >
            Save
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

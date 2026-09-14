"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  useCorporateDealPartners,
  useCorporateDealReport,
} from "@/hooks/queries/useCorporateDeals";
import { DEAL_CATEGORIES, DEAL_VENUES, PARTNER_MASTER } from "@/lib/corporate-deals/constants";
import { CHART, chartGridProps, chartTick, chartTooltipStyle, CHART_MARGIN } from "@/lib/chart-theme";

function money(n: number) {
  return `QAR ${n.toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
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
  const byVenueWeek =
    (report?.by_venue_week as Array<{
      venue: string;
      redemptions: number;
      tickets: number;
      discount: number;
      share: number;
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
    (report?.monthly_trend as Array<{ period_month: string; corporate_discount: number; aggregator_discount: number }>) ?? [];
  const unmatchedVenues = (report?.new_or_unmatched_venues as string[]) ?? [];
  const preparedBy = "Head of Ops";

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
    <div className="corporate-deals-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("corporateDeals.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("corporateDeals.subtitle")}</p>
        </div>
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
      </div>

      {unmappedCount > 0 ? (
        <Alert className="print:hidden border-amber-500/40">
          <AlertDescription>
            {t("corporateDeals.unmappedBanner", { count: unmappedCount })}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="dashboard">
        <TabsList className="print:hidden flex h-auto flex-wrap gap-1">
          <TabsTrigger value="dashboard">{t("corporateDeals.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="summary">{t("corporateDeals.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="import">{t("corporateDeals.tabs.import")}</TabsTrigger>
          <TabsTrigger value="log">{t("corporateDeals.tabs.log")}</TabsTrigger>
          <TabsTrigger value="mapping">{t("corporateDeals.tabs.mapping")}</TabsTrigger>
          <TabsTrigger value="partners">{t("corporateDeals.tabs.partners")}</TabsTrigger>
          <TabsTrigger value="mom">{t("corporateDeals.tabs.mom")}</TabsTrigger>
          <TabsTrigger value="readme">{t("corporateDeals.tabs.readme")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="corporate-deals-dashboard space-y-4">
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
                    {report?.previous_week
                      ? ` · ${t("corporateDeals.prevWeek")}: ${String(report.previous_week)}`
                      : ""}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{t("corporateDeals.reviewedBy")}</p>
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
                    <div className="h-64">
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
                    <div className="h-64">
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
                          <Legend />
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
                          <TableHead className="text-end">{t("corporateDeals.kpi.discount")}</TableHead>
                          <TableHead className="text-end">{t("corporateDeals.fields.share")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byVenueWeek.map((v) => (
                          <TableRow key={v.venue}>
                            <TableCell>{v.venue}</TableCell>
                            <TableCell className="text-end">{v.redemptions}</TableCell>
                            <TableCell className="text-end">{v.tickets}</TableCell>
                            <TableCell className="text-end">{money(v.discount)}</TableCell>
                            <TableCell className="text-end">{pct(v.share)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {unmatchedVenues.length > 0 ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      {t("corporateDeals.unmatchedVenues", { list: unmatchedVenues.join(", ") })}
                    </p>
                  ) : null}
                </div>
                <div className="surface-card p-4">
                  <h3 className="font-semibold">{t("corporateDeals.noUsage")}</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {noUsage.length === 0 ? (
                      <li>{t("corporateDeals.allActive")}</li>
                    ) : (
                      noUsage.map((n) => <li key={n}>{n}</li>)
                    )}
                  </ul>
                </div>
              </div>

              <ChartCard title={t("corporateDeals.charts.weeklyTrend")}>
                {weeklyTrend.length === 0 ? (
                  <ChartEmpty label={t("corporateDeals.charts.empty")} className="h-48" />
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyTrend} margin={CHART_MARGIN}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="iso_week" tick={chartTick} />
                        <YAxis tick={chartTick} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="corporate_discount" stroke={CHART.info} name={t("corporateDeals.category.corporate")} dot={false} />
                        <Line type="monotone" dataKey="aggregator_discount" stroke={CHART.amber} name={t("corporateDeals.category.aggregator")} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          {!activeWeek ? (
            <p className="text-sm text-muted-foreground">{t("corporateDeals.empty")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="surface-card p-4 text-sm">
                  <h3 className="font-semibold">{t("corporateDeals.summary.week")}</h3>
                  <p>{t("corporateDeals.kpi.redemptions")}: {kpis?.redemptions ?? 0}</p>
                  <p>{t("corporateDeals.kpi.tickets")}: {kpis?.tickets ?? 0}</p>
                  <p>{t("corporateDeals.kpi.discount")}: {money(kpis?.discount ?? 0)}</p>
                  <p>{t("corporateDeals.kpi.activePartners")}: {kpis?.active_partners ?? 0}</p>
                </div>
                <div className="surface-card p-4 text-sm">
                  <h3 className="font-semibold">{t("corporateDeals.summary.mtd")}</h3>
                  <p>{t("corporateDeals.kpi.redemptions")}: {mtd?.redemptions ?? 0}</p>
                  <p>{t("corporateDeals.kpi.tickets")}: {mtd?.tickets ?? 0}</p>
                  <p>{t("corporateDeals.kpi.discount")}: {money(mtd?.discount ?? 0)}</p>
                  <p>{t("corporateDeals.kpi.activePartners")}: {mtd?.active_partners ?? 0}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="surface-card p-4">
                  <h3 className="mb-2 font-semibold">{t("corporateDeals.summary.categorySplit")}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.redemptions")}</TableHead>
                        <TableHead className="text-end">{t("corporateDeals.kpi.discount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorySplitMtd.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell>{c.category}</TableCell>
                          <TableCell className="text-end">{c.redemptions}</TableCell>
                          <TableCell className="text-end">{money(c.discount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="surface-card p-4">
                  <h3 className="mb-2 font-semibold">{t("corporateDeals.summary.venueSplit")}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                            <TableRow key={venue}>
                              <TableCell>{venue}</TableCell>
                              <TableCell className="text-end">
                                {w ? `${w.redemptions} / ${w.tickets}` : "—"}
                              </TableCell>
                              <TableCell className="text-end">
                                {m ? `${m.redemptions} / ${m.tickets}` : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        },
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("corporateDeals.fields.partner")}</TableHead>
                      <TableHead>{t("corporateDeals.fields.category")}</TableHead>
                      <TableHead>{t("corporateDeals.kpi.redemptions")}</TableHead>
                      <TableHead>{t("corporateDeals.kpi.tickets")}</TableHead>
                      <TableHead>{t("corporateDeals.kpi.discount")}</TableHead>
                      <TableHead>{t("corporateDeals.fields.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow key={String(p.partner_name)}>
                        <TableCell>{String(p.partner_name)}</TableCell>
                        <TableCell>{String(p.category)}</TableCell>
                        <TableCell>{Number(p.redemptions)}</TableCell>
                        <TableCell>{Number(p.tickets)}</TableCell>
                        <TableCell>{money(Number(p.discount))}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "Active" ? "default" : "secondary"}>
                            {String(p.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ChartCard title={t("corporateDeals.charts.monthlyTrend")}>
                {monthlyTrend.length === 0 ? (
                  <ChartEmpty label={t("corporateDeals.charts.empty")} />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyTrend} margin={CHART_MARGIN}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="period_month" tick={chartTick} />
                        <YAxis tick={chartTick} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="corporate_discount" stroke={CHART.info} name={t("corporateDeals.category.corporate")} />
                        <Line type="monotone" dataKey="aggregator_discount" stroke={CHART.amber} name={t("corporateDeals.category.aggregator")} />
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

        <TabsContent value="mom" className="space-y-3 print:hidden">
          <Alert>
            <AlertDescription>{t("corporateDeals.mom.reuseNote")}</AlertDescription>
          </Alert>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("corporateDeals.fields.venue")}</TableHead>
                <TableHead>{t("corporateDeals.mom.decision")}</TableHead>
                <TableHead>{t("corporateDeals.mom.owner")}</TableHead>
                <TableHead>{t("corporateDeals.mom.due")}</TableHead>
                <TableHead>{t("corporateDeals.fields.status")}</TableHead>
                <TableHead>{t("corporateDeals.mom.update")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((momQ.data as Array<Record<string, unknown>>) ?? []).map((row) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{String(row.venue_text ?? "—")}</TableCell>
                  <TableCell>{String(row.action)}</TableCell>
                  <TableCell>{String(row.owner ?? "—")}</TableCell>
                  <TableCell>{String(row.due ?? "—")}</TableCell>
                  <TableCell>{String(row.status)}</TableCell>
                  <TableCell>{String(row.update_note ?? "—")}</TableCell>
                </TableRow>
              ))}
              {(momQ.data as unknown[] | undefined)?.length ? null : (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    {t("corporateDeals.mom.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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

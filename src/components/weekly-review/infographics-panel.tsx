"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { siteLabel, type SiteOption } from "@/components/weekly-review/fields";
import {
  AGGREGATOR_PLATFORMS,
  AGGREGATOR_WEEKLY_PACE,
  formatReviewDates,
} from "@/lib/weekly-review/constants";
import { CHART, CHART_SERIES, chartTooltipStyle } from "@/lib/chart-theme";
import { packHasNumbers, type ReviewPack } from "@/lib/weekly-review/model";

export function InfographicsPanel({
  pack,
  sites,
  locationFilter,
}: {
  pack: ReviewPack;
  sites: SiteOption[];
  locationFilter: string[] | null;
}) {
  const { t } = useTranslation();
  const inFilter = (locationId: string | null) =>
    !locationFilter || !locationId || locationFilter.includes(locationId);

  const aggregators = pack.aggregators.filter((r) => inFilter(r.location_id));
  const byPlatform = AGGREGATOR_PLATFORMS.map((platform) => ({
    name: platform,
    value: aggregators.filter((a) => a.platform === platform).reduce((s, a) => s + a.redemptions, 0),
    pace: AGGREGATOR_WEEKLY_PACE[platform],
  }));
  const totalRed = byPlatform.reduce((s, r) => s + r.value, 0);

  const byVenue = sites
    .map((s) => ({
      name: siteLabel(s),
      value: aggregators.filter((a) => a.location_id === s.id).reduce((n, a) => n + a.redemptions, 0),
    }))
    .filter((r) => r.value > 0);

  const actions = {
    open: pack.actions.filter((a) => a.status === "open").length,
    wip: pack.actions.filter((a) => a.status === "wip").length,
    done: pack.actions.filter((a) => a.status === "done").length,
  };
  const actionPie = [
    { name: t("weeklyReview.actionStatus.open"), value: actions.open, color: CHART.muted },
    { name: t("weeklyReview.actionStatus.wip"), value: actions.wip, color: CHART.amber },
    { name: t("weeklyReview.actionStatus.done"), value: actions.done, color: CHART.teal },
  ].filter((r) => r.value > 0);

  const priorityPie = (
    ["critical", "safety", "security", "commercial", "other"] as const
  )
    .map((p, i) => ({
      name: t(`weeklyReview.priority.${p}`),
      value: pack.decisions.filter((d) => d.priority === p && inFilter(d.location_id)).length,
      color: CHART_SERIES[i],
    }))
    .filter((r) => r.value > 0);

  const summary = pack.summary;
  const hasData = packHasNumbers(pack) || pack.decisions.length > 0 || pack.actions.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("weeklyReview.infographics.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pack.review.week_label}
          {" · "}
          {formatReviewDates(pack.review.week_start, pack.review.week_end)}
        </p>
      </header>

      {!hasData ? (
        <Alert>
          <AlertDescription>{t("weeklyReview.infographics.empty")}</AlertDescription>
        </Alert>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <TintedKpiCard compact tint="sky" title={t("weeklyReview.kpi.redemptions")} value={summary.aggregator_redemptions} />
          <TintedKpiCard compact tint="green" title={t("weeklyReview.kpi.deals")} value={summary.corporate_deals} />
          <TintedKpiCard compact tint="orange" title={t("weeklyReview.kpi.decisions")} value={summary.decisions_pending} />
          <TintedKpiCard
            compact
            tint="amber"
            title={t("weeklyReview.kpi.actions")}
            value={`${summary.actions_open} / ${summary.actions_total}`}
          />
          <TintedKpiCard compact tint="red" title={t("weeklyReview.kpi.incidents")} value={summary.incidents} />
          <TintedKpiCard compact tint="sky" title={t("weeklyReview.kpi.reviews")} value={summary.new_reviews} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("weeklyReview.infographics.platformShare")} subtitle={t("weeklyReview.sections.aggregatorsPlatform")}>
          {totalRed === 0 ? (
            <ChartEmpty label={t("weeklyReview.infographics.noChart")} className="h-56" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byPlatform.filter((r) => r.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {byPlatform
                      .filter((r) => r.value > 0)
                      .map((row, i) => (
                        <Cell key={row.name} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                      ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t("weeklyReview.infographics.pace")} subtitle={t("weeklyReview.sections.pace")}>
          <ul className="space-y-3">
            {byPlatform.map((row) => {
              const max = Math.max(row.value, row.pace, 1);
              return (
                <li key={row.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{row.name}</span>
                    <span className="tabular-nums">
                      {row.value} / {row.pace}
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(row.value / max) * 100}%` }}
                    />
                    <span
                      className="absolute top-[-3px] h-4 w-0.5 bg-foreground"
                      style={{ left: `${(row.pace / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        <ChartCard title={t("weeklyReview.infographics.venueShare")}>
          {byVenue.length === 0 ? (
            <ChartEmpty label={t("weeklyReview.infographics.noChart")} className="h-56" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byVenue} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {byVenue.map((row, i) => (
                      <Cell key={row.name} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t("weeklyReview.infographics.actionsMix")}>
          {actionPie.length === 0 ? (
            <ChartEmpty label={t("weeklyReview.infographics.noChart")} className="h-56" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={actionPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {actionPie.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t("weeklyReview.infographics.priorityMix")} className="lg:col-span-2">
          {priorityPie.length === 0 ? (
            <ChartEmpty label={t("weeklyReview.infographics.noChart")} className="h-40" />
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={priorityPie} dataKey="value" nameKey="name" innerRadius={36} outerRadius={64} paddingAngle={2}>
                    {priorityPie.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

"use client";

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
import { useTranslation } from "react-i18next";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { CHART, chartGridProps, chartTick, chartTooltipStyle, CHART_MARGIN } from "@/lib/chart-theme";

const TREND_MARGIN = { top: 12, right: 16, left: 8, bottom: 16 } as const;

export function CorporateDealsTop10Chart({
  top10,
}: {
  top10: Array<{ partner_name: string; redemptions: number; discount: number }>;
}) {
  const { t } = useTranslation();
  return (
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
  );
}

export function CorporateDealsCorpVsAggChart({
  split,
}: {
  split: {
    corporate: { discount: number; redemptions: number };
    aggregator: { discount: number; redemptions: number };
  } | null;
}) {
  const { t } = useTranslation();
  return (
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
  );
}

export function CorporateDealsWeeklyTrendChart({
  weeklyTrend,
}: {
  weeklyTrend: Array<{ iso_week: string; corporate_discount: number; aggregator_discount: number }>;
}) {
  const { t } = useTranslation();
  return (
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
              <Line
                type="monotone"
                dataKey="corporate_discount"
                stroke={CHART.info}
                name={t("corporateDeals.category.corporate")}
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="aggregator_discount"
                stroke={CHART.amber}
                name={t("corporateDeals.category.aggregator")}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export function CorporateDealsMonthlyTrendChart({
  monthlyTrend,
}: {
  monthlyTrend: Array<{ period_month: string; corporate_discount: number; aggregator_discount: number }>;
}) {
  const { t } = useTranslation();
  return (
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
              <Line
                type="monotone"
                dataKey="corporate_discount"
                stroke={CHART.info}
                name={t("corporateDeals.category.corporate")}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="aggregator_discount"
                stroke={CHART.amber}
                name={t("corporateDeals.category.aggregator")}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

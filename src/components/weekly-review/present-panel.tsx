"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";

import { ChartCard } from "@/components/charts/chart-card";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteLabel, type SiteOption } from "@/components/weekly-review/fields";
import {
  AGGREGATOR_PLATFORMS,
  AGGREGATOR_WEEKLY_PACE,
  CORPORATE_DEALS_SHEET_URL,
  formatReviewDates,
  INCIDENT_LOCATION_CODES,
  INSTAGRAM_HANDLES,
  LOCATION_SHORT_NAME,
} from "@/lib/weekly-review/constants";
import { CHART, CHART_MARGIN, chartGridProps, chartTick, chartTooltipStyle } from "@/lib/chart-theme";
import { fmtQar } from "@/lib/currency";
import { delta, formatDelta, packHasNumbers, type ReviewPack } from "@/lib/weekly-review/model";
import { cn } from "@/lib/utils";
import type { ReviewListItem } from "@/lib/queries/weekly-review.core";

const PRIORITY_BORDER = {
  critical: "border-l-4 border-destructive",
  safety: "border-l-4 border-amber-500",
  security: "border-l-4 border-amber-500",
  commercial: "border-l-4 border-sky-600",
  other: "border-l-4 border-muted-foreground/40",
} as const;

export function PresentPanel({
  pack,
  sites,
  list,
  locationFilter,
  onEnter,
}: {
  pack: ReviewPack;
  sites: SiteOption[];
  list: ReviewListItem[];
  locationFilter: string[] | null;
  onEnter?: () => void;
}) {
  const { t } = useTranslation();
  const summary = pack.summary;
  const inFilter = (locationId: string | null) =>
    !locationFilter || !locationId || locationFilter.includes(locationId);

  const aggregators = pack.aggregators.filter((r) => inFilter(r.location_id));
  const corporate = pack.corporate.filter((r) => inFilter(r.location_id));
  const social = pack.social.filter((r) => inFilter(r.location_id));
  const loyalty = pack.loyalty.filter((r) => inFilter(r.location_id));
  const incidents = pack.incidents.filter((r) => inFilter(r.location_id));
  const decisions = pack.decisions.filter((r) => inFilter(r.location_id));

  const byPlatform = AGGREGATOR_PLATFORMS.map((platform) => ({
    platform,
    redemptions: aggregators.filter((a) => a.platform === platform).reduce((s, a) => s + a.redemptions, 0),
    pace: AGGREGATOR_WEEKLY_PACE[platform],
  }));
  const totalRed = aggregators.reduce((s, a) => s + a.redemptions, 0);
  const byVenue = sites
    .filter((s) => aggregators.some((a) => a.location_id === s.id))
    .map((s) => {
      const value = aggregators.filter((a) => a.location_id === s.id).reduce((n, a) => n + a.redemptions, 0);
      return { venue: siteLabel(s), value, share: totalRed ? Math.round((value / totalRed) * 100) : 0 };
    });

  const companyBars = Object.values(
    corporate.reduce<Record<string, { company: string; deals: number; revenue: number }>>((acc, row) => {
      const key = row.company || "Unnamed";
      acc[key] ??= { company: key, deals: 0, revenue: 0 };
      acc[key].deals += row.deals;
      acc[key].revenue += row.revenue_qar;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 8);

  const actionsOpen = pack.actions.filter((a) => a.status === "open");
  const actionsWip = pack.actions.filter((a) => a.status === "wip");
  const actionsDone = pack.actions.filter((a) => a.status === "done");
  const actionTotal = pack.actions.length || 1;

  const incidentSites = sites.filter((s) => (INCIDENT_LOCATION_CODES as readonly string[]).includes(s.code));

  const trends = useMemo(
    () =>
      [...list].reverse().map((item) => ({
        week: item.review.week_label,
        redemptions: item.summary?.aggregator_redemptions ?? 0,
        deals: item.summary?.corporate_deals ?? 0,
        reviews: item.summary?.new_reviews ?? 0,
      })),
    [list],
  );

  const kpi = (title: string, value: string | number, prev: number | null | undefined, current: number) => (
    <TintedKpiCard compact title={title} value={value} hint={formatDelta(delta(current, prev))} tint="sky" />
  );

  return (
    <div className="space-y-8">
      <header className="weekly-review-section flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("weeklyReview.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pack.review.week_label}
            {" · "}
            {formatReviewDates(pack.review.week_start, pack.review.week_end)}
            {" · "}
            {t("weeklyReview.presenter", {
              name: pack.review.prepared_by_name || t("common.user"),
            })}
          </p>
        </div>
        {onEnter ? (
          <Button type="button" className="print:hidden" onClick={onEnter}>
            {t("weeklyReview.enterThisWeek")}
          </Button>
        ) : null}
      </header>

      {!packHasNumbers(pack) ? (
        <Alert className="print:hidden">
          <AlertDescription>{t("weeklyReview.noNumbers")}</AlertDescription>
        </Alert>
      ) : null}

      {summary ? (
        <div className="weekly-review-section grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kpi(
            t("weeklyReview.kpi.redemptions"),
            summary.aggregator_redemptions,
            summary.prev_aggregator_redemptions,
            summary.aggregator_redemptions,
          )}
          {kpi(
            t("weeklyReview.kpi.deals"),
            summary.corporate_deals,
            summary.prev_corporate_deals,
            summary.corporate_deals,
          )}
          {kpi(
            t("weeklyReview.kpi.decisions"),
            summary.decisions_pending,
            summary.prev_decisions_pending,
            summary.decisions_pending,
          )}
          {kpi(
            t("weeklyReview.kpi.actions"),
            `${summary.actions_open} / ${summary.actions_total}`,
            summary.prev_actions_open,
            summary.actions_open,
          )}
          {kpi(t("weeklyReview.kpi.incidents"), summary.incidents, summary.prev_incidents, summary.incidents)}
          {kpi(t("weeklyReview.kpi.reviews"), summary.new_reviews, summary.prev_new_reviews, summary.new_reviews)}
        </div>
      ) : null}

      {pack.review.notes ? (
        <section className="weekly-review-section">
          <h2 className="text-lg font-semibold">{t("weeklyReview.sections.notes")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{pack.review.notes}</p>
        </section>
      ) : null}

      <section className="weekly-review-section">
        <h2 className="text-lg font-semibold">{t("weeklyReview.sections.decisions")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {decisions.map((d) => (
            <article
              key={d.id}
              className={cn(
                "rounded-2xl border border-border/60 bg-card p-4",
                PRIORITY_BORDER[d.priority],
                d.outcome !== "pending" && "opacity-60",
              )}
            >
              <div className="flex flex-wrap gap-2">
                <Badge variant={d.priority === "critical" ? "destructive" : d.priority === "other" ? "muted" : "warning"}>
                  {t(`weeklyReview.priority.${d.priority}`)}
                </Badge>
                {d.outcome !== "pending" ? (
                  <Badge variant="outline">{t(`weeklyReview.outcome.${d.outcome}`)}</Badge>
                ) : null}
              </div>
              <p className="mt-2 font-medium">{d.matter || d.decision_required}</p>
              {d.decision_required && d.matter ? (
                <p className="mt-1 text-sm text-muted-foreground">{d.decision_required}</p>
              ) : null}
              {d.venue_text ? <p className="mt-1 text-xs text-muted-foreground">{d.venue_text}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="weekly-review-section grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">{t("weeklyReview.sections.aggregators")}</h2>
          <p className="text-sm text-muted-foreground">{t("weeklyReview.sections.aggregatorsPlatform")}</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPlatform} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="platform" tick={chartTick} />
                <YAxis tick={chartTick} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="redemptions" fill={CHART.teal} name={t("weeklyReview.fields.redemptions")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-2">
            {byPlatform.map((row) => (
              <li key={row.platform} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{row.platform}</span>
                  <span className="tabular-nums">
                    {row.redemptions} / {t("weeklyReview.sections.pace")} {row.pace}
                  </span>
                </div>
                <PaceBar value={row.redemptions} pace={row.pace} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t("weeklyReview.sections.aggregatorsVenue")}</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byVenue} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="venue" tick={chartTick} />
                <YAxis tick={chartTick} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="share" fill={CHART.gold} name={t("weeklyReview.share")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="weekly-review-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("weeklyReview.sections.corporate")}</h2>
          {CORPORATE_DEALS_SHEET_URL ? (
            <a
              href={CORPORATE_DEALS_SHEET_URL}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline print:hidden"
            >
              {t("weeklyReview.sections.corporateSheet")}
            </a>
          ) : null}
        </div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={companyBars} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="company" tick={chartTick} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={chartTick} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="deals" fill={CHART.info} name={t("weeklyReview.fields.deals")} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">{t("weeklyReview.fields.company")}</th>
              <th className="py-1">{t("weeklyReview.fields.deals")}</th>
              <th className="py-1">{t("weeklyReview.fields.revenue")}</th>
            </tr>
          </thead>
          <tbody>
            {corporate.map((row) => (
              <tr key={row.id} className="border-t border-border/40">
                <td className="py-1.5">{row.company}</td>
                <td className="py-1.5 tabular-nums">{row.deals}</td>
                <td className="py-1.5 tabular-nums">{fmtQar(row.revenue_qar)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-1.5">{t("common.all")}</td>
              <td className="py-1.5 tabular-nums">{corporate.reduce((s, r) => s + r.deals, 0)}</td>
              <td className="py-1.5 tabular-nums">{fmtQar(corporate.reduce((s, r) => s + r.revenue_qar, 0))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="weekly-review-section">
        <h2 className="text-lg font-semibold">{t("weeklyReview.sections.reviews")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {social.map((row) => {
            const site = sites.find((s) => s.id === row.location_id);
            const loy = loyalty.find((l) => l.location_id === row.location_id);
            const prev = pack.previous_social.find((s) => s.location_id === row.location_id);
            const prevLoy = pack.previous_loyalty.find((l) => l.location_id === row.location_id);
            return (
              <article key={row.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <h3 className="font-semibold">{site ? siteLabel(site) : LOCATION_SHORT_NAME[row.location_id]}</h3>
                {site ? (
                  <p className="text-xs text-muted-foreground">{INSTAGRAM_HANDLES[site.code]}</p>
                ) : null}
                <p className="mt-2 text-2xl font-bold tabular-nums">{row.google_rating ?? "-"}</p>
                <p className="text-sm text-muted-foreground">
                  {row.total_reviews} {t("weeklyReview.fields.totalReviews").toLowerCase()}
                  {prev ? ` (${formatDelta(delta(row.total_reviews, prev.total_reviews)) ?? ""})` : ""}
                </p>
                <p className="mt-2 text-sm">
                  {t("weeklyReview.fields.campaign")}: {row.new_reviews_campaign}
                  {" · "}
                  {t("weeklyReview.fields.organic")}: {row.new_reviews_organic}
                </p>
                <p className="text-sm">
                  {t("weeklyReview.fields.followers")}: {row.ig_followers}
                  {prev ? ` (${formatDelta(delta(row.ig_followers, prev.ig_followers)) ?? ""})` : ""}
                </p>
                <p className="text-sm">
                  {t("weeklyReview.fields.rewards15")}: {row.rewards_15min}
                </p>
                {loy ? (
                  <div className="mt-3 border-t border-border/50 pt-3 text-sm">
                    <p>
                      {t("weeklyReview.fields.newMembers")}: {loy.new_members}
                    </p>
                    <p>
                      {t("weeklyReview.fields.activeMembers")}: {loy.active_members}
                      {prevLoy
                        ? ` (${formatDelta(delta(loy.active_members, prevLoy.active_members)) ?? ""})`
                        : ""}
                    </p>
                    <p>
                      {t("weeklyReview.fields.rewardsRedeemed")}: {loy.rewards_redeemed}
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="weekly-review-section">
        <h2 className="text-lg font-semibold">{t("weeklyReview.sections.actions")}</h2>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-600" style={{ width: `${(actionsDone.length / actionTotal) * 100}%` }} />
          <div className="bg-amber-500" style={{ width: `${(actionsWip.length / actionTotal) * 100}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${(actionsOpen.length / actionTotal) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("weeklyReview.actionStatus.done")} {actionsDone.length}
          {" · "}
          {t("weeklyReview.actionStatus.wip")} {actionsWip.length}
          {" · "}
          {t("weeklyReview.actionStatus.open")} {actionsOpen.length}
        </p>
        <ul className="mt-3 space-y-2">
          {[...actionsOpen, ...actionsWip].map((row) => (
            <li key={row.id} className="rounded-xl border border-border/50 px-3 py-2 text-sm">
              <span className="font-medium">{row.action}</span>
              <span className="text-muted-foreground">
                {" · "}
                {row.owner ?? ""}
                {row.due ? ` · ${row.due}` : ""}
                {row.venue_text ? ` · ${row.venue_text}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {actionsDone.length ? <ClosedItems rows={actionsDone} /> : null}
      </section>

      <section className="weekly-review-section">
        <h2 className="text-lg font-semibold">{t("weeklyReview.sections.incidents")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {incidentSites.map((site) => {
            const rows = incidents.filter((i) => i.location_id === site.id);
            return (
              <article key={site.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <h3 className="font-semibold">{siteLabel(site)}</h3>
                {rows.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t("weeklyReview.noneReported")}</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {rows.map((row) => (
                      <li key={row.id}>
                        {row.description}
                        {row.closed ? (
                          <Badge variant="success" className="ms-2">
                            {t("weeklyReview.fields.closed")}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {trends.length >= 2 ? (
        <section className="weekly-review-section grid gap-4 lg:grid-cols-3">
          <h2 className="col-span-full text-lg font-semibold">{t("weeklyReview.sections.trends")}</h2>
          <TrendCard title={t("weeklyReview.kpi.redemptions")} data={trends} dataKey="redemptions" />
          <TrendCard title={t("weeklyReview.kpi.deals")} data={trends} dataKey="deals" />
          <TrendCard title={t("weeklyReview.kpi.reviews")} data={trends} dataKey="reviews" />
        </section>
      ) : null}
    </div>
  );
}

function PaceBar({ value, pace }: { value: number; pace: number }) {
  const max = Math.max(value, pace, 1);
  return (
    <div className="relative h-2 rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary/80" style={{ width: `${(value / max) * 100}%` }} />
      <span
        className="absolute top-[-2px] h-3 w-0.5 bg-foreground"
        style={{ left: `${(pace / max) * 100}%` }}
        title={String(pace)}
      />
    </div>
  );
}

function ClosedItems({ rows }: { rows: ReviewPack["actions"] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <Button type="button" variant="ghost" size="sm" className="print:hidden" onClick={() => setOpen((v) => !v)}>
        {t("weeklyReview.closedCollapsed")} ({rows.length})
      </Button>
      {open ? (
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          {rows.map((row) => (
            <li key={row.id}>{row.action}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TrendCard({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
}) {
  return (
    <ChartCard title={title}>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="week" tick={chartTick} />
            <YAxis tick={chartTick} width={32} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Line type="monotone" dataKey={dataKey} stroke={CHART.teal} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

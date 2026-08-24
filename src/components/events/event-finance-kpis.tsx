"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Gauge, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { fmtQar } from "@/lib/currency";
import type { EventBudgetTotals } from "@/lib/events/types";

function money(value: number | null | undefined) {
  return value == null ? "—" : fmtQar(value);
}

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value)}%`;
}

const PRIMARY: Array<{
  field: keyof EventBudgetTotals;
  key: string;
  hint?: string;
  icon: LucideIcon;
  tint: KpiTint;
  isPct?: boolean;
  optional?: boolean;
}> = [
  { field: "revised", key: "kpiBudget", hint: "kpiBudgetHint", icon: Wallet, tint: "sky" },
  { field: "actual", key: "kpiSpent", hint: "kpiSpentHint", icon: BarChart3, tint: "amber" },
  { field: "committed", key: "kpiCommitted", hint: "kpiCommittedHint", icon: ClipboardList, tint: "orange" },
  { field: "remaining", key: "kpiRemaining", hint: "kpiRemainingHint", icon: CheckCircle2, tint: "orange" },
  { field: "varianceForecast", key: "kpiVariance", hint: "kpiVarianceHint", icon: AlertTriangle, tint: "orange" },
  { field: "forecastMarginPct", key: "kpiMargin", hint: "kpiMarginHint", icon: Gauge, tint: "green", isPct: true, optional: true },
];

const MORE_KEYS = [
  ["contractValue", "contract"],
  ["finalRevenue", "finalRevenue"],
  ["original", "original"],
  ["forecast", "forecast"],
  ["varianceCommitted", "varianceCommitted"],
  ["forecastProfit", "forecastProfit"],
  ["originalMarginPct", "originalMargin"],
  ["revisedMarginPct", "revisedMargin"],
  ["actualMarginPct", "actualMargin"],
  ["receivable", "receivable"],
] as const;

function negativeTint(field: keyof EventBudgetTotals, raw: EventBudgetTotals[keyof EventBudgetTotals]): boolean {
  return typeof raw === "number" && raw < 0 && (field === "remaining" || String(field).startsWith("variance") || String(field).includes("Profit"));
}

export function EventFinanceKpis({ finance }: { finance: EventBudgetTotals }) {
  const { t } = useTranslation();
  const cards = PRIMARY.filter((row) => !row.optional || (typeof finance[row.field] === "number" && Number.isFinite(finance[row.field] as number)));
  const cols = cards.length >= 6 ? "xl:grid-cols-6" : cards.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4";

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cols}`}>
      {cards.map((row) => {
        const raw = finance[row.field];
        const warn = negativeTint(row.field, raw);
        return (
          <TintedKpiCard
            key={row.field}
            title={t(`events.budget.${row.key}`)}
            value={row.isPct ? pct(raw as number | null) : money(raw as number | null)}
            hint={row.hint ? t(`events.budget.${row.hint}`) : undefined}
            icon={row.icon}
            tint={warn ? "red" : row.tint}
          />
        );
      })}
    </div>
  );
}

export function EventFinanceMoreFigures({ finance }: { finance: EventBudgetTotals }) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
      {MORE_KEYS.map(([field, key]) => {
        const raw = finance[field];
        const isPct = field.endsWith("Pct");
        return (
          <div key={field} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t(`events.budget.${key}`)}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{isPct ? pct(raw) : money(raw)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

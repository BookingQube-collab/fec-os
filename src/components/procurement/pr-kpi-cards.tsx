"use client";

import { BarChart3, Clock, FileText, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { fmtQar } from "@/lib/currency";

export type PrKpiStripValues = {
  approvedAmount: number;
  approvedCount: number;
  pendingAmount: number;
  pendingCount: number;
  activeCount: number;
  awaitingCount: number;
};

const PR_TINT: Record<"green" | "amber" | "slate" | "orange", KpiTint> = {
  green: "green",
  amber: "orange",
  slate: "sky",
  orange: "amber",
};

export function PrKpiStrip({ values, loading }: { values: PrKpiStripValues; loading?: boolean }) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[7.25rem] animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <TintedKpiCard
        title={t("procurement.kpi.totalApproved")}
        value={fmtQar(values.approvedAmount)}
        hint={t("procurement.kpi.approvedRequests", { n: values.approvedCount })}
        icon={TrendingUp}
        tint={PR_TINT.green}
        empty={values.approvedCount === 0}
      />
      <TintedKpiCard
        title={t("procurement.kpi.pendingDecisions")}
        value={fmtQar(values.pendingAmount)}
        hint={t("procurement.kpi.pendingRequests", { n: values.pendingCount })}
        icon={BarChart3}
        tint={PR_TINT.amber}
        empty={values.pendingCount === 0}
      />
      <TintedKpiCard
        title={t("procurement.kpi.activeRequests")}
        value={t("procurement.kpi.reqCount", { n: values.activeCount })}
        hint={t("procurement.kpi.activeWorkflow", { n: values.activeCount })}
        icon={FileText}
        tint={PR_TINT.slate}
        empty={values.activeCount === 0}
      />
      <TintedKpiCard
        title={t("procurement.kpi.awaitingSignoffs")}
        value={t("procurement.kpi.reqCount", { n: values.awaitingCount })}
        hint={t("procurement.kpi.awaitingDecision", { n: values.awaitingCount })}
        icon={Clock}
        tint={PR_TINT.orange}
        empty={values.awaitingCount === 0}
      />
    </div>
  );
}

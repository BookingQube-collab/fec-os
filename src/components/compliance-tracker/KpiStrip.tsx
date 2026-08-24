"use client";

import { useTranslation } from "react-i18next";

import type { ComplianceKpis } from "@/lib/compliance-tracker/aggregations";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";

type KpiCard = {
  label: string;
  value: number | string;
  tint?: KpiTint;
  bg?: string;
  text?: string;
};

type KpiStripProps = {
  kpis: ComplianceKpis;
  extra?: KpiCard[];
};

export function KpiStrip({ kpis, extra }: KpiStripProps) {
  const { t } = useTranslation();
  const cards: KpiCard[] = extra ?? [
    { label: t("e3Tracker.kpis.total"), value: kpis.total, tint: "sky" },
    { label: t("e3Tracker.kpis.compliant"), value: kpis.compliant, tint: "green" },
    { label: t("e3Tracker.kpis.expiring30"), value: kpis.expiring30, tint: "amber" },
    { label: t("e3Tracker.kpis.overdue"), value: kpis.overdue, tint: "red" },
    { label: t("e3Tracker.kpis.missing"), value: kpis.missing, tint: "red" },
  ];

  return (
    <div
      className={`grid grid-cols-2 gap-2.5 ${cards.length === 4 ? "md:grid-cols-4" : "md:grid-cols-5"}`}
    >
      {cards.map((card) => (
        <TintedKpiCard
          key={card.label}
          title={card.label}
          value={card.value}
          tint={card.tint ?? "sky"}
          compact
        />
      ))}
    </div>
  );
}

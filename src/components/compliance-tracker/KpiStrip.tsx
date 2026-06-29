"use client";

import type { ComplianceKpis } from "@/lib/compliance-tracker/aggregations";

type KpiCard = {
  label: string;
  value: number | string;
  bg: string;
  text: string;
};

type KpiStripProps = {
  kpis: ComplianceKpis;
  extra?: KpiCard[];
};

export function KpiStrip({ kpis, extra }: KpiStripProps) {
  const cards: KpiCard[] = extra ?? [
    { label: "Total Items", value: kpis.total, bg: "#0B1F3A", text: "#FFFFFF" },
    { label: "Compliant", value: kpis.compliant, bg: "#1E7B45", text: "#FFFFFF" },
    {
      label: "Expiring ≤30 Days",
      value: kpis.expiring30,
      bg: "#E8A33D",
      text: "#0A1228",
    },
    { label: "Overdue", value: kpis.overdue, bg: "#C0392B", text: "#FFFFFF" },
    { label: "Missing", value: kpis.missing, bg: "#C0392B", text: "#FFFFFF" },
  ];

  return (
    <div className={`grid grid-cols-2 gap-3 ${cards.length === 4 ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg px-4 py-3 shadow-sm"
          style={{ backgroundColor: card.bg, color: card.text }}
        >
          <div className="text-xs font-medium uppercase tracking-wide opacity-90">{card.label}</div>
          <div className="font-display mt-1 text-2xl font-semibold">{card.value}</div>
        </div>
      ))}
    </div>
  );
}

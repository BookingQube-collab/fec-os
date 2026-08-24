"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { useComplianceCalendarMonth } from "@/hooks/queries/useComplianceSubpages";
import { formatDisplayDate } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ComplianceCalendarItemsPage() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useComplianceCalendarMonth({ year, month });

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceCalendar",
    title: t("complianceHub.calendar.itemsTitle"),
    venueLabel: t("common.all"),
    filters: { year: String(year), month: String(month) },
    kpis: [
      { label: t("complianceHub.calendar.renewalsThisMonth"), value: data?.count ?? 0 },
      { label: t("complianceHub.calendar.renewalCost"), value: `QAR ${(data?.renewal_cost ?? 0).toLocaleString()}` },
    ],
    columns: [
      { key: "item_name", header: t("amc.columns.item") },
      { key: "domain", header: t("amc.columns.domain") },
      { key: "governing_date", header: t("amc.columns.date"), format: "date" },
      { key: "renewal_cost", header: t("amc.columns.cost"), format: "qar" },
    ],
    rows: (data?.items ?? []) as Record<string, unknown>[],
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = now.toISOString().slice(0, 10);

  return (
    <CompliancePageShell
      title={t("complianceHub.calendar.itemsTitle")}
      subtitle={t("complianceHub.calendar.itemsSubtitle")}
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
      filters={
        <>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] bg-zinc-800 text-zinc-50"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[120px] bg-zinc-800 text-zinc-50"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{new Date(2000, m - 1).toLocaleString(i18n.language === "ar" ? "ar-QA" : "en", { month: "long" })}</SelectItem>)}</SelectContent>
          </Select>
        </>
      }
    >
      <KpiStrip items={[
        { label: t("complianceHub.calendar.thisMonth"), value: data?.count ?? "—" },
        { label: t("complianceHub.calendar.renewalCost"), value: `QAR ${(data?.renewal_cost ?? 0).toLocaleString()}` },
      ]} />
      {isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : (
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
            const count = data?.by_day.find((x) => x.date === d)?.count ?? 0;
            return (
              <div key={d} className={`rounded border p-2 ${d === today ? "border-primary" : "border-border"} ${count ? "bg-amber-500/10" : "bg-card"}`}>
                <div className="font-medium">{i + 1}</div>
                {count > 0 && <div className="text-amber-400">{count}</div>}
              </div>
            );
          })}
        </div>
      )}
      <ul className="mt-4 space-y-1 text-sm">
        {(data?.items ?? []).map((i) => (
          <li key={i.id}>{formatDisplayDate(i.governing_date as string)} — {i.item_name} ({i.domain})</li>
        ))}
      </ul>
    </CompliancePageShell>
  );
}

export default ComplianceCalendarItemsPage;

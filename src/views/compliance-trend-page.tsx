"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useComplianceTrend } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { retryImport } from "@/lib/retry-import";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ComplianceTrendCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/compliance/compliance-trend-charts").then((m) => m.ComplianceTrendCharts),
    ),
  { ssr: false, loading: () => <Skeleton className="h-64 rounded-lg" /> },
);

function ComplianceTrendPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useComplianceTrend({ year });

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceTrend",
    title: "Compliance Trend",
    venueLabel: "All",
    filters: { year: String(year) },
    kpis: [],
    columns: [
      { key: "month", header: "Month" },
      { key: "renewals_due", header: "Renewals due" },
      { key: "services_completed", header: "Services completed" },
      { key: "renewal_cost", header: "Cost", format: "qar" },
    ],
    rows: (data?.months ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title="Compliance Trend" subtitle="Renewals due vs services completed by month" onExportPdf={exportPdf} onExportExcel={exportExcel}
      filters={
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[100px] bg-zinc-800 text-zinc-50"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      }
    >
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <ComplianceTrendCharts months={data?.months ?? []} />
      )}
    </CompliancePageShell>
  );
}

export default ComplianceTrendPage;

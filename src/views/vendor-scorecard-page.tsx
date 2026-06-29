"use client";

import dynamic from "next/dynamic";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorScorecard } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { retryImport } from "@/lib/retry-import";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const VendorScorecardChart = dynamic(
  () =>
    retryImport(() =>
      import("@/components/compliance/vendor-scorecard-chart").then((m) => m.VendorScorecardChart),
    ),
  { ssr: false, loading: () => <Skeleton className="mb-4 h-56 rounded-lg" /> },
);

function VendorScorecardPage() {
  const { data: rows, isLoading } = useVendorScorecard({});

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "VendorScorecard",
    title: "Vendor Scorecard",
    venueLabel: "All",
    kpis: [{ label: "Vendors", value: rows?.length ?? 0 }],
    columns: [
      { key: "vendor", header: "Vendor" },
      { key: "amc_contracts", header: "AMC/License" },
      { key: "service_visits", header: "Visits" },
      { key: "open_repairs", header: "Open repairs" },
      { key: "total_spend", header: "Total spend", format: "qar" },
      { key: "rating", header: "Rating" },
    ],
    rows: (rows ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title="Vendor Scorecard" subtitle="AMC spend, service visits, repairs & on-time performance" onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <VendorScorecardChart rows={rows ?? []} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>AMC/License</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>Open repairs</TableHead>
              <TableHead>On-time %</TableHead>
              <TableHead>AMC spend</TableHead>
              <TableHead>Repair spend</TableHead>
              <TableHead>Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow> : (rows ?? []).map((r) => (
              <TableRow key={r.vendor}>
                <TableCell className="font-medium">{r.vendor}</TableCell>
                <TableCell>{r.amc_contracts}</TableCell>
                <TableCell>{r.service_visits}</TableCell>
                <TableCell>{r.open_repairs}</TableCell>
                <TableCell>{r.on_time_pct != null ? `${Math.round(r.on_time_pct * 100)}%` : "—"}</TableCell>
                <TableCell>QAR {r.amc_spend.toLocaleString()}</TableCell>
                <TableCell>QAR {r.repair_spend.toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{r.rating}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default VendorScorecardPage;

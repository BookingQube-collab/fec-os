"use client";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import { useComplianceServiceHistory } from "@/hooks/queries/useComplianceSubpages";
import { formatDisplayDate } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function resultClass(r: string) {
  if (r === "Pass") return "rag-green";
  if (r === "Pass with Obs.") return "text-blue-400";
  if (r === "Follow-up Needed") return "rag-amber";
  return "rag-red";
}

function AmcServiceHistoryPage() {
  const { data: rows, isLoading } = useComplianceServiceHistory({});

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ServiceHistory",
    title: "AMC Service History",
    venueLabel: "All",
    kpis: [{ label: "Records", value: rows?.length ?? 0 }],
    columns: [
      { key: "service_date", header: "Date", format: "date" },
      { key: "contract_item", header: "Contract/Item" },
      { key: "vendor", header: "Vendor" },
      { key: "venue_scope", header: "Venue" },
      { key: "service_type", header: "Type" },
      { key: "result", header: "Result" },
      { key: "cost", header: "Cost", format: "qar" },
    ],
    rows: (rows ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title="AMC Service History" subtitle="Scheduled PM, inspections, certifications & reactive repairs" onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow> : (rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDisplayDate(r.service_date)}</TableCell>
                <TableCell>{r.contract_item}</TableCell>
                <TableCell>{r.domain ?? "—"}</TableCell>
                <TableCell>{r.vendor ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.venue_scope}</TableCell>
                <TableCell>{r.service_type}</TableCell>
                <TableCell><Badge variant="outline" className={resultClass(r.result)}>{r.result}</Badge></TableCell>
                <TableCell>QAR {r.cost.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default AmcServiceHistoryPage;

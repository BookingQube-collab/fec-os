"use client";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import { useComplianceCoverage } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ComplianceCoveragePage() {
  const { data, isLoading } = useComplianceCoverage({});

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceCoverage",
    title: "Ownership & Coverage Matrix",
    venueLabel: "All",
    kpis: [],
    columns: [
      { key: "domain", header: "Domain" },
      { key: "owner", header: "Owner" },
      { key: "vendor", header: "Vendor" },
      { key: "risk", header: "Risk" },
    ],
    rows: (data?.grid ?? []) as Record<string, unknown>[],
  });

  const locs = data?.locations ?? [];

  return (
    <CompliancePageShell title="Ownership & Coverage Matrix" subtitle="Domain × venue coverage heat map" onExportPdf={exportPdf} onExportExcel={exportExcel}>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  {locs.map((c) => <TableHead key={c} className="text-center font-mono text-xs">{c}</TableHead>)}
                  <TableHead className="text-center">All</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.grid ?? []).map((row) => (
                  <TableRow key={row.domain}>
                    <TableCell className="font-medium">{row.domain}</TableCell>
                    {locs.map((c) => {
                      const n = row.cells[c] ?? 0;
                      const bg = n === 0 ? "bg-red-500/20" : n === 1 ? "bg-amber-500/10" : "bg-blue-500/10";
                      return <TableCell key={c} className={`text-center ${bg}`}>{n}</TableCell>;
                    })}
                    <TableCell className="text-center">{row.cells.All ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Accountable owner</TableHead>
                  <TableHead>Lead vendor</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.grid ?? []).map((row) => (
                  <TableRow key={row.domain}>
                    <TableCell>{row.domain}</TableCell>
                    <TableCell>{String(row.owner)}</TableCell>
                    <TableCell>{String(row.vendor)}</TableCell>
                    <TableCell>{String(row.frequency)}</TableCell>
                    <TableCell>{String(row.risk)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </CompliancePageShell>
  );
}

export default ComplianceCoveragePage;

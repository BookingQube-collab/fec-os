"use client";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { useComplianceAlerts } from "@/hooks/queries/useComplianceSubpages";
import { alertTierClass } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ComplianceAlertsPage() {
  const { data, isLoading } = useComplianceAlerts({});
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceAlerts",
    title: "Alert Center",
    venueLabel: "All",
    kpis: k ? Object.entries(k).map(([label, value]) => ({ label, value: String(value) })) : [],
    columns: [
      { key: "flag", header: "Flag" },
      { key: "item_name", header: "Item" },
      { key: "domain", header: "Domain" },
      { key: "venue_scope", header: "Venue" },
      { key: "days_remaining", header: "Days" },
    ],
    rows: (data?.items ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title="Alert Center" subtitle="Expired, renewal-soon and data-quality flags" onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <KpiStrip
        items={[
          { label: "Expired", value: k?.expired ?? "—", tone: "rag-red" },
          { label: "Due ≤30", value: k?.due_30 ?? "—", tone: "rag-red" },
          { label: "Due ≤60", value: k?.due_60 ?? "—", tone: "rag-amber" },
          { label: "Missing date", value: k?.missing_date ?? "—" },
          { label: "Missing vendor", value: k?.missing_vendor ?? "—" },
        ]}
      />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
            ) : (
              (data?.items ?? []).map((i) => (
                <TableRow key={i.id} className={i.flag === "✔ OK" ? "opacity-50" : ""}>
                  <TableCell>{i.flag}</TableCell>
                  <TableCell>{i.item_name}</TableCell>
                  <TableCell>{i.domain}</TableCell>
                  <TableCell className="font-mono text-xs">{i.venue_scope}</TableCell>
                  <TableCell className={Number(i.days_remaining) < 0 ? "rag-red" : ""}>{i.days_remaining ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={alertTierClass(i.alert_tier as never)}>{i.alert_tier}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default ComplianceAlertsPage;

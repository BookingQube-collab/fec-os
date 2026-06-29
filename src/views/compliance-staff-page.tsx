"use client";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { useStaffReadiness } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function certClass(s: string) {
  if (s === "Valid") return "rag-green";
  if (s === "Expiring") return "rag-amber";
  if (s === "Expired") return "rag-red";
  return "";
}

function ComplianceStaffPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useStaffReadiness({ locationId });
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "StaffReadiness",
    title: "Staff Readiness",
    venueLabel: locationId ? "Branch" : "All",
    kpis: k ? Object.entries(k).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: String(value) })) : [],
    columns: [
      { key: "staff_name", header: "Staff" },
      { key: "role", header: "Role" },
      { key: "readiness_pct", header: "Readiness %" },
    ],
    rows: (data?.staff ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title="Staff Readiness" subtitle="Medical, food handler, first aid & QID certification tracking" onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <KpiStrip items={[
        { label: "Overall readiness", value: `${k?.overall_readiness_pct ?? "—"}%` },
        { label: "Expired certs", value: k?.expired_certificates ?? "—", tone: "rag-red" },
        { label: "Expiring ≤30", value: k?.expiring_30 ?? "—", tone: "rag-amber" },
        { label: "Fully compliant", value: k?.fully_compliant ?? "—" },
        { label: "Staff tracked", value: k?.staff_tracked ?? "—" },
      ]} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Medical</TableHead>
              <TableHead>Food handler</TableHead>
              <TableHead>First aid</TableHead>
              <TableHead>QID</TableHead>
              <TableHead>Readiness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow> : (data?.staff ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.staff_name}</TableCell>
                <TableCell>{s.role ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={certClass(s.certs.medical)}>{s.certs.medical}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={certClass(s.certs.food_handler)}>{s.certs.food_handler}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={certClass(s.certs.first_aid)}>{s.certs.first_aid}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={certClass(s.certs.qid)}>{s.certs.qid}</Badge></TableCell>
                <TableCell>{s.readiness_pct}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default ComplianceStaffPage;

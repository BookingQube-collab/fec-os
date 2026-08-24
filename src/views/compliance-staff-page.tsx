"use client";

import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useStaffReadiness({ locationId });
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "StaffReadiness",
    title: t("complianceHub.staff.title"),
    venueLabel: locationId ? "Branch" : "All",
    kpis: k ? Object.entries(k).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: String(value) })) : [],
    columns: [
      { key: "staff_name", header: t("complianceHub.staff.staff") },
      { key: "role", header: t("complianceHub.staff.role") },
      { key: "readiness_pct", header: t("complianceHub.staff.readinessPct") },
    ],
    rows: (data?.staff ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title={t("complianceHub.staff.title")} subtitle={t("complianceHub.staff.subtitle")} onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <KpiStrip items={[
        { label: t("complianceHub.staff.overallReadiness"), value: `${k?.overall_readiness_pct ?? "—"}%` },
        { label: t("complianceHub.staff.expiredCerts"), value: k?.expired_certificates ?? "—", tone: "rag-red" },
        { label: t("complianceHub.staff.expiring30"), value: k?.expiring_30 ?? "—", tone: "rag-amber" },
        { label: t("complianceHub.staff.fullyCompliant"), value: k?.fully_compliant ?? "—" },
        { label: t("complianceHub.staff.staffTracked"), value: k?.staff_tracked ?? "—" },
      ]} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("complianceHub.staff.staff")}</TableHead>
              <TableHead>{t("complianceHub.staff.role")}</TableHead>
              <TableHead>{t("complianceHub.staff.medical")}</TableHead>
              <TableHead>{t("complianceHub.staff.foodHandler")}</TableHead>
              <TableHead>{t("complianceHub.staff.firstAid")}</TableHead>
              <TableHead>{t("complianceHub.staff.qid")}</TableHead>
              <TableHead>{t("complianceHub.staff.readiness")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7}>{t("common.loading")}</TableCell></TableRow> : (data?.staff ?? []).map((s) => (
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

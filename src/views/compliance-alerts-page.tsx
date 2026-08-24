"use client";

import { useTranslation } from "react-i18next";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { useComplianceAlerts } from "@/hooks/queries/useComplianceSubpages";
import { alertTierClass } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ComplianceAlertsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useComplianceAlerts({});
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceAlerts",
    title: t("complianceHub.alerts.title"),
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
    <CompliancePageShell title={t("complianceHub.alerts.title")} subtitle={t("complianceHub.alerts.subtitle")} onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <KpiStrip
        items={[
          { label: t("complianceHub.alerts.expired"), value: k?.expired ?? "—", tone: "rag-red" },
          { label: t("complianceHub.alerts.due30"), value: k?.due_30 ?? "—", tone: "rag-red" },
          { label: t("complianceHub.alerts.due60"), value: k?.due_60 ?? "—", tone: "rag-amber" },
          { label: t("complianceHub.alerts.missingDate"), value: k?.missing_date ?? "—" },
          { label: t("complianceHub.alerts.missingVendor"), value: k?.missing_vendor ?? "—" },
        ]}
      />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("complianceHub.alerts.flag")}</TableHead>
              <TableHead>{t("complianceHub.alerts.item")}</TableHead>
              <TableHead>{t("complianceHub.alerts.domain")}</TableHead>
              <TableHead>{t("complianceHub.alerts.venue")}</TableHead>
              <TableHead>{t("complianceHub.alerts.days")}</TableHead>
              <TableHead>{t("complianceHub.alerts.tier")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}>{t("common.loading")}</TableCell></TableRow>
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

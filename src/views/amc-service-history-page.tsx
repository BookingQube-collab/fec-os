"use client";

import { useTranslation } from "react-i18next";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import { useComplianceServiceHistory } from "@/hooks/queries/useComplianceSubpages";
import { formatDisplayDate } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { fmtQar } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function resultClass(r: string) {
  if (r === "Pass") return "rag-green";
  if (r === "Pass with Obs.") return "text-blue-400";
  if (r === "Follow-up Needed") return "rag-amber";
  return "rag-red";
}

function AmcServiceHistoryPage() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useComplianceServiceHistory({});

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ServiceHistory",
    title: t("amc.historyTitle"),
    venueLabel: t("common.all"),
    kpis: [{ label: t("amc.records"), value: rows?.length ?? 0 }],
    columns: [
      { key: "service_date", header: t("amc.columns.date"), format: "date" },
      { key: "contract_item", header: t("amc.columns.item") },
      { key: "vendor", header: t("amc.columns.vendor") },
      { key: "venue_scope", header: t("amc.columns.venue") },
      { key: "service_type", header: t("amc.columns.type") },
      { key: "result", header: t("amc.columns.result") },
      { key: "cost", header: t("amc.columns.cost"), format: "qar" },
    ],
    rows: (rows ?? []) as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell title={t("amc.historyTitle")} subtitle={t("amc.historySubtitle")} onExportPdf={exportPdf} onExportExcel={exportExcel}>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("amc.columns.date")}</TableHead>
              <TableHead>{t("amc.columns.item")}</TableHead>
              <TableHead>{t("amc.columns.domain")}</TableHead>
              <TableHead>{t("amc.columns.vendor")}</TableHead>
              <TableHead>{t("amc.columns.venue")}</TableHead>
              <TableHead>{t("amc.columns.type")}</TableHead>
              <TableHead>{t("amc.columns.result")}</TableHead>
              <TableHead>{t("amc.columns.cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8}>{t("common.loading")}</TableCell></TableRow> : (rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDisplayDate(r.service_date)}</TableCell>
                <TableCell>{r.contract_item}</TableCell>
                <TableCell>{r.domain ?? "—"}</TableCell>
                <TableCell>{r.vendor ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.venue_scope}</TableCell>
                <TableCell>{r.service_type}</TableCell>
                <TableCell><Badge variant="outline" className={resultClass(r.result)}>{r.result}</Badge></TableCell>
                <TableCell>{fmtQar(r.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default AmcServiceHistoryPage;

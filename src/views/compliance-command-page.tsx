"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useComplianceCommandCenter } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { retryImport } from "@/lib/retry-import";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtQar } from "@/lib/currency";

const ComplianceCommandCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/compliance/compliance-command-charts").then((m) => m.ComplianceCommandCharts),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    ),
  },
);
function ComplianceCommandPage() {
  const { t } = useTranslation();
  const filters = useMemo(() => ({}), []);
  const [deferLoad, setDeferLoad] = useState(false);

  useEffect(() => {
    const schedule = () => setDeferLoad(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(schedule, { timeout: 500 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(schedule, 100);
    return () => window.clearTimeout(id);
  }, []);

  const { data, isLoading } = useComplianceCommandCenter(filters, { enabled: deferLoad });
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceDashboard",
    title: t("complianceHub.command.title"),
    venueLabel: t("common.all"),
    kpis: k
      ? [
          { label: t("complianceHub.command.totalItems"), value: k.total },
          { label: t("complianceHub.command.active"), value: k.active },
          { label: t("complianceHub.command.expired"), value: k.expired },
          { label: t("complianceHub.command.due30"), value: k.due_30 },
        ]
      : [],
    columns: [
      { key: "domain", header: t("complianceHub.command.domain") },
      { key: "total", header: t("complianceHub.command.total") },
      { key: "expired", header: t("complianceHub.command.expired") },
      { key: "due_30", header: t("complianceHub.command.due30") },
      { key: "health", header: t("complianceHub.command.health") },
    ],
    rows: (data?.by_domain ?? []) as Record<string, unknown>[],
  });

  const statusData = data
    ? [
        { name: t("complianceHub.command.expired"), value: data.status_buckets.expired },
        { name: t("complianceHub.command.due30"), value: data.status_buckets.due30 },
        { name: t("complianceHub.command.due60"), value: data.status_buckets.due60 },
        { name: t("complianceHub.command.ok"), value: data.status_buckets.ok },
      ]
    : [];

  return (
    <CompliancePageShell
      title={t("complianceHub.command.title")}
      subtitle={t("complianceHub.command.subtitle")}
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          <KpiStrip
            items={[
              { label: t("complianceHub.command.totalItems"), value: k?.total ?? "—" },
              { label: t("complianceHub.command.active"), value: k?.active ?? "—" },
              { label: t("complianceHub.command.pendingRenewal"), value: k?.pending_renewal ?? "—" },
              { label: t("complianceHub.command.expired"), value: k?.expired ?? "—", tone: "rag-red" },
              { label: t("complianceHub.command.healthPct"), value: `${k?.health_pct ?? "—"}%` },
              { label: t("complianceHub.command.criticalRisk"), value: k?.critical_risk ?? "—" },
              { label: t("complianceHub.command.due30"), value: k?.due_30 ?? "—", tone: "rag-red" },
              { label: t("complianceHub.command.annualRenewal"), value: fmtQar(k?.annual_renewal_cost ?? 0) },
            ]}
          />

          <ComplianceCommandCharts
            statusData={statusData}
            byDomain={data?.by_domain ?? []}
          />
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("complianceHub.command.domain")}</TableHead>
                  <TableHead>{t("complianceHub.command.total")}</TableHead>
                  <TableHead>{t("complianceHub.command.expired")}</TableHead>
                  <TableHead>{t("complianceHub.command.due30")}</TableHead>
                  <TableHead>{t("complianceHub.command.ok")}</TableHead>
                  <TableHead>{t("complianceHub.command.renewalCost")}</TableHead>
                  <TableHead>{t("complianceHub.command.health")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.by_domain ?? []).map((d) => (
                  <TableRow key={d.domain}>
                    <TableCell>{d.domain}</TableCell>
                    <TableCell>{d.total}</TableCell>
                    <TableCell>{d.expired}</TableCell>
                    <TableCell>{d.due_30}</TableCell>
                    <TableCell>{d.ok}</TableCell>
                    <TableCell>{fmtQar(d.renewal_cost)}</TableCell>
                    <TableCell><Badge variant="outline" className={d.health === "At Risk" ? "rag-red" : d.health === "Watch" ? "rag-amber" : "rag-green"}>{d.health === "At Risk" ? t("complianceHub.command.atRisk") : d.health === "Watch" ? t("complianceHub.command.watch") : t("complianceHub.command.ok")}</Badge></TableCell>
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

export default ComplianceCommandPage;

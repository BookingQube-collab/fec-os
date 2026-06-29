"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useComplianceCommandCenter } from "@/hooks/queries/useComplianceSubpages";
import { useReportExport } from "@/hooks/use-report-export";
import { retryImport } from "@/lib/retry-import";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    title: "Compliance Command Center",
    venueLabel: "All",
    kpis: k
      ? Object.entries(k).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: String(value) }))
      : [],
    columns: [
      { key: "domain", header: "Domain" },
      { key: "total", header: "Total" },
      { key: "expired", header: "Expired" },
      { key: "due_30", header: "Due ≤30" },
      { key: "health", header: "Health" },
    ],
    rows: (data?.by_domain ?? []) as Record<string, unknown>[],
  });

  const statusData = data
    ? [
        { name: "Expired", value: data.status_buckets.expired },
        { name: "Due ≤30", value: data.status_buckets.due30 },
        { name: "Due ≤60", value: data.status_buckets.due60 },
        { name: "OK", value: data.status_buckets.ok },
      ]
    : [];

  return (
    <CompliancePageShell
      title="Compliance Command Center"
      subtitle="Portfolio compliance health, domain breakdown & renewal exposure"
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <KpiStrip
            items={[
              { label: "Total items", value: k?.total ?? "—" },
              { label: "Active", value: k?.active ?? "—" },
              { label: "Pending renewal", value: k?.pending_renewal ?? "—" },
              { label: "Expired", value: k?.expired ?? "—", tone: "rag-red" },
              { label: "Health %", value: `${k?.health_pct ?? "—"}%` },
              { label: "Critical risk", value: k?.critical_risk ?? "—" },
              { label: "Due ≤30", value: k?.due_30 ?? "—", tone: "rag-red" },
              { label: "Annual renewal", value: `QAR ${(k?.annual_renewal_cost ?? 0).toLocaleString()}` },
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
                  <TableHead>Domain</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Expired</TableHead>
                  <TableHead>Due ≤30</TableHead>
                  <TableHead>OK</TableHead>
                  <TableHead>Renewal cost</TableHead>
                  <TableHead>Health</TableHead>
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
                    <TableCell>QAR {d.renewal_cost.toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className={d.health === "At Risk" ? "rag-red" : d.health === "Watch" ? "rag-amber" : "rag-green"}>{d.health}</Badge></TableCell>
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

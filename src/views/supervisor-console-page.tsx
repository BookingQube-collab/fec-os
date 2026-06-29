"use client";

import Link from "next/link";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupervisorConsole } from "@/hooks/queries/useComplianceSubpages";
import { alertTierClass } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function SupervisorConsolePage() {
  const locationId = useAppStore((s) => s.currentLocationId);

  const { data, isLoading } = useSupervisorConsole(locationId ?? undefined, { enabled: !!locationId });
  const k = data?.kpis;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "SupervisorConsole",
    title: "Supervisor Console",
    venueLabel: data?.location?.code ?? "—",
    kpis: k ? Object.entries(k).map(([label, value]) => ({ label: label.replace(/_/g, " "), value: String(value) })) : [],
    columns: [
      { key: "entry_ref", header: "Ref" },
      { key: "category", header: "Category" },
      { key: "priority", header: "Priority" },
      { key: "status", header: "Status" },
    ],
    rows: (data?.issues ?? []) as Record<string, unknown>[],
  });

  if (!locationId) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-dashed p-8 text-center">
        <h2 className="text-lg font-semibold">Select a venue</h2>
        <p className="mt-2 text-sm text-muted-foreground">Use the branch selector in the top bar to open the supervisor console for your site.</p>
      </div>
    );
  }

  return (
    <CompliancePageShell
      title={`Supervisor Console — ${data?.location?.name ?? ""}`}
      subtitle={`${data?.location?.code} · ${data?.today ?? ""}`}
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
    >
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild><Link href="/tasks/supervisor">Daily checklist</Link></Button>
        <Button variant="outline" size="sm" asChild><Link href="/issues">Issues</Link></Button>
      </div>
      {isLoading ? <KpiSkeletonStrip count={7} /> : (
        <KpiStrip items={[
          { label: "Open issues", value: k?.open_issues ?? "—" },
          { label: "Overdue", value: k?.overdue ?? "—", tone: "rag-red" },
          { label: "Critical open", value: k?.critical_open ?? "—", tone: "rag-red" },
          { label: "Opening readiness", value: `${k?.opening_readiness_pct ?? "—"}%` },
          { label: "Due ≤30", value: k?.due_30 ?? "—", tone: "rag-amber" },
          { label: "Expired", value: k?.expired ?? "—", tone: "rag-red" },
          { label: "Cost exposure", value: `QAR ${(k?.open_cost_exposure ?? 0).toLocaleString()}` },
        ]} />
      )}

      <h3 className="text-sm font-medium">Daily issue log</h3>
      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.issues ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No issues logged.</TableCell></TableRow>
              ) : (data?.issues ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.entry_ref ?? "—"}</TableCell>
                  <TableCell>{i.log_date}</TableCell>
                  <TableCell>{i.category}</TableCell>
                  <TableCell>{i.priority}</TableCell>
                  <TableCell>{i.status}</TableCell>
                  <TableCell className={i.due_date && i.due_date < (data?.today ?? "") ? "rag-red" : ""}>{i.due_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h3 className="mt-4 text-sm font-medium">My compliance & AMC</h3>
      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.compliance_items ?? []).slice(0, 15).map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.item_name}</TableCell>
                  <TableCell>{i.domain}</TableCell>
                  <TableCell>{i.venue_scope}{i.venue_scope === "All" ? " (group)" : ""}</TableCell>
                  <TableCell>{i.days_remaining ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={alertTierClass(i.alert_tier as never)}>{i.alert_tier}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CompliancePageShell>
  );
}

export default SupervisorConsolePage;

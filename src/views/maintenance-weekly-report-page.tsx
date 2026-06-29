"use client";

import Link from "next/link";
import { FileBarChart, Loader2 } from "lucide-react";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
import { useMaintenanceWeeklyReport } from "@/hooks/queries/useMaintenanceWeeklyReport";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

function MaintenanceWeeklyReportPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [weekStart, setWeekStart] = useState("");
  const { data, isLoading } = useMaintenanceWeeklyReport({
    locationId: locationId ?? null,
    weekStart: weekStart || null,
  });

  const exportRows = (data?.technician_performance ?? []).map((t) => ({
    technician: t.display_name,
    completed: t.completed,
    open: t.open,
    avg_hours: t.avg_hours,
  }));

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "maintenance_weekly",
    title: "Maintenance Weekly Report",
    venueLabel: data?.location_code ?? "All Sites",
    filters: { week: data ? `${data.week_start} – ${data.week_end}` : undefined },
    kpis: data
      ? [
          { label: "Raised", value: data.summary.raised },
          { label: "Completed", value: data.summary.completed },
          { label: "Pending", value: data.summary.pending },
          { label: "Overdue", value: data.summary.overdue },
          { label: "SLA %", value: `${data.summary.sla_compliance_pct}%` },
          { label: "Avg resolution (h)", value: data.summary.avg_resolution_hours },
          { label: "PM completed", value: data.summary.pm_completed },
          { label: "PM pending", value: data.summary.pm_pending },
        ]
      : [],
    columns: [
      { key: "technician", header: "Technician" },
      { key: "completed", header: "Completed" },
      { key: "open", header: "Open" },
      { key: "avg_hours", header: "Avg hours" },
    ],
    rows: exportRows,
  });

  const s = data?.summary;

  return (
    <MaintenanceWeeklyReportsLayout>
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Auto KPI Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              {data ? `Week ${data.week_start} – ${data.week_end}` : "Operational maintenance summary"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Week start</Label>
            <Input type="date" className="h-8 w-36" value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => void exportPdf()} disabled={!data}>
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={!data}>
            Export Excel
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/maintenance/weekly-report">← Reports</Link>
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Unable to load report.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            {[
              ["Raised", s?.raised],
              ["Completed", s?.completed],
              ["Pending", s?.pending],
              ["Overdue", s?.overdue],
              ["SLA %", `${s?.sla_compliance_pct}%`],
              ["Avg resolution (h)", s?.avg_resolution_hours],
              ["PM done", s?.pm_completed],
              ["PM pending", s?.pm_pending],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="Issues by location" headers={["Location", "Count"]}
              rows={data.issues_by_location.map((r) => [r.code, r.count])} />
            <ReportTable title="Issues by category" headers={["Category", "Count"]}
              rows={data.issues_by_category.map((r) => [r.category, r.count])} />
            <ReportTable title="Technician performance"
              headers={["Technician", "Completed", "Open", "Avg h"]}
              rows={data.technician_performance.map((t) => [
                t.display_name, t.completed, t.open, t.avg_hours,
              ])} />
            <ReportTable title="Material consumption" headers={["Item", "Qty"]}
              rows={data.material_consumption.map((m) => [m.item_name, m.quantity])} />
            <ReportTable title="Repeated issues" headers={["Issue", "Count"]}
              rows={data.repeated_issues.map((r) => [r.title, r.count])} />
            <ReportTable title="Major breakdowns" headers={["Reason", "Hours", "Site"]}
              rows={data.major_breakdowns.map((b) => [b.title, b.downtime_hours, b.location_code])} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-medium">Recommendations</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {data.recommendations.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </section>
            <section className="rounded-lg border border-border p-4">
              <h3 className="mb-2 text-sm font-medium">Action plan</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {data.action_plan.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
    </MaintenanceWeeklyReportsLayout>
  );
}

function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No data.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase text-muted-foreground">
              <tr>
                {headers.map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default MaintenanceWeeklyReportPage;

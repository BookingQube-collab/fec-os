"use client";

import dynamic from "next/dynamic";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMaintenanceDashboard } from "@/hooks/queries/useMaintenanceDashboard";
import { useAppStore } from "@/stores/app-store";

const MaintenanceDashboardCharts = dynamic(
  () =>
    import("@/components/maintenance/maintenance-dashboard-charts").then(
      (m) => m.MaintenanceDashboardCharts,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    ),
  },
);

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function toneForCount(value: number, warnAbove = 0): string {
  if (value === 0) return "text-emerald-600";
  if (value <= warnAbove) return "text-amber-600";
  return "text-red-600";
}

export function MaintenanceDashboardPanel() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useMaintenanceDashboard({ locationId: locationId ?? null });

  const k = data?.kpis;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonStrip count={8} />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Unable to load maintenance dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10">
        <KpiCard label="Open (planned)" value={k?.work_orders_open ?? 0} tone={toneForCount(k?.work_orders_open ?? 0, 5)} />
        <KpiCard label="In progress" value={k?.work_orders_in_progress ?? 0} />
        <KpiCard label="Urgent" value={k?.work_orders_urgent ?? 0} tone={toneForCount(k?.work_orders_urgent ?? 0)} />
        <KpiCard label="Overdue" value={k?.work_orders_overdue ?? 0} tone={toneForCount(k?.work_orders_overdue ?? 0)} />
        <KpiCard label="Near SLA breach" value={k?.work_orders_near_sla_breach ?? 0} tone={toneForCount(k?.work_orders_near_sla_breach ?? 0)} />
        <KpiCard label="SLA compliance" value={`${k?.sla_compliance_pct ?? 100}%`} tone={(k?.sla_compliance_pct ?? 100) < 90 ? "text-red-600" : "text-emerald-600"} />
        <KpiCard label="Weekly completion" value={`${k?.weekly_completion_rate_pct ?? 0}%`} />
        <KpiCard label="Pending deliveries" value={k?.pending_deliveries ?? 0} tone={toneForCount(k?.pending_deliveries ?? 0)} />
        <KpiCard label="Material requests (mo)" value={k?.material_requests_month ?? 0} />
        <KpiCard label="Completed (month)" value={k?.work_orders_completed_month ?? 0} tone="text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard label="On hold" value={k?.work_orders_on_hold ?? 0} tone={toneForCount(k?.work_orders_on_hold ?? 0)} />
        <KpiCard label="Assets" value={k?.assets_total ?? 0} />
        <KpiCard label="PM overdue" value={k?.pm_overdue ?? 0} tone={toneForCount(k?.pm_overdue ?? 0)} />
        <KpiCard label="Active downtime" value={k?.downtime_active ?? 0} tone={toneForCount(k?.downtime_active ?? 0)} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard label="PM due this week" value={k?.pm_due_this_week ?? 0} />
        <KpiCard label="PM schedules active" value={k?.pm_active ?? 0} />
        <KpiCard label="Heartbeat missed" value={k?.assets_heartbeat_missed ?? 0} tone={toneForCount(k?.assets_heartbeat_missed ?? 0)} />
        <KpiCard label="Warranty expiring (30d)" value={k?.assets_warranty_expiring ?? 0} tone={toneForCount(k?.assets_warranty_expiring ?? 0)} />
        <KpiCard label="Downtime hours (month)" value={k?.downtime_hours_month ?? 0} tone={toneForCount(k?.downtime_hours_month ?? 0, 10)} />
      </div>

      <MaintenanceDashboardCharts
        workOrdersByStatus={data.work_orders_by_status}
        workOrdersByKind={data.work_orders_by_kind}
        assetsByCriticality={data.assets_by_criticality}
        assetsByCategory={data.assets_by_category}
        workOrdersTrend={data.work_orders_trend}
        downtimeByLocation={data.downtime_by_location}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Near SLA breach</h3>
          {data.near_sla_breach.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No jobs approaching SLA breach.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Job #</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">SLA due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.near_sla_breach.map((w) => (
                    <tr key={w.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{w.job_order_number ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{w.title}</td>
                      <td className="px-3 py-2 text-xs text-amber-600">
                        {new Date(w.sla_due_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Jobs by location</h3>
          {data.jobs_by_location.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No open jobs.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-right">Open jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs_by_location.map((l) => (
                    <tr key={l.code} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{l.code}</td>
                      <td className="px-3 py-2 text-right">{l.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Overdue work orders</h3>
          {data.overdue_work_orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No overdue work orders.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Job #</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Priority</th>
                    <th className="px-3 py-2 text-left">SLA due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overdue_work_orders.map((w) => (
                    <tr key={w.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{w.job_order_number ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{w.title}</td>
                      <td className="px-3 py-2">
                        <Badge variant={w.priority === "urgent" ? "destructive" : "outline"} className="uppercase text-[10px]">
                          {w.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-red-600">
                        {w.sla_due_at
                          ? new Date(w.sla_due_at).toLocaleString()
                          : w.planned_end
                            ? new Date(w.planned_end).toLocaleString()
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Overdue PM schedules</h3>
          {data.overdue_pm.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No overdue PM schedules.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overdue_pm.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{p.title}</td>
                      <td className="px-3 py-2 text-xs text-red-600">
                        {new Date(p.next_due_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Technician workload</h3>
          {data.technician_workload.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No assigned open work orders.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Technician</th>
                    <th className="px-3 py-2 text-right">Queued</th>
                    <th className="px-3 py-2 text-right">In progress</th>
                  </tr>
                </thead>
                <tbody>
                  {data.technician_workload.map((t) => (
                    <tr key={t.user_id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{t.display_name}</td>
                      <td className="px-3 py-2 text-right">{t.open_count}</td>
                      <td className="px-3 py-2 text-right">{t.in_progress_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Active downtime events</h3>
          {data.active_downtime.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No active downtime events.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                    <th className="px-3 py-2 text-left">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.active_downtime.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs">{d.location_code}</td>
                      <td className="px-3 py-2 font-medium">{d.reason}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(d.started_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">PM calendar (next 14)</h3>
          {data.pm_calendar.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No PM schedules.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pm_calendar.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{p.title}</td>
                      <td className={`px-3 py-2 text-xs ${p.overdue ? "text-red-600" : "text-muted-foreground"}`}>
                        {new Date(p.next_due_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Delivery status</h3>
          {data.delivery_status.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No deliveries.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.delivery_status.map((d) => (
                    <tr key={d.status} className="border-t border-border">
                      <td className="px-3 py-2 capitalize">{d.status.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-right">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Recent activities</h3>
        {data.recent_activities.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Activity</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_activities.map((a) => (
                  <tr key={`${a.type}-${a.id}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{a.label}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.type}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Recent work orders</h3>
        {data.recent_work_orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No recent work orders.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_work_orders.map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{w.title}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {w.kind}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{w.status}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

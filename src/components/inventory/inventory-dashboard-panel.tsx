"use client";

import dynamic from "next/dynamic";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventoryDashboard } from "@/hooks/queries/useInventoryDashboard";
import { useAppStore } from "@/stores/app-store";

const InventoryDashboardCharts = dynamic(
  () =>
    import("@/components/inventory/inventory-dashboard-charts").then((m) => m.InventoryDashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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

function toneForCount(value: number): string {
  if (value === 0) return "text-emerald-600";
  return value <= 3 ? "text-amber-600" : "text-red-600";
}

export function InventoryDashboardPanel() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useInventoryDashboard({ locationId: locationId ?? null });

  const k = data?.kpis;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonStrip count={4} />
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
        Unable to load inventory dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total SKUs" value={k?.total_skus ?? 0} />
        <KpiCard label="Low stock" value={k?.low_stock ?? 0} tone={toneForCount(k?.low_stock ?? 0)} />
        <KpiCard label="Out of stock" value={k?.out_of_stock ?? 0} tone={toneForCount(k?.out_of_stock ?? 0)} />
        <KpiCard label="Units on hand" value={k?.total_units ?? 0} />
      </div>

      <InventoryDashboardCharts
        stockByLocation={data.stock_by_location}
        stockBySize={data.stock_by_size}
        stockByStatus={data.stock_by_status}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Reorder alerts</h3>
          {data.reorder_alerts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              All stock levels are above reorder thresholds.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Branch</th>
                    <th className="px-3 py-2 text-right">On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reorder_alerts.map((a) => (
                    <tr key={`${a.item_id}-${a.location_code}`} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{a.sku}</td>
                      <td className="px-3 py-2">
                        {a.item_name}
                        {a.size ? (
                          <Badge variant="outline" className="ml-1.5 text-[10px]">
                            {a.size}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{a.location_code}</td>
                      <td className="px-3 py-2 text-right text-amber-600">
                        {a.quantity_on_hand} / {a.reorder_level}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Recent movements</h3>
          {data.recent_movements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No stock movements recorded yet. Receive stock or import a sheet to get started.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_movements.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{m.sku}</span>
                        <span className="ml-1 text-muted-foreground">@ {m.location_code}</span>
                      </td>
                      <td className="px-3 py-2 capitalize">{m.movement_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-right">{m.quantity_after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

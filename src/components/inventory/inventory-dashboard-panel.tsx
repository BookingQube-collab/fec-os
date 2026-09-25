"use client";

import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { FecEmptyState, FecSkeleton, FecStatCard, type KpiTint } from "@/components/fec";
import { useInventoryDashboard } from "@/hooks/queries/useInventoryDashboard";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { useAppStore } from "@/stores/app-store";

const InventoryDashboardCharts = dynamic(
  () =>
    import("@/components/inventory/inventory-dashboard-charts").then((m) => m.InventoryDashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <FecSkeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    ),
  },
);

function tintForCount(value: number): KpiTint {
  if (value === 0) return "green";
  return value <= 3 ? "amber" : "red";
}

export function InventoryDashboardPanel() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useInventoryDashboard({ locationId: locationId ?? null });

  const k = data?.kpis;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonStrip count={4} />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <FecSkeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <FecEmptyState message={t("inventory.dashboard.unable")} />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <FecStatCard title={t("inventory.kpis.totalSkus")} value={k?.total_skus ?? 0} tint="slate" compact />
        <FecStatCard title={t("inventory.kpis.lowStock")} value={k?.low_stock ?? 0} tint={tintForCount(k?.low_stock ?? 0)} compact />
        <FecStatCard title={t("inventory.kpis.outOfStock")} value={k?.out_of_stock ?? 0} tint={tintForCount(k?.out_of_stock ?? 0)} compact />
        <FecStatCard title={t("inventory.kpis.unitsOnHand")} value={k?.total_units ?? 0} tint="sky" compact />
      </div>

      <InventoryDashboardCharts
        stockByLocation={data.stock_by_location}
        stockBySize={data.stock_by_size}
        stockByStatus={data.stock_by_status}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("inventory.dashboard.reorderAlerts")}</h3>
          {data.reorder_alerts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("inventory.dashboard.allAbove")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("inventory.stock.sku")}</th>
                    <th className="px-3 py-2 text-left">{t("inventory.stock.item")}</th>
                    <th className="px-3 py-2 text-left">{t("inventory.stock.branch")}</th>
                    <th className="px-3 py-2 text-right">{t("inventory.stock.onHand")}</th>
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
                      <td className="px-3 py-2">{formatLocationLabel(a.location_code, a.location_name)}</td>
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
          <h3 className="text-sm font-medium">{t("inventory.dashboard.recent")}</h3>
          {data.recent_movements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("inventory.dashboard.noMovements")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("inventory.dashboard.when")}</th>
                    <th className="px-3 py-2 text-left">{t("inventory.stock.item")}</th>
                    <th className="px-3 py-2 text-left">{t("inventory.dashboard.type")}</th>
                    <th className="px-3 py-2 text-right">{t("inventory.dashboard.qty")}</th>
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
                        <span className="ml-1 text-muted-foreground">@ {formatLocationLabel(m.location_code, m.location_name)}</span>
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

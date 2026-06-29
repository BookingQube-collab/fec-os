"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useInventoryAlerts, useInventoryStock } from "@/hooks/queries/useInventory";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function DailyOpsInventoryPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data: stock, isLoading } = useInventoryStock(locationId ?? null);
  const { data: alerts } = useInventoryAlerts(locationId ?? null);

  return (
    <DailyOpsPageShell
        title={t("dailyOps.inventory.title")}
        subtitle={t("dailyOps.inventory.subtitle")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory">{t("dailyOps.inventory.fullInventory")}</Link>
          </Button>
        }
      >
        {(alerts?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {t("dailyOps.inventory.reorderAlert", { count: alerts!.length })}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
        ) : !stock?.length ? (
          <p className="text-sm text-muted-foreground">{t("dailyOps.inventory.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dailyOps.inventory.item")}</TableHead>
                  <TableHead>{t("dailyOps.inventory.sku")}</TableHead>
                  <TableHead>{t("dailyOps.inventory.onHand")}</TableHead>
                  <TableHead>{t("dailyOps.inventory.reorderLevel")}</TableHead>
                  <TableHead>{t("dailyOps.inventory.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.item_name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell>{row.quantity_on_hand} {row.unit}</TableCell>
                    <TableCell>{row.below_reorder ? t("dailyOps.inventory.needsReorder") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.below_reorder ? "destructive" : "default"}>
                        {row.below_reorder ? t("dailyOps.inventory.needsReorder") : t("dailyOps.inventory.ok")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DailyOpsPageShell>
  );
}

export default DailyOpsInventoryPage;

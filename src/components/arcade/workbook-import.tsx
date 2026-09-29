"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { applyArcadeWorkbook } from "@/lib/arcade-supply.functions";
import { gridFromSheet, parseArcadeWorkbooks, type SheetGrid } from "@/lib/arcade/workbook-import";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeWorkbookImport() {
  const { t } = useTranslation();
  const canManage = usePermission("arcade.manage");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!canManage) return null;

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      let damage: SheetGrid | null = null;
      const maintenance: SheetGrid[] = [];
      for (const file of list) {
        const book = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        const grids = book.SheetNames.map((name) => gridFromSheet(name, book.Sheets[name] ?? {}));
        const damageSheet = grids.find((grid) => grid.cells.some((cell) => /machine damage report/i.test(cell.value)));
        if (damageSheet) damage = damageSheet;
        else maintenance.push(...grids);
      }
      const plan = parseArcadeWorkbooks({ damage, maintenance });
      if (!plan.machines.length && !plan.damage.length && !plan.maintenance.length && !plan.parts.length) {
        toast.error(t("arcadeImport.empty"));
        return;
      }
      const result = await applyArcadeWorkbook(plan);
      const headline = result.headline.units
        ? t("arcadeImport.headline", result.headline)
        : "";
      toast.success(
        t("arcadeImport.done", {
          machines: result.machinesCreated + result.machinesExisting,
          created: result.machinesCreated,
          damage: result.damageCreated,
          maintenance: result.maintenanceCreated,
          parts: result.partsCreated,
          suppliers: result.suppliersAttached,
        }) + (headline ? ` ${headline}` : ""),
      );
      if (result.failures.length) toast.error(result.failures.slice(0, 3).join(" · "));
      await qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("arcadeImport.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        className="sr-only"
        type="file"
        accept=".xlsx,.xls"
        multiple
        disabled={busy}
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" disabled={busy} asChild>
        <span>{busy ? t("arcadeImport.working") : t("arcadeImport.button")}</span>
      </Button>
    </label>
  );
}

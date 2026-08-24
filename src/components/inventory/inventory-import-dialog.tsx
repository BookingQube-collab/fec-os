"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCsv } from "@/lib/csv-parse";
import {
  buildInventorySampleCsv,
  parseInventoryImportRows,
  type InventoryImportRow,
} from "@/lib/inventory-import";
import { importInventoryRows } from "@/lib/inventory.functions";
import { queryKeys } from "@/lib/query-keys";

async function readImportFile(file: File, unsupported: string, noWorksheets: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") {
    return file.text();
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error(noWorksheets);
    return XLSX.utils.sheet_to_csv(sheet);
  }
  throw new Error(unsupported);
}

function downloadSampleCsv() {
  const blob = new Blob([buildInventorySampleCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory-import-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface InventoryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryImportDialog({ open, onOpenChange }: InventoryImportDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<InventoryImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);

  const importMut = useMutation({
    mutationFn: (rows: InventoryImportRow[]) => importInventoryRows({ rows }),
    onSuccess: (res) => {
      setImportResult(res);
      void qc.invalidateQueries({ queryKey: queryKeys.inventory.all });
      if (res.errors.length) {
        toast.error(t("inventory.import.importedPartial", { imported: res.imported, errors: res.errors.length }));
        return;
      }
      toast.success(t("inventory.import.imported", { count: res.imported }));
      setPreview([]);
      setParseErrors([]);
      setImportResult(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    setImportResult(null);
    try {
      const csv = await readImportFile(file, t("inventory.import.unsupported"), t("inventory.import.noWorksheets"));
      const { rows, errors } = parseInventoryImportRows(parseCsv(csv));
      setPreview(rows);
      setParseErrors(errors);
      if (!rows.length && errors.length) {
        toast.error(t("inventory.import.foundErrors", { count: errors.length }));
      } else if (rows.length) {
        toast.success(t("inventory.import.parsed", { count: rows.length }));
      } else {
        toast.error(t("inventory.import.noRows"));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setPreview([]);
      setParseErrors([]);
      setImportResult(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inventory.import.title")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t("inventory.import.help")}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t("inventory.import.sample")}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            {t("inventory.import.chooseFile")}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium text-amber-200">{t("inventory.import.validation", { count: parseErrors.length })}</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {parseErrors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  {t("inventory.import.rowError", { row: e.row, message: e.message })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-surface/60 px-3 py-2 text-xs font-medium">
              {t("inventory.import.preview", { count: preview.length })}
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{t("inventory.stock.sku")}</th>
                    <th className="px-2 py-1.5 text-left">{t("inventory.stock.item")}</th>
                    <th className="px-2 py-1.5 text-left">{t("inventory.stock.size")}</th>
                    <th className="px-2 py-1.5 text-left">{t("inventory.stock.branch")}</th>
                    <th className="px-2 py-1.5 text-right">{t("inventory.dashboard.qty")}</th>
                    <th className="px-2 py-1.5 text-right">{t("inventory.catalog.reorder")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={`${r.row}-${r.sku}-${r.locationCode}`} className="border-t border-border/60">
                      <td className="px-2 py-1.5 font-mono">{r.sku}</td>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5">{r.size ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.locationCode}</td>
                      <td className="px-2 py-1.5 text-right">{r.quantityOnHand}</td>
                      <td className="px-2 py-1.5 text-right">{r.reorderLevel ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importResult && importResult.errors.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">{t("inventory.import.importErrors")}</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {importResult.errors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  {t("inventory.import.rowError", { row: e.row, message: e.message })}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!preview.length || importMut.isPending}
            onClick={() => importMut.mutate(preview)}
          >
            {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {preview.length ? t("inventory.import.importRows", { count: preview.length }) : t("inventory.import.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

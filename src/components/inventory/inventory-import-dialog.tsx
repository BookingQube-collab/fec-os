"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
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

async function readImportFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") {
    return file.text();
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Excel file has no worksheets");
    return XLSX.utils.sheet_to_csv(sheet);
  }
  throw new Error("Unsupported file type. Upload a .csv or .xlsx file.");
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
        toast.error(`${res.imported} imported, ${res.errors.length} row error(s)`);
        return;
      }
      toast.success(`Imported ${res.imported} stock record(s)`);
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
      const csv = await readImportFile(file);
      const { rows, errors } = parseInventoryImportRows(parseCsv(csv));
      setPreview(rows);
      setParseErrors(errors);
      if (!rows.length && errors.length) {
        toast.error(`Found ${errors.length} validation error(s)`);
      } else if (rows.length) {
        toast.success(`Parsed ${rows.length} row(s) — review and confirm import`);
      } else {
        toast.error("No data rows found in file");
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
          <DialogTitle>Import inventory sheet</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Upload CSV or Excel with columns: SKU, Item name, Size (optional), Branch/Location, Quantity on hand, Reorder level (optional).
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
            <Download className="mr-2 h-4 w-4" />
            Sample CSV
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            Choose file
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
            <p className="font-medium text-amber-200">Validation errors ({parseErrors.length})</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {parseErrors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-surface/60 px-3 py-2 text-xs font-medium">
              Preview ({preview.length} rows)
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">SKU</th>
                    <th className="px-2 py-1.5 text-left">Item</th>
                    <th className="px-2 py-1.5 text-left">Size</th>
                    <th className="px-2 py-1.5 text-left">Branch</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Reorder</th>
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
            <p className="font-medium text-destructive">Import errors</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {importResult.errors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview.length || importMut.isPending}
            onClick={() => importMut.mutate(preview)}
          >
            {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import {preview.length ? `${preview.length} row(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

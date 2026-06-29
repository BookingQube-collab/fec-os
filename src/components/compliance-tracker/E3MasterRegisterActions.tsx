"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/hooks/use-permission";
import { buildE3SampleCsv } from "@/lib/e3-compliance-import";
import { deleteAllE3ComplianceItems, importE3ComplianceCsv } from "@/lib/e3-compliance.functions";
import { queryKeys } from "@/lib/query-keys";

type ImportResult = {
  imported: number;
  errors: { row: number; message: string }[];
};

function downloadSampleCsv() {
  const blob = new Blob([buildE3SampleCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "e3-master-register-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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

export function E3MasterRegisterActions() {
  const { t } = useTranslation();
  const canEdit = usePermission("compliance.edit_e3_tracker");
  const canRemoveAll = usePermission("admin.manage_users");
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [removeAllOpen, setRemoveAllOpen] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.e3ComplianceTracker.all });
  };

  const importMutation = useMutation({
    mutationFn: (csv: string) => importE3ComplianceCsv({ csv }),
    onSuccess: (res) => {
      setImportResult(res);
      if (res.errors.length) {
        toast.error(t("e3Tracker.importFailed", { count: res.errors.length }));
        return;
      }
      toast.success(t("e3Tracker.importSuccess", { count: res.imported }));
      setImportOpen(false);
      setImportResult(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeAllMutation = useMutation({
    mutationFn: () => deleteAllE3ComplianceItems(),
    onSuccess: (res) => {
      toast.success(t("e3Tracker.removeAllSuccess", { count: res.deleted }));
      setRemoveAllOpen(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!canEdit && !canRemoveAll) return null;

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    setImportResult(null);
    try {
      const csv = await readImportFile(file);
      importMutation.mutate(csv);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={downloadSampleCsv}>
          <Download className="mr-1.5 h-4 w-4" />
          {t("e3Tracker.downloadSample")}
        </Button>
      ) : null}

      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" />
          {t("e3Tracker.importData")}
        </Button>
      ) : null}

      {canRemoveAll ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setRemoveAllOpen(true)}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {t("e3Tracker.removeAll")}
        </Button>
      ) : null}

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportResult(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("e3Tracker.importTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">{t("e3Tracker.importHelp")}</p>
            <div>
              <Label htmlFor="e3-import-file">{t("e3Tracker.importFileLabel")}</Label>
              <Input
                id="e3-import-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importMutation.isPending}
                onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>
            {importResult?.errors.length ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">{t("e3Tracker.importErrorsTitle")}</p>
                {importResult.errors.map((err) => (
                  <p key={`${err.row}-${err.message}`}>
                    {t("e3Tracker.importErrorRow", { row: err.row, message: err.message })}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeAllOpen} onOpenChange={setRemoveAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("e3Tracker.removeAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("e3Tracker.removeAllDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeAllMutation.mutate()}
              disabled={removeAllMutation.isPending}
            >
              {t("e3Tracker.removeAllConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

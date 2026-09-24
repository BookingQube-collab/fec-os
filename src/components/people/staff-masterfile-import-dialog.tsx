"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/query-keys";

type PreviewResponse = {
  mode: string;
  kind?: string;
  batchId?: string;
  parseKind?: string;
  sheetsParsed?: string[];
  auditBuckets?: Record<string, number>;
  validationIssues?: Array<{ rowNumber: number; code: string; message: string }>;
  counts?: {
    create: number;
    update: number;
    unchanged: number;
    archive: number;
    delete: number;
    review: number;
  };
  rows?: Array<{ rowNumber: number; action: string; fullName: string; matchRule: string | null; warnings: string[] }>;
  error?: string;
};

export function StaffMasterfileImportDialog({
  open,
  onOpenChange,
  locationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an Excel file first");
      const form = new FormData();
      form.set("mode", "preview");
      form.set("importMode", "safe_sync");
      form.set("file", file);
      const res = await fetch("/api/people/directory-import", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(body.error ?? "Preview failed");
      return body;
    },
    onSuccess: (body) => {
      setPreview(body);
      toast.success(`Preview ready — ${body.sheetsParsed?.join(", ") || "1 sheet"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!preview?.batchId) throw new Error("Run preview first");
      if ((preview.counts?.review ?? 0) > 0) {
        throw new Error(`Resolve ${preview.counts?.review} review row(s) before commit`);
      }
      const form = new FormData();
      form.set("mode", "commit");
      form.set("batchId", preview.batchId);
      const res = await fetch("/api/people/directory-import", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json()) as PreviewResponse & { applied?: boolean };
      if (!res.ok) throw new Error(body.error ?? "Commit failed");
      return body;
    },
    onSuccess: () => {
      toast.success(t("people.staff.importCommitted", "Directory import applied"));
      setPreview(null);
      setFile(null);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId, true) });
      void qc.invalidateQueries({ queryKey: queryKeys.people.dashboard({ locationId }) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPreview(null);
          setFile(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("people.staff.importMasterTitle", "Import E3 Employee Masterfile")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Upload <strong>E3_Employee Masterfile</strong> as <strong>.pdf</strong> or <strong>.xlsx</strong>
            (Active / Secondment / Resigned-Terminated / Remote), or a single Employee Roster sheet.
            Preview reports created / updated / unchanged / conflicts before commit.
            Rollback is available from import batch history.
          </p>
          <div>
            <Label htmlFor="e3-file">Workbook / PDF</Label>
            <InputFile id="e3-file" onChange={setFile} />
            {file ? <p className="mt-1 text-xs text-muted-foreground">{file.name}</p> : null}
          </div>
          {preview ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">create {preview.counts?.create ?? 0}</Badge>
                <Badge variant="secondary">update {preview.counts?.update ?? 0}</Badge>
                <Badge variant="outline">unchanged {preview.counts?.unchanged ?? 0}</Badge>
                <Badge variant="destructive">review {preview.counts?.review ?? 0}</Badge>
              </div>
              {preview.sheetsParsed?.length ? (
                <p className="text-xs text-muted-foreground">Sheets: {preview.sheetsParsed.join(", ")}</p>
              ) : null}
              {preview.auditBuckets ? (
                <p className="text-xs text-muted-foreground">
                  Audit: conflicts {preview.auditBuckets.duplicates_conflicts ?? 0}, invalid{" "}
                  {preview.auditBuckets.invalid ?? 0}, missing mandatory {preview.auditBuckets.missing_mandatory ?? 0}
                </p>
              ) : null}
              {(preview.validationIssues?.length ?? 0) > 0 ? (
                <ul className="max-h-40 overflow-y-auto text-xs text-rose-600 space-y-1">
                  {preview.validationIssues!.slice(0, 40).map((i, idx) => (
                    <li key={`${i.rowNumber}-${idx}`}>
                      Row {i.rowNumber}: {i.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="max-h-48 overflow-y-auto text-xs">
                {(preview.rows ?? []).slice(0, 30).map((r) => (
                  <div key={r.rowNumber} className="flex justify-between gap-2 border-t border-border/60 py-1">
                    <span>{r.fullName}</span>
                    <span className="font-mono text-muted-foreground">{r.action} · {r.matchRule}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            variant="secondary"
            disabled={!file || previewMut.isPending}
            onClick={() => previewMut.mutate()}
          >
            {previewMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
            Preview
          </Button>
          <Button
            disabled={!preview?.batchId || commitMut.isPending || (preview.counts?.review ?? 0) > 0}
            onClick={() => commitMut.mutate()}
          >
            {commitMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Commit import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InputFile({ id, onChange }: { id: string; onChange: (f: File | null) => void }) {
  return (
    <input
      id={id}
      type="file"
      accept=".xlsx,.xls,.csv,.html,.htm,.pdf"
      className="mt-1 block w-full text-sm"
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
    />
  );
}

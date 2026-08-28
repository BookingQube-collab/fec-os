"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Loader2, Upload, X, Download } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/page-header";
import { StaffSampleDownloadDialog } from "@/components/people/staff-sample-download-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { loadRosterColumnMap, saveRosterColumnMap, type SavedRosterColumnMap } from "@/lib/staff-roster/column-map-store";
import {
  formatRosterFileSize,
  pickRosterImportFile,
  rosterFileKind,
  ROSTER_IMPORT_ACCEPT,
} from "@/lib/staff-roster/select-import-file";
import type { PreviewLine, RosterColumnKey, RosterPreview, RosterRowAction } from "@/lib/staff-roster/types";
import { cn } from "@/lib/utils";
import { downloadFileFromApi } from "@/lib/staff-import";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import {
  attendanceRosterPeriod,
  formatPayrollRange,
  payrollMonthOf,
  qatarWeekBounds,
  type AttendanceRosterPeriodMode,
} from "@/lib/attendance-hr/roster-period";
import { useAppStore } from "@/stores/app-store";

type UploadArg = { mode: "preview" | "commit"; overrideMap?: boolean };

type ShiftPreviewRow = {
  rowNumber: number;
  workDate: string;
  locationCode: string | null;
  staffLabel: string;
  qid: string | null;
  employeeCode: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
  matchRule: string;
  status: "matched" | "unmatched" | "skipped";
  message: string | null;
};

type PreviewResponse = {
  mode: string;
  kind?: "shift_roster" | "directory";
  batchId?: string;
  preview?: RosterPreview;
  applied?: boolean;
  counts?: RosterPreview["counts"];
  needsMapping?: boolean;
  headers?: string[];
  mapping?: Record<string, string>;
  worksheetName?: string | null;
  errors?: Array<{ rowNumber: number; code: string; message: string } | string>;
  periodMode?: string;
  dateFrom?: string;
  dateTo?: string;
  matched?: number;
  unmatched?: number;
  skipped?: number;
  warnings?: string[];
  rows?: ShiftPreviewRow[];
  imported?: number;
};

type HistoryResponse = {
  batches: Array<{
    id: string;
    kind?: string;
    status: string;
    mode: string;
    uploaded_by: string | null;
    created_at: string;
    create_count: number;
    update_count: number;
    unchanged_count: number;
    archive_count: number;
    delete_count: number;
    review_count: number;
    error_message: string | null;
    staff_import_files?: Array<{ filename: string; file_type: string; worksheet_name: string | null }>;
  }>;
};

const MAP_FIELDS: Array<{ key: RosterColumnKey; required?: boolean }> = [
  { key: "location", required: true },
  { key: "full_name", required: true },
  { key: "qid" },
  { key: "contact" },
  { key: "position" },
  { key: "status" },
  { key: "employment_type" },
  { key: "activity" },
  { key: "joining_date" },
  { key: "e3" },
];

const PREVIEW_ROW_CAP = 80;

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function kindLabel(kind: ReturnType<typeof rosterFileKind>, t: (key: string) => string) {
  if (kind === "excel") return t("people.roster.fileKindExcel");
  if (kind === "csv") return t("people.roster.fileKindCsv");
  if (kind === "html") return t("people.roster.fileKindHtml");
  return kind;
}

function actionVariant(action: RosterRowAction): "success" | "info" | "muted" | "warning" | "outline" | "destructive" {
  if (action === "create") return "success";
  if (action === "update") return "info";
  if (action === "unchanged") return "muted";
  if (action === "review") return "warning";
  if (action === "delete") return "destructive";
  return "outline";
}

export default function StaffRosterImportPage() {
  const { t, i18n } = useTranslation();
  const roles = useUserRoles();
  const venueSafeOnly = roles.some((r) => r === "branch_gm" || r === "duty_manager")
    && !roles.some((r) => ["ceo", "coo", "cfo", "regional_ops", "hr"].includes(r));
  const qc = useQueryClient();
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const previewKeyRef = useRef<string | null>(null);
  const [rememberedMap, setRememberedMap] = useState<SavedRosterColumnMap | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importMode, setImportMode] = useState<"safe_sync" | "authoritative_replace">("safe_sync");
  const [confirmHard, setConfirmHard] = useState(false);
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("week");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => payrollMonthOf(todayYmd()));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mappingRequired, setMappingRequired] = useState(false);
  const [manualMap, setManualMap] = useState<SavedRosterColumnMap | null>(null);
  const [rowsOpen, setRowsOpen] = useState(true);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const sites = useSites();

  const history = useQuery({
    queryKey: queryKeys.people.rosterImports(),
    queryFn: async () => {
      const res = await fetch("/api/people/roster-import", { credentials: "include" });
      const body = (await res.json()) as HistoryResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load history");
      return body;
    },
    staleTime: STALE.people,
  });

  const lockedMode = venueSafeOnly ? "safe_sync" : importMode;

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);

  useEffect(() => {
    setRememberedMap(loadRosterColumnMap());
  }, []);

  const resetReview = () => {
    setPreview(null);
    setPreviewError(null);
    setMappingRequired(false);
    setManualMap(null);
    previewKeyRef.current = null;
  };

  const applyPicked = (list: FileList | Iterable<File> | null) => {
    if (!list) return;
    const { file: picked, skipped: skip } = pickRosterImportFile(list);
    setFile(picked);
    setSkipped(skip);
    resetReview();
    if (filesRef.current) filesRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  };

  const clearFile = () => {
    setFile(null);
    setSkipped([]);
    resetReview();
    if (filesRef.current) filesRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  };

  const uploadMut = useMutation({
    mutationFn: async (arg: UploadArg) => {
      const form = new FormData();
      form.set("mode", arg.mode);
      form.set("importMode", lockedMode);
      form.set("confirmHardDelete", confirmHard ? "true" : "false");
      form.set("periodMode", periodMode);
      form.set("weekStart", weekStart);
      form.set("month", month);
      form.set("dateFrom", period.dateFrom);
      form.set("dateTo", period.dateTo);
      if (arg.mode === "preview") {
        if (!file) throw new Error(t("people.roster.chooseFile"));
        form.append("file", file);
        const hint = manualMap ?? loadRosterColumnMap();
        if (hint && Object.keys(hint).length) {
          form.set("columnMap", JSON.stringify(hint));
        }
        if (arg.overrideMap) form.set("columnMapOverride", "true");
      } else {
        if (!preview?.batchId) throw new Error(t("people.roster.preview"));
        form.set("batchId", preview.batchId);
      }
      const res = await fetch("/api/people/roster-import", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json()) as PreviewResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      return body;
    },
    onSuccess: (data, arg) => {
      setPreviewError(null);
      if (arg.mode === "preview" && data.needsMapping) {
        setPreview(data);
        setMappingRequired(true);
        setManualMap((prev) => ({ ...(rememberedMap ?? {}), ...(prev ?? {}), ...(data.mapping ?? {}) }));
        return;
      }
      setMappingRequired(false);
      setPreview(data);
      const mapping = data.preview?.mapping as SavedRosterColumnMap | undefined;
      if (mapping && mapping.full_name && mapping.location) {
        saveRosterColumnMap(mapping);
        setRememberedMap(mapping);
      }
      toast.success(
        arg.mode === "commit"
          ? data.kind === "shift_roster"
            ? t("people.roster.shiftApplied", {
              count: data.imported ?? data.matched ?? 0,
              from: data.dateFrom ?? period.dateFrom,
              to: data.dateTo ?? period.dateTo,
            })
            : t("people.roster.applied")
          : t("people.roster.previewReady"),
      );
      void qc.invalidateQueries({ queryKey: queryKeys.people.rosterImports() });
      if (arg.mode === "commit") {
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      }
    },
    onError: (e: Error) => {
      setPreview(null);
      setPreviewError(e.message);
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (!file || mappingRequired) return;
    const key = `${file.name}:${file.size}:${file.lastModified}:${lockedMode}:${confirmHard}:${periodMode}:${period.dateFrom}:${period.dateTo}`;
    if (previewKeyRef.current === key) return;
    previewKeyRef.current = key;
    uploadMut.mutate({ mode: "preview" });
    // mutate identity is stable enough; we key retries on file/mode/period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, lockedMode, confirmHard, mappingRequired, periodMode, period.dateFrom, period.dateTo]);

  const rollbackMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/people/roster-import/${id}/rollback`, { method: "POST", credentials: "include" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Rollback failed");
    },
    onSuccess: () => {
      toast.success(t("people.roster.rolledBack"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.rosterImports() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = preview?.preview;
  const counts = p?.counts ?? preview?.counts;
  const isShiftPreview = preview?.kind === "shift_roster";
  const readyToConfirm = Boolean(
    preview?.batchId &&
      preview.mode !== "commit" &&
      !preview.needsMapping &&
      !uploadMut.isPending &&
      (isShiftPreview ? (preview.matched ?? 0) > 0 : Boolean(p)),
  );
  const previewing = uploadMut.isPending && uploadMut.variables?.mode === "preview";
  const committing = uploadMut.isPending && uploadMut.variables?.mode === "commit";
  const mappingReady = Boolean(manualMap?.location && manualMap?.full_name);

  const confirmReason = !file
    ? t("people.roster.confirmHintFile")
    : mappingRequired
      ? t("people.roster.confirmHintMapping")
      : previewing || !preview
        ? t("people.roster.confirmHintPreview")
        : readyToConfirm
          ? null
          : preview?.mode === "commit"
            ? null
            : isShiftPreview && (preview.matched ?? 0) === 0
              ? t("people.roster.shiftNothingMatched")
              : t("people.roster.confirmHintPreview");

  const mapHeaders = preview?.headers ?? [];

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    applyPicked(event.dataTransfer.files);
  };

  const sampleLocations = (sites.data ?? [])
    .filter((loc) => CANONICAL_LOCATION_CODES.includes(loc.code as (typeof CANONICAL_LOCATION_CODES)[number]))
    .map((loc) => ({ id: loc.id, code: loc.code, name: loc.name }));

  const downloadSample = async (sampleLocationId: string | null) => {
    try {
      setSampleBusy(true);
      const params = new URLSearchParams({
        download: "sample",
        periodMode,
        weekStart,
        month,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      });
      if (sampleLocationId) params.set("locationId", sampleLocationId);
      await downloadFileFromApi(`/api/people/roster-import?${params.toString()}`);
      toast.success(t("people.roster.sampleReady"));
      setSampleOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("people.roster.previewFailed"));
    } finally {
      setSampleBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Upload}
        kicker={t("people.roster.kicker")}
        title={t("people.roster.title")}
        subtitle={t("people.roster.subtitle")}
        actions={
          <Button type="button" variant="outline" onClick={() => setSampleOpen(true)}>
            <Download className="h-4 w-4" />
            {t("people.roster.downloadSample")}
          </Button>
        }
      />

      <StaffSampleDownloadDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        title={t("people.roster.sampleTitle")}
        description={t("people.roster.sampleHelp")}
        locations={sampleLocations}
        defaultLocationId={storeLocationId}
        downloading={sampleBusy}
        allowAll={!venueSafeOnly}
        onConfirm={downloadSample}
      />

      <div className="surface-card space-y-4 p-5">
        <p className="text-xs text-muted-foreground">{t("people.roster.keepCsv")}</p>
        <p className="text-xs text-muted-foreground">{t("people.roster.matchHint")}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="roster-import-period">{t("people.roster.stepPeriod")}</Label>
            <SearchableSelect
              id="roster-import-period"
              value={periodMode}
              onValueChange={(next) => {
                setPeriodMode(next === "month" ? "month" : "week");
                previewKeyRef.current = null;
                setPreview(null);
              }}
              options={[
                { value: "week", label: t("people.roster.periodWeek") },
                { value: "month", label: t("people.roster.periodMonth") },
              ]}
            />
            <p className="text-xs text-muted-foreground">{t("people.roster.periodHelp")}</p>
          </div>
          {periodMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="roster-import-week">{t("people.roster.weekStart")}</Label>
              <Input
                id="roster-import-week"
                type="date"
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(qatarWeekBounds(e.target.value || todayYmd()).dateFrom);
                  previewKeyRef.current = null;
                  setPreview(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="roster-import-month">{t("people.roster.month")}</Label>
              <Input
                id="roster-import-month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  previewKeyRef.current = null;
                  setPreview(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)}
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Label htmlFor="roster-import-file">{t("people.roster.stepFile")}</Label>
            <input
              id="roster-import-file"
              ref={filesRef}
              type="file"
              accept={ROSTER_IMPORT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => applyPicked(e.target.files)}
            />
            <input
              ref={folderRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(e) => applyPicked(e.target.files)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => filesRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {t("people.roster.chooseFileButton")}
              </Button>
              <Button type="button" variant="outline" onClick={() => folderRef.current?.click()}>
                <FolderOpen className="h-4 w-4" />
                {t("people.roster.chooseFolder")}
              </Button>
            </div>
            <div
              role="button"
              tabIndex={0}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={dropFile}
              onClick={() => filesRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  filesRef.current?.click();
                }
              }}
              className={cn(
                "flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border/80 bg-background",
              )}
            >
              {previewing ? (
                <>
                  <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm font-medium">{t("people.roster.reading")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("people.roster.readingHint")}</p>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {dragOver ? t("people.roster.dropActive") : t("people.roster.dropHint")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("people.roster.acceptHint")}</p>
                </>
              )}
            </div>
            {file ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRosterFileSize(file.size)} · {kindLabel(rosterFileKind(file.name), t)}
                  </p>
                </div>
                <Badge variant="outline">{kindLabel(rosterFileKind(file.name), t)}</Badge>
                <Button type="button" size="sm" variant="ghost" onClick={clearFile}>
                  <X className="h-4 w-4" />
                  {t("people.roster.remove")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("people.roster.noFile")}</p>
            )}
            {skipped.length ? (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {t("people.roster.extraFiles", { name: file?.name ?? skipped[0] })}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("people.roster.autoPreview")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("people.roster.stepMode")}</Label>
            <SearchableSelect
              value={lockedMode}
              disabled={venueSafeOnly}
              onValueChange={(next) => {
                setImportMode(next as typeof importMode);
                previewKeyRef.current = null;
                setPreview(null);
              }}
              options={[
                { value: "safe_sync", label: t("people.roster.safeSync") },
                { value: "authoritative_replace", label: t("people.roster.authoritative") },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {lockedMode === "authoritative_replace" ? t("people.roster.authoritativeHelp") : t("people.roster.safeSyncHelp")}
            </p>
            {venueSafeOnly ? <p className="text-xs text-amber-700">{t("people.roster.venueSafeOnly")}</p> : null}
            {lockedMode === "authoritative_replace" ? (
              <label className="flex items-center gap-2 pt-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmHard}
                  onChange={(e) => {
                    setConfirmHard(e.target.checked);
                    previewKeyRef.current = null;
                    setPreview(null);
                  }}
                />
                {t("people.roster.confirmHard")}
              </label>
            ) : null}
          </div>
        </div>

        {mappingRequired && !isShiftPreview ? (
          <div className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50/50 p-4 dark:bg-amber-950/20">
            <div>
              <h3 className="text-sm font-semibold">{t("people.roster.mapColumns")}</h3>
              <p className="text-xs text-muted-foreground">{t("people.roster.mapColumnsHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {MAP_FIELDS.map((field) => (
                <label key={field.key} className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t(`people.roster.col.${field.key}`)}
                    {field.required ? " *" : ""}
                  </span>
                  <SearchableSelect
                    value={manualMap?.[field.key] ?? ""}
                    onValueChange={(next) =>
                      setManualMap((prev) => ({ ...(prev ?? {}), [field.key]: next || undefined }))
                    }
                    placeholder={t("people.roster.unmapped")}
                    emptyOption={{ value: "", label: t("people.roster.unmapped") }}
                    options={mapHeaders.map((header) => ({ value: header, label: header }))}
                  />
                </label>
              ))}
            </div>
            <Button
              type="button"
              disabled={uploadMut.isPending || !file || !mappingReady}
              onClick={() => uploadMut.mutate({ mode: "preview", overrideMap: true })}
            >
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("people.roster.preview")}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {!mappingRequired || isShiftPreview ? (
            <Button
              type="button"
              variant="secondary"
              disabled={uploadMut.isPending || !file}
              onClick={() => {
                previewKeyRef.current = null;
                uploadMut.mutate({ mode: "preview" });
              }}
            >
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {previewing ? t("people.roster.reading") : t("people.roster.preview")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={readyToConfirm ? "default" : "outline"}
            disabled={!readyToConfirm}
            onClick={() => uploadMut.mutate({ mode: "commit" })}
          >
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("people.roster.confirm")}
          </Button>
          {confirmReason ? (
            <p className="text-xs text-muted-foreground">{confirmReason}</p>
          ) : readyToConfirm ? (
            <p className="text-xs text-muted-foreground">{t("people.roster.confirmHelp")}</p>
          ) : null}
        </div>
      </div>

      {previewError ? (
        <div className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("people.roster.previewFailed")}</h2>
          <p className="text-sm text-destructive">{previewError}</p>
        </div>
      ) : null}

      {isShiftPreview ? (
        <ShiftPreviewPanel
          preview={preview}
          readyToConfirm={readyToConfirm}
          committing={committing}
          onConfirm={() => uploadMut.mutate({ mode: "commit" })}
        />
      ) : p || (preview?.mode === "commit" && counts) ? (
        <PreviewPanel
          preview={preview}
          rowsOpen={rowsOpen}
          setRowsOpen={setRowsOpen}
          readyToConfirm={readyToConfirm}
          committing={committing}
          onConfirm={() => uploadMut.mutate({ mode: "commit" })}
        />
      ) : null}

      <div className="surface-card space-y-3 p-5">
        <h2 className="text-sm font-semibold">{t("people.roster.history")}</h2>
        {!history.data?.batches.length ? (
          <p className="text-sm text-muted-foreground">{t("people.roster.emptyHistory")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("people.roster.historyId")}</TableHead>
                <TableHead>{t("people.roster.historyFile")}</TableHead>
                <TableHead>{t("people.roster.historyMode")}</TableHead>
                <TableHead>{t("people.roster.historyStatus")}</TableHead>
                <TableHead>{t("people.roster.historyCounts")}</TableHead>
                <TableHead>{t("people.roster.historyWhen")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data.batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-[10px]">{b.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{b.staff_import_files?.[0]?.filename ?? "—"}</TableCell>
                  <TableCell className="text-xs">{b.kind === "shift_roster" ? `${b.kind} · ${b.mode}` : b.mode}</TableCell>
                  <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  <TableCell className="text-xs">+{b.create_count} ~{b.update_count} /{b.unchanged_count} !{b.review_count}</TableCell>
                  <TableCell className="text-xs">{new Date(b.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {b.status === "applied" && b.kind !== "shift_roster" ? (
                      <Button size="sm" variant="ghost" onClick={() => rollbackMut.mutate(b.id)}>
                        {t("people.roster.rollback")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function ShiftPreviewPanel({
  preview,
  readyToConfirm,
  committing,
  onConfirm,
}: {
  preview: PreviewResponse | null;
  readyToConfirm: boolean;
  committing: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (!preview) return null;
  const rows = (preview.rows ?? []).slice(0, PREVIEW_ROW_CAP);
  const errorMessages = (preview.errors ?? []).map((err) => (typeof err === "string" ? err : err.message));
  return (
    <div className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t("people.roster.preview")}</h2>
            {preview.mode === "commit" ? (
              <Badge variant="success">{t("people.roster.applied")}</Badge>
            ) : readyToConfirm ? (
              <Badge variant="success">{t("people.roster.readyToConfirm")}</Badge>
            ) : null}
            <Badge variant="outline">
              {preview.dateFrom} – {preview.dateTo}
            </Badge>
          </div>
        </div>
        <Button type="button" variant={readyToConfirm ? "default" : "outline"} disabled={!readyToConfirm} onClick={onConfirm}>
          {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("people.roster.confirm")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{t("people.roster.shiftMatched", { count: preview.matched ?? 0 })}</Badge>
        <Badge variant="warning">{t("people.roster.shiftUnmatched", { count: preview.unmatched ?? 0 })}</Badge>
        {(preview.skipped ?? 0) > 0 ? (
          <Badge variant="secondary">{t("people.roster.shiftSkipped", { count: preview.skipped })}</Badge>
        ) : null}
      </div>
      {errorMessages.map((msg) => (
        <p key={msg} className="text-sm text-destructive">{msg}</p>
      ))}
      {(preview.warnings ?? []).map((msg) => (
        <p key={msg} className="text-xs text-muted-foreground">{msg}</p>
      ))}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("people.roster.colDate")}</TableHead>
              <TableHead>{t("people.roster.colStaff")}</TableHead>
              <TableHead>{t("people.roster.col.location")}</TableHead>
              <TableHead>{t("people.roster.colShift")}</TableHead>
              <TableHead>{t("people.roster.colDuty")}</TableHead>
              <TableHead>{t("people.roster.action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${row.rowNumber}-${row.workDate}-${i}`}>
                <TableCell className="whitespace-nowrap">{row.workDate || "—"}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.staffLabel}</div>
                  <div className="text-xs text-muted-foreground">{row.employeeCode || row.qid || ""}</div>
                </TableCell>
                <TableCell>{row.locationCode ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.isWeekOff ? "—" : [row.shiftStart, row.shiftEnd].filter(Boolean).join("–") || "—"}
                </TableCell>
                <TableCell>
                  {row.isWeekOff ? t("people.roster.dutyOff") : t("people.roster.dutyYes")}
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === "matched" ? "success" : row.status === "skipped" ? "secondary" : "destructive"}>
                    {row.status}
                  </Badge>
                  {row.message ? <p className="mt-1 text-xs text-muted-foreground">{row.message}</p> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function PreviewPanel({
  preview,
  rowsOpen,
  setRowsOpen,
  readyToConfirm,
  committing,
  onConfirm,
}: {
  preview: PreviewResponse | null;
  rowsOpen: boolean;
  setRowsOpen: (open: boolean) => void;
  readyToConfirm: boolean;
  committing: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const p = preview?.preview;
  const counts = p?.counts ?? preview?.counts;
  if (!counts) return null;

  const missingCount = (counts.archive ?? 0) + (counts.delete ?? 0);
  const defaultTab =
    counts.review > 0 ? "review"
      : counts.create > 0 ? "new"
        : counts.update > 0 ? "updates"
          : missingCount > 0 ? "missing"
            : "unchanged";

  const rows = p?.rows ?? [];
  const missing = p?.missing ?? [];

  return (
    <div className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t("people.roster.preview")}</h2>
            {preview?.mode === "commit" ? (
              <Badge variant="success">{t("people.roster.applied")}</Badge>
            ) : readyToConfirm ? (
              <Badge variant="success">{t("people.roster.readyToConfirm")}</Badge>
            ) : null}
          </div>
          {p?.worksheetName ? (
            <p className="text-xs text-muted-foreground">{t("people.roster.autoMapped", { sheet: p.worksheetName })}</p>
          ) : null}
        </div>
        <Button type="button" variant={readyToConfirm ? "default" : "outline"} disabled={!readyToConfirm} onClick={onConfirm}>
          {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("people.roster.confirm")}
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CountCard label={t("people.roster.new")} value={counts.create} variant="success" />
        <CountCard label={t("people.roster.updated")} value={counts.update} variant="info" />
        <CountCard label={t("people.roster.unchanged")} value={counts.unchanged} variant="muted" />
        <CountCard label={t("people.roster.review")} value={counts.review} variant="warning" />
        <CountCard label={t("people.roster.archive")} value={counts.archive} variant="outline" />
        <CountCard label={t("people.roster.delete")} value={counts.delete} variant="destructive" />
      </dl>

      {p?.errors?.length ? (
        <ul className="space-y-1 text-xs text-destructive">
          {p.errors.slice(0, 8).map((err, i) => <li key={`${err.code}-${i}`}>{err.message}</li>)}
        </ul>
      ) : null}

      {p ? (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setRowsOpen(!rowsOpen)}>
            {rowsOpen ? t("people.roster.hideRows") : t("people.roster.showRows")}
          </Button>
          {rowsOpen ? (
            <Tabs key={`${counts.create}-${counts.update}-${counts.review}-${counts.unchanged}-${missingCount}`} defaultValue={defaultTab}>
              <TabsList>
                <TabsTrigger value="new">{t("people.roster.tabNew", { count: counts.create })}</TabsTrigger>
                <TabsTrigger value="updates">{t("people.roster.tabUpdates", { count: counts.update })}</TabsTrigger>
                <TabsTrigger value="review">{t("people.roster.tabReview", { count: counts.review })}</TabsTrigger>
                <TabsTrigger value="unchanged">{t("people.roster.tabUnchanged", { count: counts.unchanged })}</TabsTrigger>
                <TabsTrigger value="missing">{t("people.roster.tabMissing", { count: missingCount })}</TabsTrigger>
              </TabsList>
              <TabsContent value="new">
                <PreviewTable rows={rows.filter((r) => r.action === "create")} />
              </TabsContent>
              <TabsContent value="updates">
                <PreviewTable rows={rows.filter((r) => r.action === "update")} />
              </TabsContent>
              <TabsContent value="review">
                <PreviewTable rows={rows.filter((r) => r.action === "review")} />
              </TabsContent>
              <TabsContent value="unchanged">
                <PreviewTable rows={rows.filter((r) => r.action === "unchanged")} />
              </TabsContent>
              <TabsContent value="missing">
                <PreviewTable rows={missing} />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      ) : null}

      {readyToConfirm ? (
        <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("people.roster.confirmHelp")}</p>
          <Button type="button" onClick={onConfirm} disabled={!readyToConfirm}>
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("people.roster.confirm")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CountCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "info" | "muted" | "warning" | "outline" | "destructive";
}) {
  const tone =
    variant === "warning" && value > 0 ? "text-amber-700 dark:text-amber-300"
      : variant === "destructive" && value > 0 ? "text-destructive"
        : variant === "success" && value > 0 ? "text-emerald-700 dark:text-emerald-400"
          : "text-foreground";
  return (
    <div className="rounded-2xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewLine[] }) {
  const { t } = useTranslation();
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{t("people.roster.emptyTab")}</p>;
  }
  const shown = rows.slice(0, PREVIEW_ROW_CAP);
  return (
    <div className="space-y-2">
      {rows.length > PREVIEW_ROW_CAP ? (
        <p className="text-xs text-muted-foreground">
          {t("people.roster.showingFirst", { shown: shown.length, total: rows.length })}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>{t("people.roster.col.full_name")}</TableHead>
            <TableHead>{t("people.roster.col.location")}</TableHead>
            <TableHead>{t("people.roster.action")}</TableHead>
            <TableHead>{t("people.roster.warnings")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={`${r.rowNumber}-${r.fullName}-${r.action}-${r.matchStaffId ?? ""}`}>
              <TableCell className="text-xs">{r.rowNumber || "—"}</TableCell>
              <TableCell className="font-medium">{r.fullName}</TableCell>
              <TableCell>{r.locationCode ?? "—"}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={actionVariant(r.action)}>{r.action}</Badge>
                  {r.matchRule ? (
                    <span className="text-[10px] text-muted-foreground">
                      {t(`people.roster.match.${r.matchRule}`, { defaultValue: r.matchRule })}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-xs text-amber-800 dark:text-amber-300">
                {r.warnings.join("; ")}
                {r.fieldDiffs.length ? ` · ${r.fieldDiffs.map((d) => d.field).join(", ")}` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

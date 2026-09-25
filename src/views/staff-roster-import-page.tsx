"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FolderOpen, Loader2, Upload, X, Download } from "lucide-react";
import Link from "next/link";
import { type DragEvent, type UIEvent, memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ShiftRangeEditor } from "@/components/people/shift-range-editor";
import { StaffSampleDownloadDialog } from "@/components/people/staff-sample-download-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRoles } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { useStaff } from "@/hooks/queries/usePeople";
import { applyStaffMapToPreviewRows } from "@/lib/attendance-hr/apply-roster-name-map";
import { mapAttendanceRosterSheetName } from "@/lib/attendance-hr.functions";
import type { MatchedRosterRow } from "@/lib/attendance-hr/roster-upload";
import { isActiveRosterStaff } from "@/lib/staff-status";
import { queryKeys } from "@/lib/query-keys";
import {
  formatRosterFileSize,
  pickRosterImportFile,
  rosterFileKind,
  ROSTER_IMPORT_ACCEPT,
} from "@/lib/staff-roster/select-import-file";
import { virtualWindowRange, shouldVirtualizePreviewRows } from "@/lib/staff-roster/virtual-window";
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

type UploadArg = { mode: "preview" | "commit" };

type ShiftPreviewRow = MatchedRosterRow;

type PreviewResponse = {
  mode: string;
  kind?: "shift_roster" | "directory";
  batchId?: string;
  applied?: boolean;
  needsMapping?: boolean;
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
  notSaved?: number;
  error?: string;
};

type MapStaffOption = {
  id: string;
  full_name: string;
  employee_code: string;
  qid?: string | null;
  location_id: string;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
  status?: string | null;
};

const SHIFT_ROW_HEIGHT = 96;
const SHIFT_VIEWPORT_PX = 520;
const SHIFT_OVERSCAN = 8;

function staffAvailableAtLocation(s: MapStaffOption, locationId: string | null) {
  if (!locationId) return true;
  if (s.location_id === locationId) return true;
  if (s.is_roaming) return true;
  return Boolean(s.work_location_ids?.includes(locationId));
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function kindLabel(kind: ReturnType<typeof rosterFileKind>, t: (key: string) => string) {
  if (kind === "excel") return t("people.roster.fileKindExcel");
  if (kind === "csv") return t("people.roster.fileKindCsv");
  if (kind === "html") return t("people.roster.fileKindHtml");
  return kind;
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

  const [file, setFile] = useState<File | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("week");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => payrollMonthOf(todayYmd()));
  const [locationScope, setLocationScope] = useState<"single" | "multi">("multi");
  const [singleLocationId, setSingleLocationId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const sites = useSites();

  useEffect(() => {
    if (venueSafeOnly) setLocationScope("single");
  }, [venueSafeOnly]);

  useEffect(() => {
    if (!singleLocationId && storeLocationId) setSingleLocationId(storeLocationId);
  }, [storeLocationId, singleLocationId]);

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);

  const resetReview = () => {
    setPreview(null);
    setPreviewError(null);
    previewKeyRef.current = null;
  };

  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
    // Allow Preview to rematch the same file against the latest staff list.
    previewKeyRef.current = null;
  }, []);

  const handleShiftRowsChange = useCallback((rows: ShiftPreviewRow[], recount = true) => {
    setPreview((prev) => {
      if (!prev) return prev;
      if (!recount) return { ...prev, rows };
      return {
        ...prev,
        rows,
        matched: rows.filter((row) => row.status === "matched").length,
        unmatched: rows.filter((row) => row.status === "unmatched").length,
        skipped: rows.filter((row) => row.status === "skipped").length,
      };
    });
  }, []);

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
      form.set("importMode", "safe_sync");
      form.set("periodMode", periodMode);
      form.set("weekStart", weekStart);
      form.set("month", month);
      form.set("dateFrom", period.dateFrom);
      form.set("dateTo", period.dateTo);
      form.set("locationScope", locationScope);
      if (locationScope === "single") {
        if (!singleLocationId) throw new Error(t("people.roster.locationScopeNeedSite"));
        form.set("locationId", singleLocationId);
      }
      if (arg.mode === "preview") {
        if (!file) throw new Error(t("people.roster.chooseFile"));
        form.append("file", file);
      } else {
        if (!preview?.batchId) throw new Error(t("people.roster.preview"));
        form.set("batchId", preview.batchId);
        form.set("previewPatch", JSON.stringify({
          kind: "shift_roster",
          rows: preview.rows,
        }));
      }
      const res = await fetch("/api/people/roster-import", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      return body;
    },
    onSuccess: (data, arg) => {
      setPreviewError(null);
      startTransition(() => {
        setPreview(data);
      });
      if (arg.mode === "commit") {
        toast.success(
          t("people.roster.shiftApplied", {
            count: data.imported ?? data.matched ?? 0,
            from: data.dateFrom ?? period.dateFrom,
            to: data.dateTo ?? period.dateTo,
          }),
        );
        const notSaved = data.notSaved ?? (data.unmatched ?? 0) + (data.skipped ?? 0);
        if (notSaved > 0) {
          toast.warning(t("people.roster.shiftAppliedRemainder", { count: notSaved }));
        }
      } else {
        toast.success(t("people.roster.previewReady"));
      }
      if (arg.mode === "commit") {
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      }
    },
    onError: (e: Error, arg) => {
      if (arg.mode === "preview") {
        setPreview(null);
      }
      setPreviewError(e.message);
      toast.error(e.message);
    },
  });

  const confirmImport = useCallback(() => {
    setPreviewError(null);
    uploadMut.mutate({ mode: "commit" });
  }, [uploadMut]);

  useEffect(() => {
    if (!file) return;
    if (locationScope === "single" && !singleLocationId) return;
    const key = `${file.name}:${file.size}:${file.lastModified}:${periodMode}:${period.dateFrom}:${period.dateTo}:${locationScope}:${singleLocationId ?? ""}`;
    if (previewKeyRef.current === key) return;
    previewKeyRef.current = key;
    uploadMut.mutate({ mode: "preview" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, periodMode, period.dateFrom, period.dateTo, locationScope, singleLocationId]);

  const readyToConfirm = Boolean(
    preview?.batchId &&
      preview.mode !== "commit" &&
      !uploadMut.isPending &&
      (preview.matched ?? 0) > 0,
  );
  const previewing = uploadMut.isPending && uploadMut.variables?.mode === "preview";
  const committing = uploadMut.isPending && uploadMut.variables?.mode === "commit";

  const confirmReason = !file && !preview
    ? t("people.roster.confirmHintFile")
    : committing
      ? t("people.roster.confirming")
      : previewing || !preview
        ? t("people.roster.confirmHintPreview")
        : readyToConfirm
          ? null
          : preview?.mode === "commit"
            ? null
            : (preview.matched ?? 0) === 0
              ? t("people.roster.shiftNothingMatched")
              : t("people.roster.confirmHintPreview");

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
      <FecPageHeader
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
          <div className="space-y-1.5">
            <Label htmlFor="roster-import-location-scope">{t("people.roster.locationScope")}</Label>
            <SearchableSelect
              id="roster-import-location-scope"
              value={locationScope}
              onValueChange={(next) => {
                setLocationScope(next === "single" ? "single" : "multi");
                previewKeyRef.current = null;
                setPreview(null);
              }}
              options={[
                { value: "single", label: t("people.roster.locationScopeSingle") },
                ...(!venueSafeOnly
                  ? [{ value: "multi", label: t("people.roster.locationScopeMulti") }]
                  : []),
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {locationScope === "single"
                ? t("people.roster.locationScopeHelpSingle")
                : t("people.roster.locationScopeHelpMulti")}
            </p>
          </div>
          {locationScope === "single" ? (
            <div className="space-y-1.5">
              <Label htmlFor="roster-import-site">{t("people.roster.locationScopeSite")}</Label>
              <SearchableSelect
                id="roster-import-site"
                value={singleLocationId ?? ""}
                onValueChange={(next) => {
                  setSingleLocationId(next || null);
                  previewKeyRef.current = null;
                  setPreview(null);
                }}
                placeholder={t("people.roster.sampleSelectLocation")}
                options={sampleLocations.map((loc) => ({
                  value: loc.id,
                  label: loc.code,
                  description: loc.name,
                  keywords: `${loc.code} ${loc.name}`,
                }))}
              />
            </div>
          ) : null}
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

        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            variant={readyToConfirm || committing ? "default" : "outline"}
            disabled={!readyToConfirm}
            onClick={() => uploadMut.mutate({ mode: "commit" })}
          >
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {committing ? t("people.roster.confirming") : t("people.roster.confirm")}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="outline"
              title={t("people.roster.closePreviewHelp")}
              onClick={closePreview}
            >
              <X className="h-4 w-4" />
              {t("people.roster.closePreview")}
            </Button>
          ) : null}
          {confirmReason ? (
            <p className="text-xs text-muted-foreground">{confirmReason}</p>
          ) : readyToConfirm ? (
            <p className="text-xs text-muted-foreground">{t("people.roster.confirmHelp")}</p>
          ) : null}
        </div>
      </div>

      {previewError ? (
        <div className="surface-card space-y-2 p-5">
          <h2 className="text-sm font-semibold">
            {uploadMut.variables?.mode === "commit"
              ? t("people.roster.confirmFailed")
              : t("people.roster.previewFailed")}
          </h2>
          <p className="text-sm text-destructive">{previewError}</p>
        </div>
      ) : null}

      {preview ? (
        <ShiftPreviewPanel
          preview={preview}
          readyToConfirm={readyToConfirm}
          committing={committing}
          onConfirm={confirmImport}
          onClose={closePreview}
          onRowsChange={handleShiftRowsChange}
        />
      ) : null}

      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("people.roster.viewTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("people.roster.viewFromImportHelp")}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/people/roster">
            <CalendarDays className="h-4 w-4" />
            {t("people.roster.viewFromImport")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function useVirtualWindow(count: number, rowHeight = SHIFT_ROW_HEIGHT) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const reset = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, []);

  const range = virtualWindowRange(count, scrollTop, rowHeight, SHIFT_VIEWPORT_PX, SHIFT_OVERSCAN);

  return {
    scrollerRef,
    onScroll,
    reset,
    ...range,
  };
}

const ShiftPreviewPanel = memo(function ShiftPreviewPanel({
  preview,
  readyToConfirm,
  committing,
  onConfirm,
  onClose,
  onRowsChange,
}: {
  preview: PreviewResponse | null;
  readyToConfirm: boolean;
  committing: boolean;
  onConfirm: () => void;
  onClose: () => void;
  onRowsChange: (rows: ShiftPreviewRow[], recount?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched" | "skipped">("all");
  const [query, setQuery] = useState("");
  const [rowsOpen, setRowsOpen] = useState(false);
  const [tableReady, setTableReady] = useState(false);
  const [mappingKey, setMappingKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const allRows = useMemo(() => preview?.rows ?? [], [preview?.rows]);
  const batchKey = preview?.batchId ?? "";
  const editable = Boolean(preview && preview.mode !== "commit");
  const rowsRef = useRef(allRows);
  rowsRef.current = allRows;
  const staffQuery = useStaff(null, { enabled: rowsOpen && editable });
  const staffOptions = useMemo((): MapStaffOption[] => {
    return (staffQuery.data ?? [])
      .filter((s) => isActiveRosterStaff(s.status))
      .map((s) => ({
        id: s.id,
        full_name: s.full_name,
        employee_code: s.employee_code,
        qid: s.qid,
        location_id: s.location_id,
        is_roaming: s.is_roaming,
        work_location_ids: s.work_location_ids,
        status: s.status,
      }));
  }, [staffQuery.data]);

  useEffect(() => {
    setRowsOpen(false);
    setTableReady(false);
    setFilter("all");
    setQuery("");
    setMappingKey(null);
  }, [batchKey]);

  useEffect(() => {
    if (!rowsOpen || !preview) {
      setTableReady(false);
      return;
    }
    setTableReady(false);
    const id = window.setTimeout(() => setTableReady(true), 0);
    return () => window.clearTimeout(id);
  }, [rowsOpen, batchKey, preview]);

  const filtered = useMemo(() => {
    if (!rowsOpen) return [];
    const q = deferredQuery.trim().toLowerCase();
    return allRows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return [row.staffLabel, row.sourceName, row.employeeCode, row.qid, row.locationCode, row.workDate]
        .some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [allRows, filter, deferredQuery, rowsOpen]);

  const windowed = useVirtualWindow(filtered.length);
  const resetWindow = windowed.reset;

  useEffect(() => {
    resetWindow();
  }, [filter, deferredQuery, batchKey, resetWindow]);

  const patchRow = useCallback((row: ShiftPreviewRow, patch: Partial<ShiftPreviewRow>) => {
    const next = rowsRef.current.map((item) => (
      item.rowNumber === row.rowNumber && item.workDate === row.workDate ? { ...item, ...patch } : item
    ));
    onRowsChange(next, "isWeekOff" in patch || "status" in patch);
  }, [onRowsChange]);

  const mapStaff = useCallback(async (row: ShiftPreviewRow, staffId: string) => {
    if (!staffId || !row.locationId) {
      toast.error(t("people.roster.mapStaffFailed"));
      return;
    }
    const staff = staffOptions.find((s) => s.id === staffId);
    if (!staff) {
      toast.error(t("people.roster.mapStaffFailed"));
      return;
    }
    const sourceName = (row.sourceName?.trim() || row.staffLabel).trim();
    const key = `${row.rowNumber}:${row.workDate}`;
    setMappingKey(key);
    try {
      await mapAttendanceRosterSheetName({
        locationId: row.locationId,
        deviceName: sourceName,
        staffId,
      });
      const next = applyStaffMapToPreviewRows(rowsRef.current, {
        sourceName,
        locationId: row.locationId,
        locationCode: row.locationCode,
        staffId,
        mappedLabel: staff.full_name,
        employeeCode: staff.employee_code,
        qid: staff.qid,
      });
      onRowsChange(next, true);
      toast.success(
        t("people.roster.mapStaffApplied", {
          name: sourceName,
          staff: staff.full_name,
          location: row.locationCode ?? "",
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("people.roster.mapStaffFailed"));
    } finally {
      setMappingKey(null);
    }
  }, [onRowsChange, staffOptions, t]);

  if (!preview) return null;

  const errorMessages = (preview.errors ?? []).map((err) => (typeof err === "string" ? err : err.message));
  // Small lists (monthly single-staff = ~31) must not virtualize: fixed-height pads leave a tall
  // blank region that looks like missing dates even when matched=31. Also drop maxHeight when the
  // overscan window already covers every row (e.g. 10 unmatched).
  const virtualize = shouldVirtualizePreviewRows(filtered.length, windowed.fullyInWindow);
  const slice = virtualize ? filtered.slice(windowed.start, windowed.end) : filtered;

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
          <p className="text-xs text-muted-foreground">{t("people.roster.previewNote")}</p>
          {editable ? <p className="text-xs text-muted-foreground">{t("people.roster.editShiftHint")}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" title={t("people.roster.closePreviewHelp")} onClick={onClose}>
            <X className="h-4 w-4" />
            {t("people.roster.closePreview")}
          </Button>
          <Button type="button" variant={readyToConfirm || committing ? "default" : "outline"} disabled={!readyToConfirm} onClick={onConfirm}>
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {committing ? t("people.roster.confirming") : t("people.roster.confirm")}
          </Button>
        </div>
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
      <Button type="button" variant="ghost" size="sm" onClick={() => setRowsOpen((open) => !open)}>
        {rowsOpen ? t("people.roster.hideRows") : t("people.roster.showRows")}
      </Button>
      {rowsOpen ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "matched", "unmatched", "skipped"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {value === "all"
                  ? t("people.roster.filterAll", { count: allRows.length })
                  : value === "matched"
                    ? t("people.roster.shiftMatched", { count: preview.matched ?? 0 })
                    : value === "unmatched"
                      ? t("people.roster.shiftUnmatched", { count: preview.unmatched ?? 0 })
                      : t("people.roster.shiftSkipped", { count: preview.skipped ?? 0 })}
              </Button>
            ))}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("people.roster.searchRows")}
              className="h-8 max-w-xs"
            />
          </div>
          {!tableReady ? (
            <p className="text-sm text-muted-foreground">{t("people.roster.renderingRows")}</p>
          ) : filtered.length ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("people.roster.filterAll", { count: filtered.length })}
              </p>
              <div
                ref={windowed.scrollerRef}
                onScroll={virtualize ? windowed.onScroll : undefined}
                className="relative w-full overflow-auto rounded-lg border border-border/70"
                style={virtualize ? { maxHeight: SHIFT_VIEWPORT_PX } : undefined}
              >
                <table className="w-full caption-bottom text-sm text-foreground">
                  <TableHeader className={virtualize ? "sticky top-0 z-10 bg-card" : "bg-card"}>
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
                    {virtualize && windowed.topPad > 0 ? (
                      <tr aria-hidden>
                        <td colSpan={6} style={{ height: windowed.topPad, padding: 0, border: 0 }} />
                      </tr>
                    ) : null}
                    {slice.map((row, i) => (
                      <ShiftPreviewRowView
                        key={`${row.rowNumber}-${row.workDate}-${virtualize ? windowed.start + i : i}`}
                        row={row}
                        editable={editable}
                        staffOptions={staffOptions}
                        mappingBusy={mappingKey === `${row.rowNumber}:${row.workDate}`}
                        onPatch={patchRow}
                        onMapStaff={mapStaff}
                      />
                    ))}
                    {virtualize && windowed.bottomPad > 0 ? (
                      <tr aria-hidden>
                        <td colSpan={6} style={{ height: windowed.bottomPad, padding: 0, border: 0 }} />
                      </tr>
                    ) : null}
                  </TableBody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("people.roster.emptyTab")}</p>
          )}
        </>
      ) : null}
    </div>
  );
});

const ShiftPreviewRowView = memo(function ShiftPreviewRowView({
  row,
  editable,
  staffOptions,
  mappingBusy,
  onPatch,
  onMapStaff,
}: {
  row: ShiftPreviewRow;
  editable: boolean;
  staffOptions: MapStaffOption[];
  mappingBusy: boolean;
  onPatch: (row: ShiftPreviewRow, patch: Partial<ShiftPreviewRow>) => void;
  onMapStaff: (row: ShiftPreviewRow, staffId: string) => void;
}) {
  const { t } = useTranslation();
  const canMap = editable && row.status !== "skipped" && Boolean(row.locationId) && row.matchRule !== "outside_period";
  const locationStaff = useMemo(() => {
    if (!canMap) return [];
    const keep = new Set<string>();
    if (row.staffId) keep.add(row.staffId);
    return staffOptions.filter((s) => staffAvailableAtLocation(s, row.locationId) || keep.has(s.id));
  }, [canMap, staffOptions, row.locationId, row.staffId]);
  const sourceName = row.sourceName?.trim() || row.staffLabel;
  const locationLabel = row.locationCode?.trim() || null;

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{row.workDate || "—"}</TableCell>
      <TableCell>
        <div className="font-medium">{sourceName}</div>
        {row.status === "matched" && row.staffLabel && row.staffLabel !== sourceName ? (
          <div className="text-xs text-muted-foreground">{row.staffLabel}</div>
        ) : null}
        <div className="text-xs text-muted-foreground">{row.employeeCode || row.qid || ""}</div>
      </TableCell>
      <TableCell>{locationLabel ?? "—"}</TableCell>
      <TableCell>
        <ShiftRangeEditor
          start={row.shiftStart}
          end={row.shiftEnd}
          disabled={row.isWeekOff}
          readOnly={!editable}
          onStartChange={(value) => onPatch(row, { shiftStart: value })}
          onEndChange={(value) => onPatch(row, { shiftEnd: value })}
        />
      </TableCell>
      <TableCell>
        {editable ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.isWeekOff}
              onChange={(e) => onPatch(row, { isWeekOff: e.target.checked })}
            />
            {row.isWeekOff ? t("people.roster.dutyOff") : t("people.roster.dutyYes")}
          </label>
        ) : (
          row.isWeekOff ? t("people.roster.dutyOff") : t("people.roster.dutyYes")
        )}
      </TableCell>
      <TableCell className="min-w-[14rem]">
        <Badge variant={row.status === "matched" ? "success" : row.status === "skipped" ? "secondary" : "destructive"}>
          {row.status}
        </Badge>
        {row.message ? <p className="mt-1 text-xs text-muted-foreground">{row.message}</p> : null}
        {row.status === "unmatched" && locationLabel && !row.message?.includes(locationLabel) ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("people.roster.triedAtLocation", { location: locationLabel })}
          </p>
        ) : null}
        {canMap ? (
          <div className="mt-2 space-y-1">
            <SearchableSelect
              value={row.staffId ?? ""}
              disabled={mappingBusy}
              onValueChange={(value) => {
                if (!value || value === row.staffId) return;
                onMapStaff(row, value);
              }}
              placeholder={
                locationLabel
                  ? t("people.roster.mapStaffAtLocation", { location: locationLabel })
                  : t("people.roster.mapStaffPlaceholder")
              }
              emptyOption={
                row.status === "unmatched"
                  ? {
                      value: "",
                      label: locationLabel
                        ? t("people.roster.mapStaffAtLocation", { location: locationLabel })
                        : t("people.roster.mapStaffPlaceholder"),
                    }
                  : undefined
              }
              triggerClassName="h-auto min-h-9 min-w-48 max-w-72 px-2 text-left font-normal"
              options={locationStaff.map((s) => ({
                value: s.id,
                label: s.full_name,
                description: `${s.employee_code}${s.qid ? ` · ${s.qid}` : ""}`,
                keywords: `${s.full_name} ${s.employee_code} ${s.qid ?? ""}`,
              }))}
            />
            {mappingBusy ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("people.roster.mapStaff")}
              </p>
            ) : row.matchRule === "name_map" ? (
              <p className="text-xs text-muted-foreground">{t("people.roster.mappedViaPicker")}</p>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
});

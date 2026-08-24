"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAttendanceHrBootstrap } from "@/lib/attendance-hr.functions";
import {
  ATTENDANCE_IMPORT_ACCEPT,
  attendanceImportKindKey,
  classifyAttendanceImportFilename,
  formatImportFileSize,
  selectAttendanceImportFiles,
  type SkippedImportFile,
} from "@/lib/attendance-hr/select-import-files";
import {
  attendanceRosterPeriod,
  qatarWeekBounds,
  type AttendanceRosterPeriodMode,
} from "@/lib/attendance-hr/roster-period";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

type PreviewPunch = {
  biometricUserId: string;
  punchAt: string;
  verifyMethod?: number | null;
  inOutStatus?: number | null;
  matched?: boolean;
};

type FilePreview = {
  ok: boolean;
  filename: string;
  message?: string;
  kind?: string;
  userCount?: number;
  punchCount?: number;
  uniqueUserCount?: number;
  matchedStaff?: number;
  unmatched?: number;
  skippedOutsidePeriod?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  errors?: Array<{ message: string }>;
  users?: Array<{ biometricUserId: string; name: string }>;
  punches?: PreviewPunch[];
};

type PreviewResponse = {
  mode: string;
  importId?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  summary?: {
    fileCount: number;
    okFiles: number;
    punchCount: number;
    userCount: number;
    matchedStaff: number;
    unmatched: number;
    errorCount: number;
    skippedOutsidePeriod?: number;
    dateFrom: string | null;
    dateTo: string | null;
  };
  previews: FilePreview[];
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Qatar", hour12: false });
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function canConfirmPreview(preview: PreviewResponse | null) {
  return Boolean(
    preview &&
      (preview.previews ?? []).some((p) => p.ok && ((p.punchCount ?? 0) > 0 || (p.userCount ?? 0) > 0)),
  );
}

export default function AttendanceHrImportPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const bootstrap = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });
  const companies = bootstrap.data?.companies ?? [];
  const sites = bootstrap.data?.sites ?? [];

  const [companyId, setCompanyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("month");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const [files, setFiles] = useState<File[]>([]);
  const [skipped, setSkipped] = useState<SkippedImportFile[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const siteDevices = useMemo(
    () => (bootstrap.data?.devices ?? []).filter((d) => !locationId || d.location_id === locationId),
    [bootstrap.data?.devices, locationId],
  );

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
  };

  const applyPickedFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const result = selectAttendanceImportFiles(Array.from(list), files);
    setFiles(result.accepted);
    setSkipped(result.skipped);
    resetReview();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setSkipped([]);
    resetReview();
  };

  const clearAllFiles = () => {
    setFiles([]);
    setSkipped([]);
    resetReview();
    if (filesRef.current) filesRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  };

  const uploadMut = useMutation({
    mutationFn: async (mode: "preview" | "commit") => {
      if (!companyId || !locationId || !deviceId) throw new Error(t("attendanceHr.import.needCompanySiteDevice"));
      if (!files.length) throw new Error(t("attendanceHr.import.needFiles"));
      const form = new FormData();
      form.set("mode", mode);
      form.set("companyId", companyId);
      form.set("locationId", locationId);
      form.set("deviceId", deviceId);
      form.set("periodMode", periodMode);
      form.set("weekStart", weekStart);
      form.set("month", month);
      for (const file of files) form.append("files", file);
      const res = await fetch("/api/people/attendance-hr/import", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as PreviewResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? t("attendanceHr.import.importFailed"));
      if (!Array.isArray(body.previews)) throw new Error(t("attendanceHr.import.previewMissing"));
      return body;
    },
    onSuccess: (data, mode) => {
      setPreview(data);
      setPreviewError(null);
      if (mode === "commit") {
        const from = String(data.dateFrom ?? data.summary?.dateFrom ?? "").slice(0, 10);
        const to = String(data.dateTo ?? data.summary?.dateTo ?? "").slice(0, 10);
        void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "attendance-hr"] });
        toast.success(
          from && to
            ? t("attendanceHr.import.reportReady", { from, to })
            : t("attendanceHr.import.reportReadyNoDates"),
        );
        router.push(from && to ? `/people/attendance?from=${from}&to=${to}` : "/people/attendance");
        return;
      }
      if (canConfirmPreview(data)) toast.success(t("attendanceHr.import.previewReady"));
      else toast.error(t("attendanceHr.import.nothingReadable"));
    },
    onError: (e: Error) => {
      setPreview(null);
      setPreviewError(e.message);
      toast.error(e.message);
    },
  });

  const sampleRows = (preview?.previews ?? []).flatMap((p) =>
    (p.punches ?? []).slice(0, 25).map((row, i) => ({ ...row, filename: p.filename, key: `${p.filename}-${i}` })),
  );
  const readyToConfirm = canConfirmPreview(preview) && !uploadMut.isPending;
  const confirmLabel = uploadMut.isPending && uploadMut.variables === "commit"
    ? t("attendanceHr.import.buildingReport")
    : t("attendanceHr.import.confirm");
  const confirmReason = !companyId || !locationId || !deviceId
    ? t("attendanceHr.import.confirmHintContext")
    : !files.length
      ? t("attendanceHr.import.confirmHintFiles")
      : !preview
        ? t("attendanceHr.import.confirmHintPreview")
        : canConfirmPreview(preview)
          ? null
          : t("attendanceHr.import.confirmHintEmpty");

  const kindLabel = (filename: string) => {
    const key = attendanceImportKindKey(classifyAttendanceImportFilename(filename));
    if (key === "user_dat") return t("attendanceHr.import.kindUserDat");
    if (key === "attlog") return t("attendanceHr.import.kindAttlog");
    if (key === "excel") return t("attendanceHr.import.kindExcel");
    if (key === "csv") return t("attendanceHr.import.kindCsv");
    return t("attendanceHr.import.kindUnknown");
  };

  const skippedLabel = (item: SkippedImportFile) => {
    const reason = item.reason === "template"
      ? t("attendanceHr.import.skippedTemplate")
      : t("attendanceHr.import.skippedUnsupported");
    return `${item.filename} (${reason})`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Upload}
        kicker={t("attendanceHr.import.kicker")}
        title={t("attendanceHr.import.title")}
        subtitle={t("attendanceHr.import.subtitle")}
      />
      <AttendanceHrNav />
      <NeumorphicCard className="space-y-4 p-5">
        <ol className="grid gap-4 md:grid-cols-3">
          <li className="space-y-1.5">
            <Label>{t("attendanceHr.import.stepCompany")}</Label>
            <SearchableSelect
              value={companyId}
              onValueChange={(next) => {
                setCompanyId(next);
                resetReview();
              }}
              placeholder={t("attendanceHr.import.selectCompany")}
              emptyOption={{ value: "", label: t("attendanceHr.import.selectCompany") }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </li>
          <li className="space-y-1.5">
            <Label>{t("attendanceHr.import.stepSite")}</Label>
            <SearchableSelect
              value={locationId}
              onValueChange={(next) => {
                setLocationId(next);
                setDeviceId("");
                resetReview();
              }}
              placeholder={t("attendanceHr.import.selectSite")}
              emptyOption={{ value: "", label: t("attendanceHr.import.selectSite") }}
              options={sites.map((s) => {
                const loc = s.location as { name?: string; code?: string } | null;
                return {
                  value: s.location_id,
                  label: loc?.name ?? s.location_id,
                  keywords: `${loc?.code ?? ""} ${loc?.name ?? ""} ${s.location_id}`,
                };
              })}
            />
          </li>
          <li className="space-y-1.5">
            <Label>{t("attendanceHr.import.stepDevice")}</Label>
            <SearchableSelect
              value={deviceId}
              onValueChange={(next) => {
                setDeviceId(next);
                resetReview();
              }}
              placeholder={t("attendanceHr.import.selectDevice")}
              emptyOption={{ value: "", label: t("attendanceHr.import.selectDevice") }}
              options={siteDevices.map((d) => ({
                value: d.id,
                label: d.device_name,
                keywords: `${d.device_name} ${d.device_code ?? ""}`,
              }))}
            />
          </li>
        </ol>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="attendance-import-period">{t("attendanceHr.import.stepPeriod")}</Label>
            <SearchableSelect
              id="attendance-import-period"
              value={periodMode}
              onValueChange={(next) => {
                setPeriodMode(next === "week" ? "week" : "month");
                resetReview();
              }}
              options={[
                { value: "week", label: t("attendanceHr.import.periodWeek") },
                { value: "month", label: t("attendanceHr.import.periodMonth") },
              ]}
            />
          </div>
          {periodMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="attendance-import-week">{t("attendanceHr.import.weekStart")}</Label>
              <Input
                id="attendance-import-week"
                type="date"
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(qatarWeekBounds(e.target.value || todayYmd()).dateFrom);
                  resetReview();
                }}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="attendance-import-month">{t("attendanceHr.import.month")}</Label>
              <Input
                id="attendance-import-month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  resetReview();
                }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("attendanceHr.import.dateRange")}</Label>
            <p className="rounded-full border border-border/70 bg-background px-3 py-2 text-sm">
              {period.dateFrom} – {period.dateTo}
            </p>
            <p className="text-xs text-muted-foreground">{t("attendanceHr.import.periodHelp")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="attendance-import-files">{t("attendanceHr.import.stepFiles")}</Label>
          <input
            id="attendance-import-files"
            ref={filesRef}
            type="file"
            multiple
            accept={ATTENDANCE_IMPORT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              applyPickedFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(e) => {
              applyPickedFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => filesRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t("attendanceHr.import.chooseFiles")}
            </Button>
            <Button type="button" variant="outline" onClick={() => folderRef.current?.click()}>
              <FolderOpen className="h-4 w-4" />
              {t("attendanceHr.import.chooseFolder")}
            </Button>
            {files.length > 0 ? (
              <Button type="button" variant="ghost" onClick={clearAllFiles}>
                <Trash2 className="h-4 w-4" />
                {t("attendanceHr.import.clearAll")}
              </Button>
            ) : null}
          </div>

          {files.length > 0 ? (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-background">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatImportFileSize(file.size)} · {kindLabel(file.name)}
                    </p>
                  </div>
                  <Badge variant="outline">{kindLabel(file.name)}</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeFile(index)}>
                    <X className="h-4 w-4" />
                    {t("attendanceHr.import.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("attendanceHr.import.noFiles")}</p>
          )}

          <p className="text-xs text-muted-foreground">
            {files.length ? `${t("attendanceHr.import.filesSelected", { count: files.length })} ` : null}
            {t("attendanceHr.import.templateWarning")}
          </p>
          {preview?.summary?.skippedOutsidePeriod ? (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t("attendanceHr.import.skippedOutside", { count: preview.summary.skippedOutsidePeriod })}
            </p>
          ) : null}
          {skipped.length > 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t("attendanceHr.import.skipped", {
                count: skipped.length,
                names: skipped.map(skippedLabel).join(", "),
              })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={uploadMut.isPending} onClick={() => uploadMut.mutate("preview")}>
            {uploadMut.isPending && uploadMut.variables === "preview" ? t("attendanceHr.import.reading") : t("attendanceHr.import.preview")}
          </Button>
          <Button
            type="button"
            variant={readyToConfirm ? "default" : "outline"}
            disabled={!readyToConfirm}
            onClick={() => uploadMut.mutate("commit")}
          >
            {confirmLabel}
          </Button>
          {confirmReason ? (
            <p className="text-xs text-muted-foreground">{confirmReason}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("attendanceHr.import.confirmHelp")}</p>
          )}
        </div>
      </NeumorphicCard>

      {previewError ? (
        <NeumorphicCard className="space-y-2 p-5" accent="red">
          <h2 className="text-sm font-semibold">{t("attendanceHr.import.previewFailed")}</h2>
          <p className="text-sm text-destructive">{previewError}</p>
        </NeumorphicCard>
      ) : null}

      {uploadMut.isPending && !preview ? (
        <NeumorphicCard className="p-5">
          <p className="text-sm text-muted-foreground">{t("attendanceHr.import.readingFiles")}</p>
        </NeumorphicCard>
      ) : null}

      {preview ? (
        <NeumorphicCard className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("attendanceHr.import.previewTitle")}</h2>
            {canConfirmPreview(preview) ? (
              <Badge variant="success">{t("attendanceHr.import.readyToConfirm")}</Badge>
            ) : (
              <Badge variant="destructive">{t("attendanceHr.import.nothingToImport")}</Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.punches")}</dt>
              <dd className="font-semibold">{preview.summary?.punchCount ?? preview.previews.reduce((n, p) => n + (p.punchCount ?? 0), 0)}</dd>
            </div>
            <div className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.matchedStaff")}</dt>
              <dd className="font-semibold">{preview.summary?.matchedStaff ?? 0}</dd>
            </div>
            <div className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.unmatchedIds")}</dt>
              <dd className="font-semibold">{preview.summary?.unmatched ?? 0}</dd>
            </div>
            <div className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.errors")}</dt>
              <dd className="font-semibold">{preview.summary?.errorCount ?? 0}</dd>
            </div>
            <div className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.skippedOutsideLabel")}</dt>
              <dd className="font-semibold">{preview.summary?.skippedOutsidePeriod ?? preview.previews.reduce((n, p) => n + (p.skippedOutsidePeriod ?? 0), 0)}</dd>
            </div>
            <div className="col-span-2 rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">{t("attendanceHr.import.dateRange")}</dt>
              <dd className="text-xs font-medium">
                {preview.summary?.dateFrom || preview.summary?.dateTo
                  ? `${formatWhen(preview.summary?.dateFrom)} → ${formatWhen(preview.summary?.dateTo)}`
                  : t("attendanceHr.import.noPunchTimes")}
              </dd>
            </div>
          </dl>

          {(preview.previews ?? []).map((p) => (
            <div key={p.filename} className="rounded-2xl border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.filename}</span>
                {p.ok ? <Badge variant="success">{p.kind ?? "ok"}</Badge> : <Badge variant="destructive">{t("attendanceHr.import.failed")}</Badge>}
                <span className="text-xs text-muted-foreground">
                  {p.unmatched != null
                    ? t("attendanceHr.import.fileMetaUnmatched", {
                      users: p.uniqueUserCount ?? p.userCount ?? 0,
                      punches: p.punchCount ?? 0,
                      unmatched: p.unmatched,
                    })
                    : t("attendanceHr.import.fileMeta", {
                      users: p.uniqueUserCount ?? p.userCount ?? 0,
                      punches: p.punchCount ?? 0,
                    })}
                </span>
              </div>
              {p.message ? <p className="text-destructive">{p.message}</p> : null}
              {(p.errors ?? []).slice(0, 8).map((e, i) => <p key={i} className="text-xs text-destructive">{e.message}</p>)}
              {(p.users ?? []).slice(0, 8).map((u) => <p key={u.biometricUserId} className="text-xs">{u.biometricUserId} — {u.name}</p>)}
            </div>
          ))}

          {sampleRows.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("attendanceHr.import.samplePunches")}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("attendanceHr.import.userId")}</TableHead>
                    <TableHead>{t("attendanceHr.import.punchTime")}</TableHead>
                    <TableHead>{t("attendanceHr.import.inOut")}</TableHead>
                    <TableHead>{t("attendanceHr.import.match")}</TableHead>
                    <TableHead>{t("attendanceHr.import.file")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-mono text-xs">{row.biometricUserId}</TableCell>
                      <TableCell className="font-mono text-xs">{formatWhen(row.punchAt)}</TableCell>
                      <TableCell className="text-xs">{row.inOutStatus ?? "—"}</TableCell>
                      <TableCell>
                        {row.matched ? <Badge variant="success">{t("attendanceHr.import.mapped")}</Badge> : <Badge variant="warning">{t("attendanceHr.import.unmatched")}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.filename}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("attendanceHr.import.noSampleRows")}</p>
          )}

          <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {confirmReason ?? t("attendanceHr.import.confirmHelp")}
            </p>
            <Button
              type="button"
              variant={readyToConfirm ? "default" : "outline"}
              disabled={!readyToConfirm}
              onClick={() => uploadMut.mutate("commit")}
            >
              {confirmLabel}
            </Button>
          </div>
        </NeumorphicCard>
      ) : null}
    </div>
  );
}

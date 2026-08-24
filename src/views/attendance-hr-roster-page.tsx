"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Download, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { StaffSampleDownloadDialog } from "@/components/people/staff-sample-download-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAttendanceHrBootstrap, listAttendanceRosterUploads } from "@/lib/attendance-hr.functions";
import {
  ATTENDANCE_ROSTER_ACCEPT,
  attendanceRosterPeriod,
  canUploadAttendanceRoster,
  qatarWeekBounds,
  type AttendanceRosterPeriodMode,
} from "@/lib/attendance-hr/roster-period";
import { downloadCsvFromApi } from "@/lib/staff-import";
import { usePermission } from "@/hooks/use-permission";
import { useUserRoles } from "@/hooks/use-auth";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

type PreviewRow = {
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
  periodMode?: string;
  dateFrom?: string;
  dateTo?: string;
  matched?: number;
  unmatched?: number;
  skipped?: number;
  imported?: number;
  processed?: number;
  warnings?: string[];
  errors?: string[];
  rows?: PreviewRow[];
  error?: string;
};

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

export default function AttendanceHrRosterPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const roles = useUserRoles();
  const canUpload = canUploadAttendanceRoster(roles);
  const canViewAllAttendance = usePermission("attendance.view_all");
  const canViewAllDailyOps = usePermission("daily_ops.view_all");
  const canAllSites = canViewAllAttendance || canViewAllDailyOps;

  const bootstrap = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
    queryFn: () => getAttendanceHrBootstrap(),
    staleTime: STALE.people,
  });
  const sites = bootstrap.data?.sites ?? [];

  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("week");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const [locationId, setLocationId] = useState(storeLocationId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);

  const uploads = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "roster-uploads", locationId: locationId || null }),
    queryFn: () => listAttendanceRosterUploads({ locationId: locationId || null }),
    staleTime: STALE.people,
  });

  const resetPreview = () => setPreview(null);

  const uploadMut = useMutation({
    mutationFn: async (mode: "preview" | "commit") => {
      if (!file) throw new Error(t("attendanceHr.roster.needFile"));
      if (periodMode === "week" && !canAllSites && !locationId) throw new Error(t("attendanceHr.roster.needLocation"));
      if (periodMode === "month" && !canAllSites && !locationId) throw new Error(t("attendanceHr.roster.needLocation"));
      const form = new FormData();
      form.set("mode", mode);
      form.set("periodMode", periodMode);
      form.set("weekStart", weekStart);
      form.set("month", month);
      form.set("dateFrom", period.dateFrom);
      form.set("dateTo", period.dateTo);
      if (locationId) form.set("locationId", locationId);
      form.set("file", file);
      const res = await fetch("/api/people/attendance-hr/roster", { method: "POST", body: form, credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as PreviewResponse;
      if (!res.ok) throw new Error(body.error ?? t("attendanceHr.roster.failed"));
      return body;
    },
    onSuccess: (data, mode) => {
      setPreview(data);
      if (mode === "commit") {
        void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "attendance-hr"] });
        toast.success(
          t("attendanceHr.roster.savedToast", {
            count: data.imported ?? data.matched ?? 0,
            from: data.dateFrom,
            to: data.dateTo,
          }),
        );
        return;
      }
      if ((data.matched ?? 0) > 0) toast.success(t("attendanceHr.roster.previewReady"));
      else toast.error(data.errors?.[0] ?? t("attendanceHr.roster.nothingMatched"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const readyToConfirm = Boolean(preview && (preview.matched ?? 0) > 0 && !uploadMut.isPending);
  const sampleRows = (preview?.rows ?? []).slice(0, 80);
  const sampleLocations = sites.map((s) => {
    const loc = s.location as { id?: string; name?: string; code?: string } | null;
    return { id: s.location_id, code: loc?.code ?? null, name: loc?.name ?? null };
  });

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
      await downloadCsvFromApi(`/api/people/attendance-hr/roster?${params.toString()}`);
      toast.success(t("attendanceHr.roster.sampleReady"));
      setSampleOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("attendanceHr.roster.failed"));
    } finally {
      setSampleBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarRange}
        kicker={t("nav.departments.people")}
        title={t("attendanceHr.roster.title")}
        subtitle={t("attendanceHr.roster.subtitle")}
        actions={
          <Button type="button" variant="outline" onClick={() => setSampleOpen(true)}>
            <Download className="h-4 w-4" />
            {t("attendanceHr.roster.downloadTemplate")}
          </Button>
        }
      />
      <AttendanceHrNav />

      <StaffSampleDownloadDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        title={t("attendanceHr.roster.sampleTitle")}
        description={t("attendanceHr.roster.sampleHelp")}
        locations={sampleLocations}
        defaultLocationId={locationId || storeLocationId}
        downloading={sampleBusy}
        allowAll={canAllSites}
        onConfirm={downloadSample}
      />

      <NeumorphicCard className="space-y-5 p-5">
        <p className="text-sm text-muted-foreground">{t("attendanceHr.roster.columnsHelp")}</p>
        <p className="text-xs text-muted-foreground">{t("attendanceHr.roster.replaceHelp")}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="attendance-roster-mode">{t("attendanceHr.roster.mode")}</Label>
            <SearchableSelect
              id="attendance-roster-mode"
              value={periodMode}
              onValueChange={(next) => {
                setPeriodMode(next === "month" ? "month" : "week");
                resetPreview();
              }}
              options={[
                { value: "week", label: t("attendanceHr.roster.modeWeek") },
                { value: "month", label: t("attendanceHr.roster.modeMonth") },
              ]}
            />
          </div>
          {periodMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="attendance-roster-week">{t("attendanceHr.roster.weekStart")}</Label>
              <Input
                id="attendance-roster-week"
                type="date"
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(qatarWeekBounds(e.target.value || todayYmd()).dateFrom);
                  resetPreview();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {period.dateFrom} – {period.dateTo}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="attendance-roster-month">{t("attendanceHr.roster.month")}</Label>
              <Input
                id="attendance-roster-month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  resetPreview();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {period.dateFrom} – {period.dateTo}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="attendance-roster-location">{t("attendanceHr.roster.location")}</Label>
            <SearchableSelect
              id="attendance-roster-location"
              value={locationId}
              onValueChange={(next) => {
                setLocationId(next);
                resetPreview();
              }}
              placeholder={canAllSites ? t("attendanceHr.roster.allLocations") : t("attendanceHr.roster.selectLocation")}
              emptyOption={{
                value: "",
                label: canAllSites ? t("attendanceHr.roster.allLocations") : t("attendanceHr.roster.selectLocation"),
              }}
              options={sites.map((s) => {
                const loc = s.location as { name?: string; code?: string } | null;
                const label = loc?.code ? `${loc.code} — ${loc.name}` : loc?.name ?? s.location_id;
                return { value: s.location_id, label, keywords: `${loc?.code ?? ""} ${loc?.name ?? ""}` };
              })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-roster-file">{t("attendanceHr.roster.file")}</Label>
            <input
              id="attendance-roster-file"
              ref={fileRef}
              type="file"
              accept={ATTENDANCE_ROSTER_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                resetPreview();
              }}
            />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={!canUpload}>
              <Upload className="h-4 w-4" />
              {file ? file.name : t("attendanceHr.roster.chooseFile")}
            </Button>
          </div>
        </div>

        {!canUpload ? (
          <p className="text-sm text-muted-foreground">{t("attendanceHr.roster.noPermission")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => uploadMut.mutate("preview")} disabled={!file || uploadMut.isPending}>
              {uploadMut.isPending && uploadMut.variables === "preview"
                ? t("attendanceHr.roster.reading")
                : t("attendanceHr.roster.preview")}
            </Button>
            <Button type="button" onClick={() => uploadMut.mutate("commit")} disabled={!readyToConfirm}>
              {uploadMut.isPending && uploadMut.variables === "commit"
                ? t("attendanceHr.roster.saving")
                : t("attendanceHr.roster.confirm")}
            </Button>
          </div>
        )}
      </NeumorphicCard>

      {preview ? (
        <NeumorphicCard className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t("attendanceHr.roster.previewTitle")}</h2>
            <Badge variant="success">{t("attendanceHr.roster.matched", { count: preview.matched ?? 0 })}</Badge>
            <Badge variant="warning">{t("attendanceHr.roster.unmatched", { count: preview.unmatched ?? 0 })}</Badge>
            {(preview.skipped ?? 0) > 0 ? (
              <Badge variant="secondary">{t("attendanceHr.roster.skipped", { count: preview.skipped })}</Badge>
            ) : null}
          </div>
          {(preview.errors ?? []).map((msg) => (
            <p key={msg} className="text-sm text-destructive">
              {msg}
            </p>
          ))}
          {(preview.warnings ?? []).map((msg) => (
            <p key={msg} className="text-xs text-muted-foreground">
              {msg}
            </p>
          ))}
          {sampleRows.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("attendanceHr.roster.colDate")}</TableHead>
                    <TableHead>{t("attendanceHr.roster.colStaff")}</TableHead>
                    <TableHead>{t("attendanceHr.roster.colLocation")}</TableHead>
                    <TableHead>{t("attendanceHr.roster.colShift")}</TableHead>
                    <TableHead>{t("attendanceHr.roster.colDuty")}</TableHead>
                    <TableHead>{t("attendanceHr.roster.colMatch")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleRows.map((row, i) => (
                    <TableRow key={`${row.rowNumber}-${row.workDate}-${i}`}>
                      <TableCell className="whitespace-nowrap">{row.workDate || "—"}</TableCell>
                      <TableCell>
                        <div>{row.staffLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.employeeCode || row.qid || ""}
                        </div>
                      </TableCell>
                      <TableCell>{row.locationCode ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.isWeekOff ? "—" : [row.shiftStart, row.shiftEnd].filter(Boolean).join("–") || "—"}
                      </TableCell>
                      <TableCell>
                        {row.isWeekOff ? t("attendanceHr.roster.dutyOff") : t("attendanceHr.roster.dutyYes")}
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
            </div>
          ) : null}
        </NeumorphicCard>
      ) : null}

      <NeumorphicCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">{t("attendanceHr.roster.recentUploads")}</h2>
        {uploads.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("attendanceHr.roster.loading")}</p>
        ) : !(uploads.data ?? []).length ? (
          <p className="text-sm text-muted-foreground">{t("attendanceHr.roster.uploadsEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("attendanceHr.roster.uploadedAt")}</TableHead>
                <TableHead>{t("attendanceHr.roster.file")}</TableHead>
                <TableHead>{t("attendanceHr.roster.period")}</TableHead>
                <TableHead>{t("attendanceHr.roster.rowsImported")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(uploads.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}</TableCell>
                  <TableCell>{row.file_name}</TableCell>
                  <TableCell>
                    {row.period_start && row.period_end ? `${row.period_start} – ${row.period_end}` : "—"}
                  </TableCell>
                  <TableCell>{row.rows_imported}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </NeumorphicCard>
    </div>
  );
}

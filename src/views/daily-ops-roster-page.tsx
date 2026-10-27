"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, MapPin, MoreHorizontal, Share2, Sparkles, Upload, Users, ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { RosterGeneratePanel } from "@/components/daily-ops/roster-generate-panel";
import { RosterMonthCalendar } from "@/components/daily-ops/roster-month-calendar";
import { RosterExportView } from "@/components/daily-ops/roster-export-view";
import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import {
  useDailyOpsRoster,
  useDailyOpsRosterUploads,
  useDailyOpsShiftRoster,
} from "@/hooks/queries/useDailyOps";
import { useSites } from "@/hooks/queries/useSites";
import {
  updateStaffRoster,
  uploadDailyOpsRosterCsv,
} from "@/lib/daily-ops.functions";
import { monthDateRange } from "@/lib/daily-ops/roster-calendar-utils";
import { countsAsActiveStaff } from "@/lib/staff-status";
import { shiftsToCsv } from "@/lib/daily-ops/roster-csv";
import {
  buildRosterDatedSampleCsv,
  buildRosterWeeklySampleCsv,
  downloadCsvContent,
} from "@/lib/staff-import";
import { captureAndShareRosterImage } from "@/lib/daily-ops/share-roster-image";
import { STAFF_ROLE_LABELS, STAFF_ROLES } from "@/lib/daily-ops/constants";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ShiftRow = Record<string, unknown> & {
  starts_at: string;
  ends_at: string;
  role_label: string | null;
  status: string;
  staff: { full_name: string; employee_code: string } | null;
  location: { code: string } | null;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DailyOpsRosterPage() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const locationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const canEditStaff = usePermission("people.edit_roster");
  const canUpload = usePermission("daily_ops.roster.upload");
  const canGenerate = usePermission("daily_ops.roster.generate");
  const canShareWhatsApp = canGenerate;
  const qc = useQueryClient();
  const exportRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("calendar");
  const monthRange = useMemo(() => monthDateRange(yearMonth), [yearMonth]);

  const { data: sites } = useSites();
  const activeSites = useMemo(
    () => (sites ?? []).filter((l) => l.status === "active"),
    [sites],
  );
  const selectedSite = activeSites.find((s) => s.id === locationId);

  const { data: staff, isLoading: staffLoading } = useDailyOpsRoster(locationId);
  const { data: shifts, isLoading: shiftsLoading } = useDailyOpsShiftRoster(
    locationId,
    monthRange.from,
    monthRange.to,
  );
  const { data: uploads, isLoading: uploadsLoading } = useDailyOpsRosterUploads(locationId);

  const [editId, setEditId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");

  const staffOptions = useMemo(
    () =>
      (staff ?? [])
        .filter((s) =>
          countsAsActiveStaff(
            typeof s.status === "string" ? s.status : null,
            typeof s.employment_type === "string" ? s.employment_type : null,
          ),
        )
        .map((s) => ({
        id: String(s.id),
        label: `${s.full_name} (${s.employee_code})`,
      })),
    [staff],
  );

  const queryKeysPrefix = ["dailyOps"];

  const editMutation = useMutation({
    mutationFn: () =>
      updateStaffRoster({
        id: editId!,
        staff_role: role ? (role as (typeof STAFF_ROLES)[number]) : null,
        phone: phone || null,
      }),
    onSuccess: () => {
      toast.success(t("dailyOps.roster.saved"));
      setEditId(null);
      void qc.invalidateQueries({ queryKey: queryKeysPrefix });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!locationId) throw new Error(t("dailyOps.roster.selectLocation"));
      const csv = await file.text();
      const file_base64 = await fileToBase64(file);
      return uploadDailyOpsRosterCsv({
        location_id: locationId,
        csv,
        file_name: file.name,
        month: yearMonth || undefined,
        file_base64,
        content_type: file.type || "text/csv",
      });
    },
    onSuccess: (res) => {
      toast.success(t("dailyOps.roster.uploadSuccess", { count: res.imported }));
      invalidateRoster();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function invalidateRoster() {
    void qc.invalidateQueries({ queryKey: queryKeysPrefix });
  }

  function exportShifts() {
    const rows = (shifts ?? []) as ShiftRow[];
    if (!rows.length) {
      toast.error(t("dailyOps.roster.scheduleEmpty"));
      return;
    }
    const csv = shiftsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${selectedSite?.code ?? locationId ?? "all"}-${monthRange.from}-${monthRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareWhatsApp() {
    if (!locationId || !selectedSite) {
      toast.error(t("dailyOps.roster.selectLocation"));
      return;
    }
    const rows = (shifts ?? []) as ShiftRow[];
    if (!rows.length) {
      toast.error(t("dailyOps.roster.shareWhatsAppEmpty"));
      return;
    }
    if (!exportRef.current) return;

    setIsSharing(true);
    const toastId = toast.loading(t("dailyOps.roster.shareWhatsAppSharing"));
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const filename = `roster-${selectedSite.code}-${yearMonth}.png`;
      const shareTitle = `${t("dailyOps.roster.exportTitle")} — ${selectedSite.code}`;
      const shareText = `${shareTitle} · ${yearMonth}`;

      const result = await captureAndShareRosterImage(exportRef.current, {
        filename,
        shareTitle,
        shareText,
      });

      toast.dismiss(toastId);
      if (result === "shared") {
        toast.success(t("dailyOps.roster.shareWhatsAppShared"));
      } else {
        toast.success(t("dailyOps.roster.shareWhatsAppDownloaded"));
      }
    } catch (e) {
      toast.dismiss(toastId);
      if ((e as Error).name !== "AbortError") {
        toast.error((e as Error).message);
      }
    } finally {
      setIsSharing(false);
    }
  }

  const pageActions = (
    <div className="flex w-full min-w-0 flex-wrap gap-2">
      {canUpload ? (
        <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center sm:flex-none">
          <Button
            variant="outline"
            size="sm"
            className="min-h-10 w-full sm:w-auto"
            asChild
            disabled={!locationId || uploadMutation.isPending}
          >
            <span>
              <Upload className="me-1.5 h-3.5 w-3.5" />
              {t("dailyOps.roster.upload")}
            </span>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={!locationId || uploadMutation.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
      <div className="hidden flex-wrap gap-2 lg:flex">
        {canUpload ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/people/attendance/roster">
                <Upload className="me-1.5 h-3.5 w-3.5" />
                {t("dailyOps.roster.attendanceTallyCta")}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Download />
                  {t("dailyOps.roster.downloadSample")}
                  <ChevronDown className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => downloadCsvContent(buildRosterDatedSampleCsv(), "roster-dated-sample.csv")}
                >
                  {t("dailyOps.roster.sampleRosterDated")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => downloadCsvContent(buildRosterWeeklySampleCsv(), "roster-weekly-sample.csv")}
                >
                  {t("dailyOps.roster.sampleRosterWeekly")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        {canShareWhatsApp ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void shareWhatsApp()}
            disabled={!locationId || isSharing || shiftsLoading}
          >
            <Share2 className="me-1.5 h-3.5 w-3.5" />
            {t("dailyOps.roster.shareWhatsApp")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={exportShifts} disabled={!locationId}>
          <Download className="me-1.5 h-3.5 w-3.5" />
          {t("dailyOps.roster.export")}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/people">{t("dailyOps.roster.fullPeople")}</Link>
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10 min-w-10 px-2.5 lg:hidden"
            aria-label={t("nav.more")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          {canUpload ? (
            <>
              <DropdownMenuItem asChild>
                <Link href="/people/attendance/roster">{t("dailyOps.roster.attendanceTallyCta")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadCsvContent(buildRosterDatedSampleCsv(), "roster-dated-sample.csv")}
              >
                {t("dailyOps.roster.sampleRosterDated")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadCsvContent(buildRosterWeeklySampleCsv(), "roster-weekly-sample.csv")}
              >
                {t("dailyOps.roster.sampleRosterWeekly")}
              </DropdownMenuItem>
            </>
          ) : null}
          {canShareWhatsApp ? (
            <DropdownMenuItem
              disabled={!locationId || isSharing || shiftsLoading}
              onClick={() => void shareWhatsApp()}
            >
              {t("dailyOps.roster.shareWhatsApp")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={!locationId} onClick={exportShifts}>
            {t("dailyOps.roster.export")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/people">{t("dailyOps.roster.fullPeople")}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const uploadRows = useMemo(
    () =>
      (uploads ?? []).map((u) => ({
        period_start: u.period_start != null ? String(u.period_start) : null,
        period_end: u.period_end != null ? String(u.period_end) : null,
      })),
    [uploads],
  );

  return (
    <DailyOpsPageShell
      title={t("dailyOps.roster.title")}
      subtitle={t("dailyOps.roster.subtitle")}
      actions={pageActions}
    >
      <div className="flex flex-col gap-2 rounded-lg border border-[#E2E8F0] bg-white/60 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-[#64748B]" />
          <Label htmlFor="roster-location" className="sr-only">
            {t("dailyOps.roster.locationFilter")}
          </Label>
          <Select
            value={locationId ?? ""}
            onValueChange={(v) => setCurrentLocationId(v || null)}
          >
            <SelectTrigger id="roster-location" className="min-h-10 w-full max-w-none sm:max-w-xs">
              <SelectValue placeholder={t("dailyOps.roster.locationPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {activeSites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.code} — {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedSite ? (
          <span className="hidden text-xs text-[#64748B] sm:inline">
            {t("dailyOps.roster.weeklyPerLocation")}
          </span>
        ) : null}
      </div>

      {!locationId && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("dailyOps.roster.selectLocationHint")}
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("dailyOps.roster.tabCalendar")}</span>
              <span className="sm:hidden">{t("dailyOps.roster.tabCalendarShort", { defaultValue: "Cal" })}</span>
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5">
              <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("dailyOps.roster.tabStaff")}</span>
              <span className="sm:hidden">{t("dailyOps.roster.tabStaffShort", { defaultValue: "Staff" })}</span>
            </TabsTrigger>
            <TabsTrigger value="uploads" className="gap-1.5">
              <Upload aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("dailyOps.roster.tabUploads")}</span>
              <span className="sm:hidden">{t("dailyOps.roster.tabUploadsShort", { defaultValue: "Files" })}</span>
            </TabsTrigger>
            {canGenerate ? (
              <TabsTrigger value="generate" className="gap-1.5">
                <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{t("dailyOps.roster.tabGenerate")}</span>
                <span className="sm:hidden">{t("dailyOps.roster.tabGenerateShort", { defaultValue: "AI" })}</span>
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="calendar" className="mt-4">
          <RosterMonthCalendar
            yearMonth={yearMonth}
            onYearMonthChange={setYearMonth}
            shifts={(shifts ?? []) as ShiftRow[]}
            uploads={uploadRows}
            isLoading={!!locationId && shiftsLoading}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            language={language}
          />
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          {staffLoading ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
          ) : !staff?.length ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.roster.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dailyOps.roster.name")}</TableHead>
                    <TableHead>{t("dailyOps.roster.code")}</TableHead>
                    <TableHead>{t("dailyOps.roster.role")}</TableHead>
                    <TableHead>{t("dailyOps.roster.phone")}</TableHead>
                    <TableHead>{t("dailyOps.roster.status")}</TableHead>
                    {canEditStaff && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>{String(row.full_name)}</TableCell>
                      <TableCell className="font-mono text-xs">{String(row.employee_code)}</TableCell>
                      <TableCell>
                        {row.staff_role
                          ? STAFF_ROLE_LABELS[row.staff_role as keyof typeof STAFF_ROLE_LABELS]
                          : "—"}
                      </TableCell>
                      <TableCell>{String(row.phone ?? "—")}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canEditStaff && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(String(row.id));
                              setRole(String(row.staff_role ?? ""));
                              setPhone(String(row.phone ?? ""));
                            }}
                          >
                            {t("dailyOps.edit")}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {editId && (
            <div className="mt-4 max-w-md space-y-3 rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-medium">{t("dailyOps.roster.editTitle")}</h3>
              <div className="space-y-2">
                <Label>{t("dailyOps.roster.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {STAFF_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("dailyOps.roster.phone")}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
                  {t("dailyOps.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                  {t("dailyOps.cancel")}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="uploads" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("dailyOps.roster.uploadHint")}</p>
          <p className="text-xs text-muted-foreground">{t("dailyOps.roster.attendanceTallyHint")}</p>
          {canUpload && (
            <p className="text-xs text-muted-foreground">
              {t("dailyOps.roster.uploadMonthHint", { month: yearMonth })}
            </p>
          )}
          {uploadsLoading ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
          ) : !uploads?.length ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.roster.uploadsEmpty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dailyOps.roster.uploadedAt")}</TableHead>
                    <TableHead>{t("dailyOps.roster.fileName")}</TableHead>
                    <TableHead>{t("dailyOps.roster.period")}</TableHead>
                    <TableHead>{t("dailyOps.roster.rowsImported")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>
                        {new Date(String(row.created_at)).toLocaleString()}
                      </TableCell>
                      <TableCell>{String(row.file_name)}</TableCell>
                      <TableCell>
                        {row.period_start && row.period_end
                          ? `${row.period_start} – ${row.period_end}`
                          : "—"}
                      </TableCell>
                      <TableCell>{String(row.rows_imported)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {canGenerate && (
          <TabsContent value="generate" className="mt-4">
            <RosterGeneratePanel
              locationId={locationId}
              selectedSite={selectedSite}
              staffOptions={staffOptions}
              staffLoading={staffLoading}
              onSaved={(count) => {
                invalidateRoster();
                toast.success(t("dailyOps.roster.generateSuccess", { count }), {
                  action: {
                    label: t("dailyOps.roster.viewCalendar"),
                    onClick: () => setActiveTab("calendar"),
                  },
                });
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      {locationId && selectedSite && (
        <div
          ref={exportRef}
          aria-hidden
          className="pointer-events-none fixed -start-[9999px] top-0"
        >
          <RosterExportView
            yearMonth={yearMonth}
            locationLabel={selectedSite.name}
            locationCode={selectedSite.code}
            shifts={(shifts ?? []) as ShiftRow[]}
            uploads={uploadRows}
            language={language}
          />
        </div>
      )}
    </DailyOpsPageShell>
  );
}

export default DailyOpsRosterPage;

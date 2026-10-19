"use client";

import { FecPageHeader } from "@/components/fec";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Download, Loader2, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRegisterHrAssist } from "@/components/hr/hr-people-assist";
import {
  RosterRegisterPanel,
  type RosterDeleteAllState,
  type RosterRegisterPanelHandle,
} from "@/components/people/roster-register-panel";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSites } from "@/hooks/queries/useSites";
import { fbCafeRosterStaff, flexibleMultiSiteRosterStaff, flexibleRosterStaff } from "@/lib/attendance-hr/roster-copy";
import { locationRosterCoverage } from "@/lib/attendance-hr/roster-location-coverage";
import {
  copyRosterToNextMonth,
  downloadPreviousMonthRoster,
  listUploadedRosterAssignments,
} from "@/lib/attendance-hr/roster-register.functions";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import {
  attendanceRosterPeriod,
  formatPayrollRange,
  monthBounds,
  nextPayrollMonth,
  payrollMonthOf,
  previousPayrollMonth,
  qatarWeekBounds,
  type AttendanceRosterPeriodMode,
} from "@/lib/attendance-hr/roster-period";
import { queryKeys } from "@/lib/query-keys";
import type { PreviousMonthRosterDepartment } from "@/lib/staff-roster/previous-month-export";
import { useAppStore } from "@/stores/app-store";
import { useCanAmendShiftRoster } from "@/hooks/use-auth";

/** Coverage chips load after the month grid — keep them off the critical JS path. */
const RosterLocationCoverage = dynamic(
  () =>
    import("@/components/people/roster-location-coverage").then((mod) => ({
      default: mod.RosterLocationCoverage,
    })),
  { ssr: false },
);

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

type RosterCopyMode = "all" | "sites" | "flexible" | "fb_cafe";

type PendingRosterCopy = {
  locationIds: string[] | null;
  staffIds: string[] | null;
  department: "fb_cafe" | null;
};

function rosterCopyReplaceScope(input: PendingRosterCopy): "all" | "sites" | "people" {
  if (input.staffIds?.length || input.department) return "people";
  if (input.locationIds?.length) return "sites";
  return "all";
}

export default function StaffRosterRegisterPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const canManageRoster = useCanAmendShiftRoster();
  const canUpload = canManageRoster;
  const storeLocationId = useAppStore((s) => s.currentLocationId);

  const registerRef = useRef<RosterRegisterPanelHandle>(null);
  const [deleteAllState, setDeleteAllState] = useState<RosterDeleteAllState>({
    canDelete: canManageRoster,
    disabled: true,
    selectedCount: 0,
  });
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("month");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => payrollMonthOf(todayYmd()));
  const [copyChoiceOpen, setCopyChoiceOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<RosterCopyMode>("all");
  const [copyLocationIds, setCopyLocationIds] = useState<string[]>([]);
  const [pendingCopy, setPendingCopy] = useState<PendingRosterCopy>({
    locationIds: null,
    staffIds: null,
    department: null,
  });
  const [copyReplaceOpen, setCopyReplaceOpen] = useState(false);
  const [readyPeriod, setReadyPeriod] = useState<string | null>(null);
  const [previousBusy, setPreviousBusy] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadStep, setDownloadStep] = useState<"scope" | "location" | "department" | "staff">("scope");
  const [downloadScope, setDownloadScope] = useState<"location" | "person" | null>(null);
  const [downloadLocationId, setDownloadLocationId] = useState<string | null>(null);
  const [downloadStaffId, setDownloadStaffId] = useState("");
  const [downloadDepartment, setDownloadDepartment] = useState<PreviousMonthRosterDepartment | null>(null);
  const [copyReplaceMeta, setCopyReplaceMeta] = useState<{
    targetMonth: string;
    targetCount: number;
    sourceCount: number;
    targetRange: string;
    scope: "all" | "sites" | "people";
  } | null>(null);

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);
  const periodKey = `${period.dateFrom}|${period.dateTo}`;
  const gridReady = readyPeriod === periodKey;
  const markGridReady = useCallback(() => setReadyPeriod(periodKey), [periodKey]);
  useRegisterHrAssist({
    locationId: storeLocationId ?? null,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
  });

  const nextMonth = nextPayrollMonth(month);
  const nextBounds = monthBounds(nextMonth);
  const previousPeriod = useMemo(() => monthBounds(previousPayrollMonth(month)), [month]);
  const sites = useSites();
  const rosterCoverage = useQuery({
    queryKey: queryKeys.people.rosterRegister({
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      locationCoverage: true,
      includeCopyDepartments: true,
      coverageOnly: true,
    }),
    queryFn: () =>
      listUploadedRosterAssignments({
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        sourceUploadOnly: false,
        // Skip leave / shifts / teamStaff enrich — copy dialog only needs sites,
        // flexible flags, and department labels for F&B Cafe.
        coverageOnly: true,
        includeCopyDepartments: true,
      }),
    staleTime: STALE.people,
    enabled: copyChoiceOpen && Boolean(period.dateFrom && period.dateTo),
  });
  const copyCardSites = useMemo(() => {
    if (!rosterCoverage.data) return null;
    if (rosterCoverage.data.cardLocations != null) return rosterCoverage.data.cardLocations;
    return sites.data ?? null;
  }, [rosterCoverage.data, sites.data]);
  const uploadedLocations = useMemo(
    () =>
      locationRosterCoverage(
        copyCardSites ?? [],
        (rosterCoverage.data?.rows ?? []).map((row) => ({ locationId: row.locationId, staffId: row.staffId })),
        (site) => formatLocationRecord(site),
      ).filter((item) => item.uploaded),
    [copyCardSites, rosterCoverage.data?.rows],
  );
  const flexibleStaff = useMemo(
    () => flexibleMultiSiteRosterStaff(rosterCoverage.data?.rows ?? []),
    [rosterCoverage.data?.rows],
  );
  const flexiblePeople = useMemo(
    () => flexibleRosterStaff(rosterCoverage.data?.rows ?? []),
    [rosterCoverage.data?.rows],
  );
  const fbCafePeople = useMemo(
    () => fbCafeRosterStaff(rosterCoverage.data?.rows ?? []),
    [rosterCoverage.data?.rows],
  );
  const flexibleNamesByLocation = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const person of flexibleStaff) {
      const name = person.staffName || person.staffId;
      for (const locationId of person.locationIds) {
        const list = map.get(locationId) ?? [];
        list.push(name);
        map.set(locationId, list);
      }
    }
    return map;
  }, [flexibleStaff]);
  const flexibleNames = flexibleStaff.map((person) => person.staffName || person.staffId).join(", ");
  const flexibleOptionNames = flexiblePeople.map((person) => person.staffName || person.staffId).join(", ");
  const fbCafeNames = fbCafePeople.map((person) => person.staffName || person.staffId).join(", ");

  const previousCoverage = useQuery({
    queryKey: queryKeys.people.rosterRegister({
      dateFrom: previousPeriod.dateFrom,
      dateTo: previousPeriod.dateTo,
      locationCoverage: true,
      previousDownload: true,
    }),
    queryFn: () =>
      listUploadedRosterAssignments({
        dateFrom: previousPeriod.dateFrom,
        dateTo: previousPeriod.dateTo,
        sourceUploadOnly: false,
        coverageOnly: true,
      }),
    staleTime: STALE.people,
    enabled: downloadOpen && Boolean(previousPeriod.dateFrom && previousPeriod.dateTo),
  });
  const downloadCardSites = useMemo(() => {
    if (!previousCoverage.data) return null;
    if (previousCoverage.data.cardLocations != null) return previousCoverage.data.cardLocations;
    return sites.data ?? null;
  }, [previousCoverage.data, sites.data]);
  const downloadLocations = useMemo(
    () =>
      locationRosterCoverage(
        downloadCardSites ?? [],
        (previousCoverage.data?.rows ?? []).map((row) => ({ locationId: row.locationId, staffId: row.staffId })),
        (site) => formatLocationRecord(site),
      ),
    [downloadCardSites, previousCoverage.data?.rows],
  );
  const downloadLocation = downloadLocations.find((site) => site.id === downloadLocationId) ?? null;
  const downloadLocationsLoading =
    previousCoverage.isLoading || (previousCoverage.data?.cardLocations == null && sites.isLoading);
  const downloadLocationsFailed =
    previousCoverage.isError || (previousCoverage.data != null && previousCoverage.data.cardLocations == null && sites.isError);
  const downloadStaffOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of previousCoverage.data?.rows ?? []) {
      if (!row.staffId || byId.has(row.staffId)) continue;
      byId.set(row.staffId, row.staffName || row.employeeCode || row.staffId);
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [previousCoverage.data?.rows]);
  const downloadStaffLoading = previousCoverage.isLoading;
  const downloadStaffFailed = previousCoverage.isError;

  const openDownloadChoice = () => {
    setDownloadStep("scope");
    setDownloadScope(null);
    setDownloadLocationId(null);
    setDownloadStaffId("");
    setDownloadDepartment(null);
    setDownloadOpen(true);
  };

  const downloadPrevious = async (input: {
    locationId?: string;
    department?: PreviousMonthRosterDepartment;
    staffId?: string;
  }): Promise<boolean> => {
    try {
      setPreviousBusy(true);
      const file = await downloadPreviousMonthRoster({ month, ...input });
      const bin = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: file.mime });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      const range = formatPayrollRange(file.dateFrom, file.dateTo, i18n.language);
      if (file.empty) {
        toast.message(t("people.roster.downloadPreviousMonthEmpty", { range }));
      } else {
        toast.success(t("people.roster.downloadPreviousMonthReady", { range, count: file.rowCount }));
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("people.roster.previewFailed"));
      return false;
    } finally {
      setPreviousBusy(false);
    }
  };

  const confirmDownload = async () => {
    if (downloadScope === "person") {
      if (!downloadStaffId) return;
      const saved = await downloadPrevious({ staffId: downloadStaffId });
      if (saved) setDownloadOpen(false);
      return;
    }
    if (!downloadLocationId || !downloadDepartment) return;
    const saved = await downloadPrevious({ locationId: downloadLocationId, department: downloadDepartment });
    if (saved) setDownloadOpen(false);
  };

  const downloadScopeChoices: {
    value: "location" | "person";
    label: string;
    hint: string;
  }[] = [
    {
      value: "location",
      label: t("people.roster.downloadPreviousMonthScopeLocation"),
      hint: t("people.roster.downloadPreviousMonthScopeLocationHint"),
    },
    {
      value: "person",
      label: t("people.roster.downloadPreviousMonthScopePerson"),
      hint: t("people.roster.downloadPreviousMonthScopePersonHint"),
    },
  ];

  const downloadDialogTitle =
    downloadStep === "scope"
      ? t("people.roster.downloadPreviousMonthChooseScope")
      : downloadStep === "location"
        ? t("people.roster.downloadPreviousMonthChooseLocation")
        : downloadStep === "staff"
          ? t("people.roster.downloadPreviousMonthChooseStaff")
          : t("people.roster.downloadPreviousMonthChooseDepartment");

  const downloadDialogDescription =
    downloadStep === "scope"
      ? t("people.roster.downloadPreviousMonthChooseScopeBody", {
          range: formatPayrollRange(previousPeriod.dateFrom, previousPeriod.dateTo, i18n.language),
        })
      : downloadStep === "location"
        ? t("people.roster.downloadPreviousMonthChooseLocationBody", {
            range: formatPayrollRange(previousPeriod.dateFrom, previousPeriod.dateTo, i18n.language),
          })
        : downloadStep === "staff"
          ? t("people.roster.downloadPreviousMonthChooseStaffBody", {
              range: formatPayrollRange(previousPeriod.dateFrom, previousPeriod.dateTo, i18n.language),
            })
          : t("people.roster.downloadPreviousMonthChooseDepartmentBody", {
              location: downloadLocation?.label ?? "",
            });

  const downloadBackStep = () => {
    if (downloadStep === "department" || downloadStep === "staff") {
      setDownloadStep(downloadScope === "person" ? "scope" : "location");
      if (downloadScope === "person") setDownloadStaffId("");
      setDownloadDepartment(null);
      return;
    }
    if (downloadStep === "location") {
      setDownloadStep("scope");
      setDownloadLocationId(null);
      setDownloadScope(null);
      return;
    }
    setDownloadOpen(false);
  };

  const downloadContinue = () => {
    if (downloadStep === "scope") {
      if (downloadScope === "person") setDownloadStep("staff");
      else if (downloadScope === "location") setDownloadStep("location");
      return;
    }
    if (downloadStep === "location" && downloadLocationId) setDownloadStep("department");
  };

  const applyCopyResult = (
    result: Awaited<ReturnType<typeof copyRosterToNextMonth>>,
    filter: PendingRosterCopy,
  ) => {
    if (result.status === "empty") {
      toast.error(t("people.roster.copyNextMonthEmpty"));
      return;
    }
    if (result.status === "needs_replace") {
      setCopyReplaceMeta({
        targetMonth: result.targetMonth,
        targetCount: result.targetCount,
        sourceCount: result.sourceCount,
        targetRange: formatPayrollRange(result.target.dateFrom, result.target.dateTo, i18n.language),
        scope: rosterCopyReplaceScope(filter),
      });
      setCopyReplaceOpen(true);
      return;
    }
    toast.success(
      t("people.roster.copyNextMonthDone", {
        count: result.copied,
        month: result.targetMonth,
      }),
    );
    setCopyReplaceOpen(false);
    setCopyReplaceMeta(null);
    setMonth(result.targetMonth);
    void qc.invalidateQueries({ queryKey: queryKeys.people.all });
  };

  const copyMut = useMutation({
    mutationFn: (input: PendingRosterCopy & { replace: boolean }) =>
      copyRosterToNextMonth({
        month,
        replace: input.replace,
        ...(input.locationIds?.length ? { locationIds: input.locationIds } : {}),
        ...(input.staffIds?.length ? { staffIds: input.staffIds } : {}),
        ...(input.department ? { department: input.department } : {}),
      }),
    onSuccess: (result, variables) => {
      const filter = {
        locationIds: variables.locationIds,
        staffIds: variables.staffIds,
        department: variables.department,
      };
      setPendingCopy(filter);
      applyCopyResult(result, filter);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCopyChoice = () => {
    setCopyMode("all");
    setCopyLocationIds([]);
    setCopyChoiceOpen(true);
  };

  const toggleCopyLocation = (id: string, on: boolean) => {
    setCopyLocationIds((current) =>
      on ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id),
    );
  };

  const confirmCopyChoice = () => {
    let filter: PendingRosterCopy = { locationIds: null, staffIds: null, department: null };
    if (copyMode === "sites") {
      const selected = copyLocationIds.filter((id) => uploadedLocations.some((site) => site.id === id));
      if (selected.length === 0) return;
      filter = { locationIds: selected, staffIds: null, department: null };
    } else if (copyMode === "flexible") {
      if (flexiblePeople.length === 0) return;
      filter = { locationIds: null, staffIds: flexiblePeople.map((person) => person.staffId), department: null };
    } else if (copyMode === "fb_cafe") {
      if (fbCafePeople.length === 0) return;
      filter = { locationIds: null, staffIds: null, department: "fb_cafe" };
    }
    setCopyChoiceOpen(false);
    setPendingCopy(filter);
    copyMut.mutate({ replace: false, ...filter });
  };

  const sitesLoading =
    rosterCoverage.isLoading || (rosterCoverage.data?.cardLocations == null && sites.isLoading);
  const sitesFailed =
    rosterCoverage.isError || (rosterCoverage.data != null && rosterCoverage.data.cardLocations == null && sites.isError);
  const rosterLoading = rosterCoverage.isLoading;
  const rosterFailed = rosterCoverage.isError;
  const flexibleEmpty = !rosterLoading && !rosterFailed && flexiblePeople.length === 0;
  const fbCafeEmpty = !rosterLoading && !rosterFailed && fbCafePeople.length === 0;
  const siteChoiceBlocked =
    copyMode === "sites" && (sitesLoading || sitesFailed || uploadedLocations.length === 0 || copyLocationIds.length === 0);
  const flexibleChoiceBlocked = copyMode === "flexible" && (rosterLoading || rosterFailed || flexiblePeople.length === 0);
  const fbCafeChoiceBlocked = copyMode === "fb_cafe" && (rosterLoading || rosterFailed || fbCafePeople.length === 0);

  const copyDisabled = periodMode !== "month" || copyMut.isPending || !/^\d{4}-\d{2}$/.test(month);
  const downloadDepartmentChoices: {
    value: PreviousMonthRosterDepartment;
    label: string;
    hint: string;
  }[] = [
    {
      value: "operations",
      label: t("people.roster.downloadPreviousMonthOperations"),
      hint: t("people.roster.downloadPreviousMonthOperationsHint"),
    },
    {
      value: "fb",
      label: t("people.roster.downloadPreviousMonthFb"),
      hint: t("people.roster.downloadPreviousMonthFbHint"),
    },
    {
      value: "both",
      label: t("people.roster.downloadPreviousMonthBoth"),
      hint: t("people.roster.downloadPreviousMonthBothHint"),
    },
  ];

  const downloadPrevDisabled = previousBusy || !/^\d{4}-\d{2}$/.test(month);
  const deleteAllLabel =
    deleteAllState.selectedCount > 0
      ? t("people.roster.registerDeleteSelected", { count: deleteAllState.selectedCount })
      : t("people.roster.registerDeleteAll");

  const desktopActions = (
    <>
      {periodMode === "month" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={downloadPrevDisabled}
          title={t("people.roster.downloadPreviousMonthHint", {
            range: formatPayrollRange(previousPeriod.dateFrom, previousPeriod.dateTo, i18n.language),
          })}
          onClick={openDownloadChoice}
        >
          {previousBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("people.roster.downloadPreviousMonth")}
        </Button>
      ) : null}
      {canManageRoster && periodMode === "month" ? (
        <Button type="button" size="sm" variant="outline" disabled={copyDisabled} onClick={openCopyChoice}>
          {copyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          {t("people.roster.copyNextMonth")}
        </Button>
      ) : null}
      {canManageRoster ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={deleteAllState.disabled}
          onClick={() => registerRef.current?.openDeleteAll()}
        >
          <Trash2 className="h-4 w-4" />
          {deleteAllLabel}
        </Button>
      ) : null}
      {canUpload ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/people/import">
            <Upload className="h-4 w-4" />
            {t("nav.importRoster")}
          </Link>
        </Button>
      ) : null}
    </>
  );

  const mobilePrimary = canUpload ? (
    <Button asChild variant="outline" size="sm" className="min-h-10 flex-1">
      <Link href="/people/import">
        <Upload className="h-4 w-4" />
        {t("nav.importRoster")}
      </Link>
    </Button>
  ) : periodMode === "month" ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-10 flex-1"
      disabled={downloadPrevDisabled}
      onClick={openDownloadChoice}
    >
      {previousBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {t("people.roster.downloadPreviousMonth")}
    </Button>
  ) : null;

  const mobileOverflow = canManageRoster ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="min-h-10 min-w-10 px-2.5" aria-label={t("nav.more")}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {periodMode === "month" && canUpload ? (
          <DropdownMenuItem disabled={downloadPrevDisabled} onSelect={() => openDownloadChoice()}>
            <Download className="h-4 w-4" />
            {t("people.roster.downloadPreviousMonth")}
          </DropdownMenuItem>
        ) : null}
        {canManageRoster && periodMode === "month" ? (
          <DropdownMenuItem disabled={copyDisabled} onSelect={() => openCopyChoice()}>
            <Copy className="h-4 w-4" />
            {t("people.roster.copyNextMonth")}
          </DropdownMenuItem>
        ) : null}
        {canManageRoster ? (
          <DropdownMenuItem
            disabled={deleteAllState.disabled}
            className="text-destructive focus:text-destructive"
            onSelect={() => registerRef.current?.openDeleteAll()}
          >
            <Trash2 className="h-4 w-4" />
            {deleteAllLabel}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      <FecPageHeader
        icon={CalendarDays}
        kicker={t("people.roster.viewKicker")}
        title={t("people.roster.viewTitle")}
        subtitle={t("people.roster.viewSubtitle")}
        // Full strip only from lg up (PageHeader hides it under lg). Compact
        // primary + ⋯ menu cover phone/tablet while bottom nav is still visible.
        actions={desktopActions}
        primaryAction={mobilePrimary}
        overflow={mobileOverflow}
      />

      <div className="surface-card space-y-3 p-4 md:space-y-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="roster-view-period">{t("people.roster.stepPeriod")}</Label>
            <SearchableSelect
              value={periodMode}
              onValueChange={(value) => setPeriodMode((value || "month") as AttendanceRosterPeriodMode)}
              options={[
                { value: "month", label: t("people.roster.periodMonth") },
                { value: "week", label: t("people.roster.periodWeek") },
              ]}
            />
            <p className="hidden text-xs text-muted-foreground sm:block">{t("people.roster.periodHelp")}</p>
          </div>
          {periodMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="roster-view-week">{t("people.roster.weekStart")}</Label>
              <Input
                id="roster-view-week"
                type="date"
                className="min-h-10"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="roster-view-month">{t("people.roster.month")}</Label>
              <Input
                id="roster-view-month"
                type="month"
                className="min-h-10"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label className="hidden sm:block">{t("people.roster.viewRangeLabel")}</Label>
            <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 text-sm leading-snug">
              <span className="sm:hidden text-muted-foreground">{t("people.roster.viewRangeLabel")}: </span>
              {formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <RosterLocationCoverage dateFrom={period.dateFrom} dateTo={period.dateTo} enabled={gridReady} />
      </div>

      <RosterRegisterPanel
        // Remount when the branch switcher changes so the Location filter
        // re-seeds from it (avoids All-locations queries while the top bar shows KDS-CC).
        key={storeLocationId ?? "all-locations"}
        ref={registerRef}
        dateFrom={period.dateFrom}
        dateTo={period.dateTo}
        onGridFetched={markGridReady}
        defaultLocationId={storeLocationId}
        sourceUploadOnly={false}
        showSourceFilter
        hideHeader
        maxHeight={640}
        onDeleteAllStateChange={setDeleteAllState}
      />

      <Dialog
        open={downloadOpen}
        onOpenChange={(open) => {
          if (!open && !previousBusy) setDownloadOpen(false);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{downloadDialogTitle}</DialogTitle>
            <DialogDescription>{downloadDialogDescription}</DialogDescription>
          </DialogHeader>
          {downloadStep === "scope" ? (
            <div className="space-y-2">
              {downloadScopeChoices.map((choice) => {
                const checked = downloadScope === choice.value;
                return (
                  <label
                    key={choice.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2",
                      checked ? "border-primary" : "border-border/70",
                    )}
                  >
                    <input
                      type="radio"
                      name="roster-download-scope"
                      className="mt-1"
                      checked={checked}
                      onChange={() => {
                        setDownloadScope(choice.value);
                        setDownloadLocationId(null);
                        setDownloadStaffId("");
                        setDownloadDepartment(null);
                      }}
                    />
                    <span>
                      <span className="block text-sm font-medium">{choice.label}</span>
                      <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : downloadStep === "location" ? (
            downloadLocationsLoading ? (
              <p className="text-sm text-muted-foreground">{t("people.roster.locationCoverageLoading")}</p>
            ) : downloadLocationsFailed ? (
              <p className="text-sm text-destructive">{t("people.roster.locationCoverageLoadFailed")}</p>
            ) : downloadLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("people.roster.downloadPreviousMonthNoLocations")}</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {downloadLocations.map((site) => {
                  const checked = downloadLocationId === site.id;
                  const status = site.uploaded
                    ? t("people.roster.locationCoverageUploaded")
                    : t("people.roster.locationCoverageMissingStatus");
                  return (
                    <li key={site.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2",
                          checked ? "border-primary" : "border-border/70",
                        )}
                      >
                        <input
                          type="radio"
                          name="roster-download-location"
                          className="mt-1"
                          checked={checked}
                          onChange={() => {
                            setDownloadLocationId(site.id);
                            setDownloadDepartment(null);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium" title={site.label}>
                            {site.label}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant={site.uploaded ? "success" : "warning"}>{status}</Badge>
                            {site.uploaded ? (
                              <span className="text-xs text-muted-foreground">
                                {t("people.roster.registerCount", { count: site.rowCount })}
                                <span aria-hidden="true"> · </span>
                                {t("people.roster.registerStaffCount", { count: site.staffCount })}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )
          ) : downloadStep === "staff" ? (
            downloadStaffLoading ? (
              <p className="text-sm text-muted-foreground">{t("people.roster.locationCoverageLoading")}</p>
            ) : downloadStaffFailed ? (
              <p className="text-sm text-destructive">{t("people.roster.locationCoverageLoadFailed")}</p>
            ) : downloadStaffOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("people.roster.downloadPreviousMonthNoStaff")}</p>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("people.roster.downloadPreviousMonthChooseStaffLabel")}</Label>
                <SearchableSelect
                  value={downloadStaffId}
                  onValueChange={setDownloadStaffId}
                  emptyOption={{ value: "", label: t("people.roster.registerPickStaff") }}
                  options={downloadStaffOptions}
                />
              </div>
            )
          ) : (
            <div className="space-y-2">
              {downloadDepartmentChoices.map((choice) => {
                const checked = downloadDepartment === choice.value;
                return (
                  <label
                    key={choice.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2",
                      checked ? "border-primary" : "border-border/70",
                    )}
                  >
                    <input
                      type="radio"
                      name="roster-download-department"
                      className="mt-1"
                      checked={checked}
                      onChange={() => setDownloadDepartment(choice.value)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{choice.label}</span>
                      <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            {downloadStep === "scope" ? (
              <Button type="button" variant="outline" onClick={() => setDownloadOpen(false)} disabled={previousBusy}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={previousBusy} onClick={downloadBackStep}>
                {t("people.roster.downloadPreviousMonthBack")}
              </Button>
            )}
            {downloadStep === "department" || downloadStep === "staff" ? (
              <Button
                type="button"
                disabled={
                  previousBusy ||
                  (downloadStep === "department" ? !downloadDepartment : !downloadStaffId || downloadStaffLoading || downloadStaffFailed)
                }
                onClick={() => void confirmDownload()}
              >
                {previousBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("people.roster.downloadPreviousMonthConfirm")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  previousBusy ||
                  (downloadStep === "scope"
                    ? !downloadScope
                    : downloadLocationsLoading || downloadLocationsFailed || !downloadLocationId)
                }
                onClick={downloadContinue}
              >
                {t("people.roster.downloadPreviousMonthContinue")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={copyChoiceOpen}
        onOpenChange={(open) => {
          if (!open && !copyMut.isPending) setCopyChoiceOpen(false);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("people.roster.copyNextMonthChooseTitle")}</DialogTitle>
            <DialogDescription>
              {t("people.roster.copyNextMonthChooseBody", {
                range: formatPayrollRange(nextBounds.dateFrom, nextBounds.dateTo, i18n.language),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2",
                copyMode === "all" ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={copyMode === "all"}
                onChange={() => setCopyMode("all")}
              />
              <span>
                <span className="block text-sm font-medium">{t("people.roster.copyNextMonthAllLocations")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("people.roster.copyNextMonthAllLocationsHint")}
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2",
                copyMode === "sites" ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={copyMode === "sites"}
                onChange={() => setCopyMode("sites")}
              />
              <span>
                <span className="block text-sm font-medium">{t("people.roster.copyNextMonthChooseSites")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("people.roster.copyNextMonthChooseSitesHint")}
                </span>
              </span>
            </label>
            {copyMode === "sites" ? (
              sitesLoading ? (
                <p className="text-sm text-muted-foreground">{t("people.roster.copyNextMonthSitesLoading")}</p>
              ) : sitesFailed ? (
                <p className="text-sm text-destructive">{t("people.roster.locationCoverageLoadFailed")}</p>
              ) : uploadedLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("people.roster.copyNextMonthNoSites")}</p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {uploadedLocations.map((site) => {
                    const names = flexibleNamesByLocation.get(site.id) ?? [];
                    const checked = copyLocationIds.includes(site.id);
                    return (
                      <li
                        key={site.id}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border px-3 py-2",
                          checked ? "border-primary" : "border-border/70",
                        )}
                      >
                        <Checkbox
                          id={`roster-copy-site-${site.id}`}
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(value) => toggleCopyLocation(site.id, value === true)}
                        />
                        <Label htmlFor={`roster-copy-site-${site.id}`} className="min-w-0 cursor-pointer font-normal leading-snug">
                          <span className="block truncate text-sm font-medium" title={site.label}>
                            {site.label}
                          </span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t("people.roster.registerCount", { count: site.rowCount })}
                            <span aria-hidden="true"> · </span>
                            {t("people.roster.registerStaffCount", { count: site.staffCount })}
                          </span>
                          {names.length ? (
                            <span className="mt-1 block text-xs font-normal text-[color:var(--color-warning)]">
                              {t("people.roster.copyNextMonthFlexibleOnSite", { names: names.join(", ") })}
                            </span>
                          ) : null}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2",
                flexibleEmpty || rosterFailed ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                copyMode === "flexible" ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={copyMode === "flexible"}
                disabled={rosterLoading || rosterFailed || flexibleEmpty}
                onChange={() => setCopyMode("flexible")}
              />
              <span>
                <span className="block text-sm font-medium">{t("people.staff.flexibleHours")}</span>
                <span className="block text-xs text-muted-foreground">
                  {rosterLoading
                    ? t("common.loading")
                    : rosterFailed
                      ? t("people.roster.locationCoverageLoadFailed")
                      : flexibleEmpty
                        ? t("people.roster.copyNextMonthNone")
                        : t("people.roster.copyNextMonthFlexibleHint", { names: flexibleOptionNames })}
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2",
                fbCafeEmpty || rosterFailed ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                copyMode === "fb_cafe" ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={copyMode === "fb_cafe"}
                disabled={rosterLoading || rosterFailed || fbCafeEmpty}
                onChange={() => setCopyMode("fb_cafe")}
              />
              <span>
                <span className="block text-sm font-medium">{t("common.orgDepartment.fb_cafe")}</span>
                <span className="block text-xs text-muted-foreground">
                  {rosterLoading
                    ? t("common.loading")
                    : rosterFailed
                      ? t("people.roster.locationCoverageLoadFailed")
                      : fbCafeEmpty
                        ? t("people.roster.copyNextMonthNone")
                        : t("people.roster.copyNextMonthFbCafeHint", { names: fbCafeNames })}
                </span>
              </span>
            </label>
            {flexibleNames ? (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Badge variant="warning">{t("people.staff.flexibleHours")}</Badge>
                <span>{t("people.roster.copyNextMonthFlexibleNote", { names: flexibleNames })}</span>
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCopyChoiceOpen(false)} disabled={copyMut.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={confirmCopyChoice}
              disabled={copyMut.isPending || siteChoiceBlocked || flexibleChoiceBlocked || fbCafeChoiceBlocked}
            >
              {copyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("people.roster.copyNextMonthConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={copyReplaceOpen}
        onOpenChange={(open) => {
          if (!open && !copyMut.isPending) {
            setCopyReplaceOpen(false);
            setCopyReplaceMeta(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.roster.copyNextMonthReplaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                copyReplaceMeta?.scope === "sites"
                  ? "people.roster.copyNextMonthReplaceBodySites"
                  : copyReplaceMeta?.scope === "people"
                    ? "people.roster.copyNextMonthReplaceBodyPeople"
                    : "people.roster.copyNextMonthReplaceBody",
                {
                  count: copyReplaceMeta?.targetCount ?? 0,
                  range: copyReplaceMeta?.targetRange ?? nextMonth,
                  sourceCount: copyReplaceMeta?.sourceCount ?? 0,
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copyMut.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={copyMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                copyMut.mutate({ replace: true, ...pendingCopy });
              }}
            >
              {copyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("people.roster.copyNextMonthReplace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

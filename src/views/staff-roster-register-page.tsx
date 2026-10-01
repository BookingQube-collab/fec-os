"use client";

import { FecPageHeader } from "@/components/fec";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Download, Loader2, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RosterLocationCoverage } from "@/components/people/roster-location-coverage";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSites } from "@/hooks/queries/useSites";
import { flexibleMultiSiteRosterStaff } from "@/lib/attendance-hr/roster-copy";
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
import { useAppStore } from "@/stores/app-store";
import { usePermission } from "@/hooks/use-permission";

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

export default function StaffRosterRegisterPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const canImportRoster = usePermission("people.import_roster");
  const canEditRoster = usePermission("people.edit_roster");
  const canUploadRoster = usePermission("daily_ops.roster.upload");
  const canImport = canImportRoster || canEditRoster || canUploadRoster;
  const storeLocationId = useAppStore((s) => s.currentLocationId);

  const registerRef = useRef<RosterRegisterPanelHandle>(null);
  const [deleteAllState, setDeleteAllState] = useState<RosterDeleteAllState>({
    canDelete: canImport,
    disabled: true,
    selectedCount: 0,
  });
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("month");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => payrollMonthOf(todayYmd()));
  const [copyChoiceOpen, setCopyChoiceOpen] = useState(false);
  const [copyAllLocations, setCopyAllLocations] = useState(true);
  const [copyLocationIds, setCopyLocationIds] = useState<string[]>([]);
  const [copyLocationFilter, setCopyLocationFilter] = useState<string[] | null>(null);
  const [copyReplaceOpen, setCopyReplaceOpen] = useState(false);
  const [previousBusy, setPreviousBusy] = useState(false);
  const [copyReplaceMeta, setCopyReplaceMeta] = useState<{
    targetMonth: string;
    targetCount: number;
    sourceCount: number;
    targetRange: string;
    siteWise: boolean;
  } | null>(null);

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);

  const nextMonth = nextPayrollMonth(month);
  const nextBounds = monthBounds(nextMonth);
  const previousPeriod = useMemo(() => monthBounds(previousPayrollMonth(month)), [month]);
  const sites = useSites();
  const rosterCoverage = useQuery({
    queryKey: queryKeys.people.rosterRegister({
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      locationCoverage: true,
    }),
    queryFn: () =>
      listUploadedRosterAssignments({
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        sourceUploadOnly: false,
      }),
    staleTime: STALE.people,
    enabled: Boolean(period.dateFrom && period.dateTo),
  });
  const uploadedLocations = useMemo(
    () =>
      locationRosterCoverage(
        sites.data ?? [],
        (rosterCoverage.data?.rows ?? []).map((row) => ({ locationId: row.locationId, staffId: row.staffId })),
        (site) => formatLocationRecord(site),
      ).filter((item) => item.uploaded),
    [sites.data, rosterCoverage.data?.rows],
  );
  const flexibleStaff = useMemo(
    () => flexibleMultiSiteRosterStaff(rosterCoverage.data?.rows ?? []),
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

  const downloadPrevious = async () => {
    try {
      setPreviousBusy(true);
      const file = await downloadPreviousMonthRoster({ month });
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("people.roster.previewFailed"));
    } finally {
      setPreviousBusy(false);
    }
  };

  const applyCopyResult = (
    result: Awaited<ReturnType<typeof copyRosterToNextMonth>>,
    locationIds: string[] | null,
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
        siteWise: Boolean(locationIds?.length),
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
    mutationFn: (input: { replace: boolean; locationIds: string[] | null }) =>
      copyRosterToNextMonth({
        month,
        replace: input.replace,
        ...(input.locationIds?.length ? { locationIds: input.locationIds } : {}),
      }),
    onSuccess: (result, variables) => {
      setCopyLocationFilter(variables.locationIds);
      applyCopyResult(result, variables.locationIds);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCopyChoice = () => {
    setCopyAllLocations(true);
    setCopyLocationIds([]);
    setCopyChoiceOpen(true);
  };

  const toggleCopyLocation = (id: string, on: boolean) => {
    setCopyLocationIds((current) =>
      on ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id),
    );
  };

  const confirmCopyChoice = () => {
    const selected = copyLocationIds.filter((id) => uploadedLocations.some((site) => site.id === id));
    if (!copyAllLocations && selected.length === 0) return;
    const locationIds = copyAllLocations ? null : selected;
    setCopyChoiceOpen(false);
    setCopyLocationFilter(locationIds);
    copyMut.mutate({ replace: false, locationIds });
  };

  const sitesLoading = rosterCoverage.isLoading || sites.isLoading;
  const sitesFailed = rosterCoverage.isError || sites.isError;
  const siteChoiceBlocked =
    !copyAllLocations && (sitesLoading || sitesFailed || uploadedLocations.length === 0 || copyLocationIds.length === 0);

  const copyDisabled = periodMode !== "month" || copyMut.isPending || !/^\d{4}-\d{2}$/.test(month);

  return (
    <div className="space-y-6">
      <FecPageHeader
        icon={CalendarDays}
        kicker={t("people.roster.viewKicker")}
        title={t("people.roster.viewTitle")}
        subtitle={t("people.roster.viewSubtitle")}
        actions={
          <>
            {periodMode === "month" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={previousBusy || !/^\d{4}-\d{2}$/.test(month)}
                title={t("people.roster.downloadPreviousMonthHint", {
                  range: formatPayrollRange(previousPeriod.dateFrom, previousPeriod.dateTo, i18n.language),
                })}
                onClick={() => void downloadPrevious()}
              >
                {previousBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("people.roster.downloadPreviousMonth")}
              </Button>
            ) : null}
            {canImport && periodMode === "month" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={copyDisabled}
                onClick={openCopyChoice}
              >
                {copyMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {t("people.roster.copyNextMonth")}
              </Button>
            ) : null}
            {canImport ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleteAllState.disabled}
                onClick={() => registerRef.current?.openDeleteAll()}
              >
                <Trash2 className="h-4 w-4" />
                {deleteAllState.selectedCount > 0
                  ? t("people.roster.registerDeleteSelected", { count: deleteAllState.selectedCount })
                  : t("people.roster.registerDeleteAll")}
              </Button>
            ) : null}
            {canImport ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/people/import">
                  <Upload className="h-4 w-4" />
                  {t("nav.importRoster")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="surface-card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className="text-xs text-muted-foreground">{t("people.roster.periodHelp")}</p>
          </div>
          {periodMode === "week" ? (
            <div className="space-y-1.5">
              <Label htmlFor="roster-view-week">{t("people.roster.weekStart")}</Label>
              <Input
                id="roster-view-week"
                type="date"
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
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("people.roster.viewRangeLabel")}</Label>
            <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              {formatPayrollRange(period.dateFrom, period.dateTo, i18n.language)}
            </p>
          </div>
        </div>
      </div>

      <RosterLocationCoverage dateFrom={period.dateFrom} dateTo={period.dateTo} />

      <RosterRegisterPanel
        ref={registerRef}
        dateFrom={period.dateFrom}
        dateTo={period.dateTo}
        defaultLocationId={storeLocationId}
        sourceUploadOnly={false}
        showSourceFilter
        hideHeader
        maxHeight={640}
        onDeleteAllStateChange={setDeleteAllState}
      />

      <Dialog
        open={copyChoiceOpen}
        onOpenChange={(open) => {
          if (!open && !copyMut.isPending) setCopyChoiceOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
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
                copyAllLocations ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={copyAllLocations}
                onChange={() => setCopyAllLocations(true)}
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
                !copyAllLocations ? "border-primary" : "border-border/70",
              )}
            >
              <input
                type="radio"
                name="roster-copy-scope"
                className="mt-1"
                checked={!copyAllLocations}
                onChange={() => setCopyAllLocations(false)}
              />
              <span>
                <span className="block text-sm font-medium">{t("people.roster.copyNextMonthChooseSites")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("people.roster.copyNextMonthChooseSitesHint")}
                </span>
              </span>
            </label>
            {!copyAllLocations ? (
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
            <Button type="button" onClick={confirmCopyChoice} disabled={copyMut.isPending || siteChoiceBlocked}>
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
                copyReplaceMeta?.siteWise
                  ? "people.roster.copyNextMonthReplaceBodySites"
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
                copyMut.mutate({ replace: true, locationIds: copyLocationFilter });
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

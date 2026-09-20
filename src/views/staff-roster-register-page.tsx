"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Loader2, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { copyRosterToNextMonth } from "@/lib/attendance-hr/roster-register.functions";
import {
  attendanceRosterPeriod,
  formatPayrollRange,
  nextPayrollMonth,
  payrollMonthOf,
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
  });
  const [periodMode, setPeriodMode] = useState<AttendanceRosterPeriodMode>("month");
  const [weekStart, setWeekStart] = useState(() => qatarWeekBounds(todayYmd()).dateFrom);
  const [month, setMonth] = useState(() => payrollMonthOf(todayYmd()));
  const [copyReplaceOpen, setCopyReplaceOpen] = useState(false);
  const [copyReplaceMeta, setCopyReplaceMeta] = useState<{
    targetMonth: string;
    targetCount: number;
    sourceCount: number;
    targetRange: string;
  } | null>(null);

  const period = useMemo(() => {
    try {
      return attendanceRosterPeriod({ mode: periodMode, weekStart, month });
    } catch {
      return { dateFrom: weekStart, dateTo: weekStart };
    }
  }, [periodMode, weekStart, month]);

  const nextMonth = nextPayrollMonth(month);

  const applyCopyResult = (result: Awaited<ReturnType<typeof copyRosterToNextMonth>>) => {
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
    mutationFn: (replace: boolean) => copyRosterToNextMonth({ month, replace }),
    onSuccess: applyCopyResult,
    onError: (e: Error) => toast.error(e.message),
  });

  const copyDisabled = periodMode !== "month" || copyMut.isPending || !/^\d{4}-\d{2}$/.test(month);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        kicker={t("people.roster.viewKicker")}
        title={t("people.roster.viewTitle")}
        subtitle={t("people.roster.viewSubtitle")}
        actions={
          <>
            {canImport && periodMode === "month" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={copyDisabled}
                onClick={() => copyMut.mutate(false)}
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
                {t("people.roster.registerDeleteAll")}
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
              {t("people.roster.copyNextMonthReplaceBody", {
                count: copyReplaceMeta?.targetCount ?? 0,
                range: copyReplaceMeta?.targetRange ?? nextMonth,
                sourceCount: copyReplaceMeta?.sourceCount ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copyMut.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={copyMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                copyMut.mutate(true);
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

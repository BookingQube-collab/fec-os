"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ShiftRangeEditor } from "@/components/people/shift-range-editor";
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
import { applyRosterStaffPattern, type RosterRegisterRow } from "@/lib/attendance-hr/roster-register.functions";
import {
  clampRosterPatternRange,
  planRosterStaffPattern,
  type RosterMatrixStaff,
} from "@/lib/attendance-hr/roster-register-scope";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";

const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

export type RosterBulkPatternDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: RosterMatrixStaff | null;
  periodFrom: string;
  periodTo: string;
  defaultLocationId: string;
  locationOptions: Array<{ value: string; label: string; keywords?: string }>;
  existingRows: RosterRegisterRow[];
  onApplied: () => void;
};

function inferDefaultOffWeekdays(rows: RosterRegisterRow[]): number[] {
  const offCounts = new Map<number, number>();
  for (const row of rows) {
    if (!row.isWeekOff || row.leaveType) continue;
    const day = new Date(`${row.workDate.slice(0, 10)}T12:00:00.000Z`).getUTCDay();
    offCounts.set(day, (offCounts.get(day) ?? 0) + 1);
  }
  const popular = [...offCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([day]) => day)
    .sort((a, b) => a - b);
  return popular.length ? popular : [5, 6];
}

function inferDefaultShift(rows: RosterRegisterRow[]): { start: string; end: string } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.isWeekOff || row.leaveType || !row.shiftStart || !row.shiftEnd) continue;
    const key = `${row.shiftStart.slice(0, 5)}|${row.shiftEnd.slice(0, 5)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best) {
    const [start, end] = best.split("|");
    return { start: start || "09:00", end: end || "18:00" };
  }
  return { start: "09:00", end: "18:00" };
}

function inferDefaultLocationId(rows: RosterRegisterRow[], fallback: string): string {
  if (fallback) return fallback;
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.locationId) continue;
    counts.set(row.locationId, (counts.get(row.locationId) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export function RosterBulkPatternDialog({
  open,
  onOpenChange,
  person,
  periodFrom,
  periodTo,
  defaultLocationId,
  locationOptions,
  existingRows,
  onApplied,
}: RosterBulkPatternDialogProps) {
  const { t, i18n } = useTranslation();
  const [locationId, setLocationId] = useState("");
  const [overrideLocation, setOverrideLocation] = useState(false);
  const [applyFrom, setApplyFrom] = useState(periodFrom);
  const [applyTo, setApplyTo] = useState(periodTo);
  const [offWeekdays, setOffWeekdays] = useState<number[]>([5, 6]);
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");

  useEffect(() => {
    if (!open || !person) return;
    const staffRows = existingRows.filter((row) => row.staffId === person.staffId);
    const shift = inferDefaultShift(staffRows);
    setLocationId(inferDefaultLocationId(staffRows, defaultLocationId));
    setOverrideLocation(false);
    setApplyFrom(periodFrom);
    setApplyTo(periodTo);
    setOffWeekdays(inferDefaultOffWeekdays(staffRows));
    setShiftStart(shift.start);
    setShiftEnd(shift.end);
  }, [open, person, existingRows, defaultLocationId, periodFrom, periodTo]);

  const weekdayLabels = useMemo(
    () => [
      t("people.roster.bulkPatternWeekdaySun"),
      t("people.roster.bulkPatternWeekdayMon"),
      t("people.roster.bulkPatternWeekdayTue"),
      t("people.roster.bulkPatternWeekdayWed"),
      t("people.roster.bulkPatternWeekdayThu"),
      t("people.roster.bulkPatternWeekdayFri"),
      t("people.roster.bulkPatternWeekdaySat"),
    ],
    [t],
  );

  const preview = useMemo(() => {
    if (!person) {
      return {
        createCount: 0,
        updateCount: 0,
        changeCount: 0,
        skipLeaveCount: 0,
        workingDayCount: 0,
        weekOffCount: 0,
        dateFrom: periodFrom,
        dateTo: periodTo,
      };
    }
    const { dateFrom, dateTo } = clampRosterPatternRange(periodFrom, periodTo, applyFrom, applyTo);
    if (dateFrom > dateTo) {
      return {
        createCount: 0,
        updateCount: 0,
        changeCount: 0,
        skipLeaveCount: 0,
        workingDayCount: 0,
        weekOffCount: 0,
        dateFrom,
        dateTo,
      };
    }
    const staffRows = existingRows.filter(
      (row) => row.staffId === person.staffId && row.workDate >= dateFrom && row.workDate <= dateTo,
    );
    const plan = planRosterStaffPattern({
      dateFrom,
      dateTo,
      offWeekdays,
      shiftStart,
      shiftEnd,
      existing: staffRows.map((row) => ({
        id: row.id,
        workDate: row.workDate,
        leaveType: row.leaveType,
        isWeekOff: row.isWeekOff,
        shiftStart: row.shiftStart,
        shiftEnd: row.shiftEnd,
        locationId: row.locationId,
      })),
    });
    return { ...plan, dateFrom, dateTo };
  }, [person, periodFrom, periodTo, applyFrom, applyTo, offWeekdays, shiftStart, shiftEnd, existingRows]);

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!person) throw new Error(t("people.roster.registerPickStaff"));
      if (!locationId) throw new Error(t("people.roster.registerPickLocation"));
      if (offWeekdays.length < 7 && (!shiftStart || !shiftEnd)) {
        throw new Error(t("people.roster.bulkPatternTimesRequired"));
      }
      const result = await applyRosterStaffPattern({
        staffId: person.staffId,
        locationId,
        periodFrom,
        periodTo,
        dateFrom: applyFrom,
        dateTo: applyTo,
        offWeekdays,
        shiftStart,
        shiftEnd,
        overrideLocation,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(
        t("people.roster.bulkPatternApplied", {
          changed: data.changed,
          skipped: data.skippedLeave,
        }),
      );
      onOpenChange(false);
      onApplied();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleWeekday = (day: number, checked: boolean) => {
    setOffWeekdays((prev) => {
      if (checked) return [...new Set([...prev, day])].sort((a, b) => a - b);
      return prev.filter((value) => value !== day);
    });
  };

  const staffLabel = person?.staffName || person?.employeeCode || person?.qid || "";
  const rangeLabel = formatPayrollRange(preview.dateFrom, preview.dateTo, i18n.language);
  const canApply =
    Boolean(person && locationId) &&
    preview.dateFrom <= preview.dateTo &&
    (preview.changeCount > 0 || overrideLocation) &&
    !applyMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("people.roster.bulkPatternTitle")}</DialogTitle>
          <DialogDescription>
            {t("people.roster.bulkPatternHelp", { name: staffLabel || "—" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("people.roster.col.location")}</Label>
            <SearchableSelect
              value={locationId}
              onValueChange={(value) => setLocationId(value || "")}
              options={locationOptions}
              placeholder={t("people.roster.registerPickLocation")}
            />
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={overrideLocation}
                onCheckedChange={(value) => setOverrideLocation(value === true)}
                className="mt-0.5"
              />
              <span>{t("people.roster.bulkPatternOverrideLocation")}</span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="roster-bulk-from">{t("people.roster.bulkPatternFrom")}</Label>
              <Input
                id="roster-bulk-from"
                type="date"
                min={periodFrom}
                max={periodTo}
                value={applyFrom}
                onChange={(event) => setApplyFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roster-bulk-to">{t("people.roster.bulkPatternTo")}</Label>
              <Input
                id="roster-bulk-to"
                type="date"
                min={periodFrom}
                max={periodTo}
                value={applyTo}
                onChange={(event) => setApplyTo(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("people.roster.bulkPatternPeriodHint", {
              range: formatPayrollRange(periodFrom, periodTo, i18n.language),
            })}
          </p>

          <div className="space-y-2">
            <Label>{t("people.roster.bulkPatternOffDays")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEEKDAY_ORDER.map((day) => {
                const id = `roster-bulk-off-${day}`;
                const checked = offWeekdays.includes(day);
                return (
                  <label
                    key={day}
                    htmlFor={id}
                    className="flex min-h-9 items-center gap-2 rounded-md border border-border/70 px-2.5 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => toggleWeekday(day, value === true)}
                    />
                    <span>{weekdayLabels[day]}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t("people.roster.bulkPatternOffDaysHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("people.roster.colShift")}</Label>
            <ShiftRangeEditor
              start={shiftStart}
              end={shiftEnd}
              disabled={offWeekdays.length >= 7}
              onStartChange={(value) => setShiftStart(value ?? "")}
              onEndChange={(value) => setShiftEnd(value ?? "")}
            />
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{t("people.roster.bulkPatternPreviewTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("people.roster.bulkPatternPreviewBody", {
                range: rangeLabel,
                change: preview.changeCount,
                working: preview.workingDayCount,
                off: preview.weekOffCount,
                leave: preview.skipLeaveCount,
              })}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applyMut.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => applyMut.mutate()} disabled={!canApply}>
            {applyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("people.roster.bulkPatternApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

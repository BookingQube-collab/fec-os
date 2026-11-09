"use client";

/* Hallmark · redesign · Event Attendance records table · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · records tab)
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FecDropdown as DropdownMenu,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatHoursValue,
  formatLatePunch,
  formatOvertimeHours,
  formatPunchTime12h,
  formatReportingTime12h,
  getAttendanceStatusDisplay,
  hasLatePunch,
  latePunchCellClass,
  resolveHoursBasedAttendanceStatus,
  resolveOvertimeMinutes,
  resolveReportingDisplayIso,
  resolveTotalHoursWorked,
} from "@/lib/attendance-display";
import {
  eventAttendanceLocationBadge,
  isEventMissedPunchRow,
  toEventAttendanceListingSource,
  toEventAttendanceSummaryRow,
} from "@/lib/people-event-attendance-display";
import { personInitials } from "@/lib/people-event-crew-display";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5;

function formatDisplayDate(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return ymd;
  }
}

function StatusPill({ row }: { row: PeopleEventAttendanceRow }) {
  const { t } = useTranslation();
  const listing = toEventAttendanceListingSource(row);
  const display = getAttendanceStatusDisplay(toEventAttendanceSummaryRow(row));
  const statusKey = resolveHoursBasedAttendanceStatus(listing);
  const label = t(`attendanceHr.reports.statuses.${statusKey}`, {
    defaultValue: display.label,
  });

  const tone =
    display.label === "Late" || display.label === "Early Leave"
      ? "late"
      : display.label === "Missing Punch" ||
          display.label === "Absent" ||
          display.label === "Missed punch" ||
          isEventMissedPunchRow(row)
        ? "missing"
        : "complete";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "complete" && "bg-emerald-50 text-emerald-700",
        tone === "late" && "bg-amber-50 text-amber-800",
        tone === "missing" && "bg-red-50 text-red-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "complete" && "bg-emerald-500",
          tone === "late" && "bg-amber-500",
          tone === "missing" && "bg-red-500",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function PunchCell({
  value,
  tone,
}: {
  value: string;
  tone?: "ok" | "late" | "missing";
}) {
  if (!value || value === "—") {
    return <span className="font-semibold text-red-500">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        tone === "ok" && "bg-emerald-50 text-emerald-700",
        tone === "late" && "bg-amber-50 text-amber-800",
        tone === "missing" && "text-red-500",
        !tone && "text-foreground",
      )}
    >
      {value}
    </span>
  );
}

export function EventAttendanceRecordsPanel({
  rows,
  isLoading,
  canModifyMissed,
  selected,
  onToggleAll,
  onToggleOne,
  onExportSelected,
}: {
  rows: PeopleEventAttendanceRow[];
  isLoading?: boolean;
  canModifyMissed: boolean;
  selected: Set<string>;
  onToggleAll: (on: boolean) => void;
  onToggleOne: (id: string, on: boolean) => void;
  onExportSelected: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  const showingFrom = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, total);
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const selectedMissed = useMemo(
    () => selectedRows.filter(isEventMissedPunchRow),
    [selectedRows],
  );

  const pageButtons = useMemo(() => {
    const pages: Array<number | "ellipsis"> = [];
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safePage > 3) pages.push("ellipsis");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(pageCount - 1, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < pageCount - 2) pages.push("ellipsis");
    pages.push(pageCount);
    return pages;
  }, [pageCount, safePage]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  function modifyPunchTarget(): PeopleEventAttendanceRow | null {
    if (selectedMissed.length === 1) return selectedMissed[0] ?? null;
    if (selectedMissed.length === 0 && selectedRows.length === 1) {
      const only = selectedRows[0];
      return only && isEventMissedPunchRow(only) ? only : null;
    }
    return selectedMissed[0] ?? null;
  }

  function onModifyPunch() {
    const target = modifyPunchTarget();
    if (!target) {
      toast.error(t("peopleEvent.attendance.selectMissedFirst"));
      return;
    }
    window.location.href = `/events/${target.eventId}/corrections#mp-${target.id}`;
  }

  function onMarkComplete() {
    if (!selectedMissed.length) {
      toast.error(t("peopleEvent.attendance.selectMissedFirst"));
      return;
    }
    if (!canModifyMissed) {
      toast.message(t("peopleEvent.attendance.viewOnlyMissedHint"));
      return;
    }
    const target = selectedMissed[0]!;
    toast.message(t("peopleEvent.attendance.markCompleteHint"));
    window.location.href = `/events/${target.eventId}/corrections#mp-${target.id}`;
  }

  return (
    <section className="rounded-2xl border border-black/5 bg-white shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("peopleEvent.attendance.tableTitle", { n: total.toLocaleString() })}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {canModifyMissed
              ? t("peopleEvent.attendance.hooModifyHint")
              : t("peopleEvent.attendance.viewOnlyMissedHint")}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border/80 bg-white"
            onClick={onModifyPunch}
          >
            <Pencil className="me-1.5 h-3.5 w-3.5" aria-hidden />
            {t("peopleEvent.attendance.modifyMissed")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border/80 bg-white"
            onClick={onMarkComplete}
          >
            <Check className="me-1.5 h-3.5 w-3.5" aria-hidden />
            {t("peopleEvent.attendance.markComplete")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl border-border/80 bg-white"
              >
                {t("peopleEvent.attendance.bulkActions")}
                <ChevronDown className="ms-1.5 h-3.5 w-3.5 opacity-70" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem
                disabled={!selectedRows.length}
                onClick={() => onExportSelected()}
              >
                {t("peopleEvent.bulk.exportCsv")}
              </DropdownMenuItem>
              {selectedRows[0] ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/people/event-shifts?eventId=${encodeURIComponent(selectedRows[0].eventId)}`}
                  >
                    {t("peopleEvent.links.openShifts")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {selectedMissed[0] ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/events/${selectedMissed[0].eventId}/corrections#mp-${selectedMissed[0].id}`}
                  >
                    {t("peopleEvent.links.corrections")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-2 sm:p-4">
        {isLoading ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : total === 0 ? (
          <HrEmptyState message={t("peopleEvent.attendance.empty")} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[72rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(v) => {
                          const on = Boolean(v);
                          for (const row of pageRows) onToggleOne(row.id, on);
                          if (on && pageRows.length === rows.length) onToggleAll(true);
                        }}
                        aria-label={t("peopleEvent.bulk.selectAll")}
                      />
                    </th>
                    <th className="px-3 py-3">{t("people.attendance.location")}</th>
                    <th className="px-3 py-3">{t("people.attendance.userName")}</th>
                    <th className="px-3 py-3">{t("people.attendance.deviceUserId")}</th>
                    <th className="px-3 py-3">{t("people.attendance.date")}</th>
                    <th className="px-3 py-3">{t("people.attendance.reportingTime")}</th>
                    <th className="px-3 py-3">{t("people.attendance.shiftStart")}</th>
                    <th className="px-3 py-3">{t("people.attendance.firstCheckIn")}</th>
                    <th className="px-3 py-3">{t("people.attendance.lastCheckOut")}</th>
                    <th className="px-3 py-3">{t("people.attendance.totalHours")}</th>
                    <th className="px-3 py-3">{t("people.attendance.latePunch")}</th>
                    <th className="px-3 py-3">{t("people.attendance.overtimeHours")}</th>
                    <th className="px-3 py-3">{t("people.attendance.status")}</th>
                    <th className="px-3 py-3 text-end">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const listing = toEventAttendanceListingSource(row);
                    const hours = resolveTotalHoursWorked(listing);
                    const late = hasLatePunch(row.lateMinutes);
                    const otMinutes = resolveOvertimeMinutes(listing);
                    const checkIn = formatPunchTime12h(row.actualIn);
                    const checkOut = formatPunchTime12h(row.actualOut);
                    const checkInTone = !checkIn
                      ? "missing"
                      : late
                        ? "late"
                        : "ok";
                    const initials = personInitials(row.staffName, row.employeeCode);
                    const badge = eventAttendanceLocationBadge(row);
                    const missed = isEventMissedPunchRow(row);

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 last:border-0 hover:bg-violet-50/30"
                      >
                        <td className="px-3 py-3 align-middle">
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={(v) => onToggleOne(row.id, Boolean(v))}
                            aria-label={row.staffName ?? row.id}
                          />
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="inline-flex rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-[#7c3aed]">
                            {badge}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar className="h-9 w-9 border border-border/60">
                              <AvatarFallback className="bg-violet-50 text-xs font-semibold text-[#7c3aed]">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {row.employeeCode?.trim()
                                  ? `${row.employeeCode.trim()} · ${row.staffName ?? "—"}`
                                  : (row.staffName ?? "—")}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.biometricUserId?.trim()
                                  ? row.biometricUserId.trim()
                                  : row.employeeCode ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle font-mono text-xs tabular-nums text-muted-foreground">
                          {row.biometricUserId?.trim() || "—"}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums">
                          {formatDisplayDate(row.workDate, locale)}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums">
                          {formatReportingTime12h(resolveReportingDisplayIso(listing)) || "—"}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums">
                          {formatReportingTime12h(row.scheduledIn) || "—"}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <PunchCell value={checkIn || "—"} tone={checkInTone} />
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <PunchCell
                            value={checkOut || "—"}
                            tone={!checkOut ? "missing" : undefined}
                          />
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums">
                          {hours != null ? `${formatHoursValue(hours)} h` : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums",
                            late ? latePunchCellClass(row.lateMinutes) : "text-muted-foreground",
                          )}
                        >
                          {formatLatePunch(row.lateMinutes)}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {otMinutes > 0 ? `${formatOvertimeHours(otMinutes)} h` : "—"}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <StatusPill row={row} />
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground"
                            >
                              <Link
                                href={
                                  missed
                                    ? `/events/${row.eventId}/corrections#mp-${row.id}`
                                    : `/people/event-shifts?eventId=${encodeURIComponent(row.eventId)}`
                                }
                                aria-label={
                                  missed
                                    ? canModifyMissed
                                      ? t("peopleEvent.attendance.modifyMissed")
                                      : t("peopleEvent.attendance.viewMissed")
                                    : t("peopleEvent.links.openShifts")
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground"
                                  aria-label={t("common.actions")}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[11rem]">
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/people/event-shifts?eventId=${encodeURIComponent(row.eventId)}`}
                                  >
                                    {t("peopleEvent.links.openShifts")}
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/events/${row.eventId}/corrections`}>
                                    {t("peopleEvent.links.corrections")}
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("peopleEvent.attendance.paginationShowing", {
                  from: showingFrom,
                  to: showingTo,
                  total: total.toLocaleString(),
                })}
              </p>
              <nav
                className="flex flex-wrap items-center gap-1"
                aria-label={t("peopleEvent.attendance.paginationAria")}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label={t("common.prev")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageButtons.map((item, idx) =>
                  item === "ellipsis" ? (
                    <span
                      key={`e-${idx}`}
                      className="px-1 text-sm text-muted-foreground"
                      aria-hidden
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-full text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40",
                        item === safePage
                          ? "bg-[#7c3aed] text-white shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      aria-current={item === safePage ? "page" : undefined}
                    >
                      {item}
                    </button>
                  ),
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label={t("common.next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

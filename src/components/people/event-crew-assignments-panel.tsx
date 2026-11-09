"use client";

/* Hallmark · redesign · Event Crew assignments table · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Attendance overview)
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  LayoutGrid,
  LayoutList,
  MapPin,
  MoreVertical,
  PartyPopper,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FecDropdown as DropdownMenu,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import { assignmentTypeLabel } from "@/lib/events/staff-assignments";
import { formatStaffCodeBeforeName } from "@/lib/events/event-workforce-demo";
import {
  formatCrewDateRange,
  personInitials,
  typeBadgeTone,
} from "@/lib/people-event-crew-display";
import type { PeopleEventCrewRow } from "@/lib/people-event-workforce.functions";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function TypeBadge({ type }: { type: string }) {
  const tone = typeBadgeTone(type);
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "loaned" && "bg-violet-100 text-[#7c3aed]",
        tone === "hire" && "bg-sky-100 text-sky-700",
        tone === "joker" && "bg-amber-50 text-amber-800",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {assignmentTypeLabel(type)}
    </span>
  );
}

function StatusCell({ status }: { status: string }) {
  const { t } = useTranslation();
  const active = status === "active";
  const label = active
    ? t("peopleEvent.status.active")
    : status === "closed"
      ? t("peopleEvent.status.closed")
      : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function RowActions({ row }: { row: PeopleEventCrewRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
        <Link
          href={`/people/event-roles?eventId=${encodeURIComponent(row.eventId)}`}
          aria-label={t("peopleEvent.crew.viewAssignment")}
        >
          <Eye className="h-4 w-4" />
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
            <Link href={`/people/event-roles?eventId=${encodeURIComponent(row.eventId)}`}>
              {t("peopleEvent.tabs.roles")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/people/event-shifts?eventId=${encodeURIComponent(row.eventId)}`}>
              {t("peopleEvent.links.openShifts")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PersonCell({ row }: { row: PeopleEventCrewRow }) {
  const initials = personInitials(row.staffName, row.employeeCode);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="h-9 w-9 border border-border/60">
        <AvatarFallback className="bg-violet-50 text-xs font-semibold text-[#7c3aed]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">
          {formatStaffCodeBeforeName(row.employeeCode, row.staffName)}
        </p>
      </div>
    </div>
  );
}

function EventCell({ row }: { row: PeopleEventCrewRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600">
        <PartyPopper className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.eventName ?? "—"}</p>
        <p className="truncate text-xs text-muted-foreground">{row.locationName ?? "—"}</p>
      </div>
    </div>
  );
}

export function EventCrewAssignmentsPanel({
  rows,
  isLoading,
  canEdit,
  selected,
  onToggleAll,
  onToggleOne,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
}: {
  rows: PeopleEventCrewRow[];
  isLoading?: boolean;
  canEdit: boolean;
  selected: Set<string>;
  onToggleAll: (on: boolean) => void;
  onToggleOne: (id: string, on: boolean) => void;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [view, setView] = useState<"table" | "cards">("table");
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

  return (
    <section className="rounded-2xl border border-black/5 bg-white shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("peopleEvent.crew.tableTitle", { n: total })}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("peopleEvent.crew.tableSubtitle")}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          <PeopleEventDateRangeControl
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={(v) => {
              onDateFrom(v);
              setPage(1);
            }}
            onDateTo={(v) => {
              onDateTo(v);
              setPage(1);
            }}
            fromId="crew-date-from"
            toId="crew-date-to"
            className="w-full min-w-[16rem] border-border/70 sm:w-auto sm:min-w-[18rem]"
          />

          <div
            className="inline-flex rounded-full border border-border/70 bg-muted/30 p-1"
            role="group"
            aria-label={t("peopleEvent.crew.viewToggleAria")}
          >
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40",
                view === "table"
                  ? "bg-[#7c3aed] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.crew.viewTable")}
            </button>
            <button
              type="button"
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40",
                view === "cards"
                  ? "bg-[#7c3aed] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.crew.viewCards")}
            </button>
          </div>
        </div>
      </div>

      <div className="p-2 sm:p-4">
        {isLoading ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : total === 0 ? (
          <HrEmptyState message={t("peopleEvent.crew.empty")} icon={Users} />
        ) : view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <EventCell row={row} />
                  {canEdit ? (
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(v) => onToggleOne(row.id, Boolean(v))}
                      aria-label={row.staffName ?? row.id}
                    />
                  ) : null}
                </div>
                <div className="mt-3">
                  <PersonCell row={row} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{row.roleLabel}</span>
                  <TypeBadge type={row.assignmentType} />
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {formatCrewDateRange(row.dateFrom, row.dateTo, locale)}
                  </p>
                  <p className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {row.locationName ?? "—"}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <StatusCell status={row.status} />
                  <RowActions row={row} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {canEdit ? (
                    <th className="w-10 pb-3 pe-2">
                      <Checkbox
                        checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                        onCheckedChange={(v) => onToggleAll(Boolean(v))}
                        aria-label={t("peopleEvent.bulk.selectAll")}
                      />
                    </th>
                  ) : null}
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.event")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.person")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.crew.colRole")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.type")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.crew.colDates")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.crew.colSite")}</th>
                  <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.status")}</th>
                  <th className="pb-3 text-end font-semibold">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    {canEdit ? (
                      <td className="py-3 pe-2 align-middle">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v) => onToggleOne(row.id, Boolean(v))}
                          aria-label={row.staffName ?? row.id}
                        />
                      </td>
                    ) : null}
                    <td className="py-3 pe-3 align-middle">
                      <EventCell row={row} />
                    </td>
                    <td className="py-3 pe-3 align-middle">
                      <PersonCell row={row} />
                    </td>
                    <td className="py-3 pe-3 align-middle font-medium text-foreground">
                      {row.roleLabel}
                    </td>
                    <td className="py-3 pe-3 align-middle">
                      <TypeBadge type={row.assignmentType} />
                    </td>
                    <td className="py-3 pe-3 align-middle whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {formatCrewDateRange(row.dateFrom, row.dateTo, locale)}
                      </span>
                    </td>
                    <td className="py-3 pe-3 align-middle text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{row.locationName ?? "—"}</span>
                      </span>
                    </td>
                    <td className="py-3 pe-3 align-middle">
                      <StatusCell status={row.status} />
                    </td>
                    <td className="py-3 align-middle">
                      <RowActions row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-muted-foreground">
            {t("peopleEvent.crew.paginationShowing", {
              from: showingFrom,
              to: showingTo,
              total,
            })}
          </p>
          <nav className="flex flex-wrap items-center gap-1" aria-label={t("peopleEvent.crew.paginationAria")}>
            {pageButtons.map((item, idx) =>
              item === "ellipsis" ? (
                <span key={`e-${idx}`} className="px-1.5 text-sm text-muted-foreground">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  aria-current={item === safePage ? "page" : undefined}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40",
                    item === safePage
                      ? "bg-[#7c3aed] text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ),
            )}
          </nav>
        </div>
      ) : null}
    </section>
  );
}

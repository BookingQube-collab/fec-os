"use client";

/* Hallmark · redesign · Event Payroll periods table · mockup-faithful
 * theme: studied-DNA (mockup purple #7c3aed · sibling Crew assignments panel)
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  Eye,
  Plus,
  Settings2,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  emptyPeriodStats,
  eventPayrollUiStatus,
  formatHours,
  formatPayrollMonthLabel,
  formatQarAmount,
  type EventPayrollPeriodStats,
} from "@/lib/people-event-payroll-display";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5;

export type EventPayrollPeriodRow = {
  id: string;
  month: string;
  displayName: string | null;
  status: string;
  eventId: string | null;
  eventName: string | null;
  eventNumber: string | null;
  stats: EventPayrollPeriodStats;
};

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const ui = eventPayrollUiStatus(status);
  const label =
    ui === "completed"
      ? t("peopleEvent.payroll.statusCompleted")
      : ui === "in_review"
        ? t("peopleEvent.payroll.statusInReview")
        : t("peopleEvent.payroll.statusOpen");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        ui === "completed" && "bg-emerald-50 text-emerald-700",
        ui === "open" && "bg-sky-50 text-sky-700",
        ui === "in_review" && "bg-orange-50 text-orange-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          ui === "completed" && "bg-emerald-500",
          ui === "open" && "bg-sky-500",
          ui === "in_review" && "bg-orange-500",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function pageWindow(pageCount: number, safePage: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [1];
  if (safePage > 3) pages.push("ellipsis");
  for (let i = Math.max(2, safePage - 1); i <= Math.min(pageCount - 1, safePage + 1); i++) {
    pages.push(i);
  }
  if (safePage < pageCount - 2) pages.push("ellipsis");
  pages.push(pageCount);
  return pages;
}

export function EventPayrollPeriodsPanel({
  rows,
  isLoading,
  canCreate,
  createBusy,
  createDisabled,
  createAndGenerateMode,
  onCreate,
  canGenerate,
  generateBusy,
  generateDisabled,
  generateNeedsLines,
  onGenerate,
  onGeneratePeriod,
  onExportCsv,
  setupHref,
  hasEvent,
  locale = "en",
}: {
  rows: EventPayrollPeriodRow[];
  isLoading?: boolean;
  canCreate?: boolean;
  createBusy?: boolean;
  /** True when Create should stay visible but inactive (e.g. no shared eventId). */
  createDisabled?: boolean;
  /** Empty for selected event: Create label + Generate both create period and lines. */
  createAndGenerateMode?: boolean;
  onCreate?: () => void;
  canGenerate?: boolean;
  generateBusy?: boolean;
  generateDisabled?: boolean;
  /** Highlight Generate when the selected event period still has no lines. */
  generateNeedsLines?: boolean;
  onGenerate?: () => void;
  onGeneratePeriod?: (periodId: string) => void;
  onExportCsv?: () => void;
  /** Deep link to Event pay (setup) for the selected event. */
  setupHref?: string | null;
  hasEvent?: boolean;
  locale?: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const sliceStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(sliceStart, sliceStart + PAGE_SIZE);
  const showingFrom = total === 0 ? 0 : sliceStart + 1;
  const showingTo = Math.min(sliceStart + PAGE_SIZE, total);
  const pageButtons = useMemo(
    () => pageWindow(pageCount, safePage),
    [pageCount, safePage],
  );

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [rows]);

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-black/5 bg-white shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("peopleEvent.payroll.tableTitle", { n: total })}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("peopleEvent.payroll.tableSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate ? (
            <Button
              size="sm"
              variant={createAndGenerateMode ? "default" : "outline"}
              disabled={createBusy || createDisabled}
              title={
                createDisabled
                  ? t("peopleEvent.payroll.needEvent")
                  : createAndGenerateMode
                    ? t("peopleEvent.payroll.createAndGenerateHint")
                    : undefined
              }
              onClick={onCreate}
              className={
                createAndGenerateMode
                  ? "h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9]"
                  : "h-10 rounded-xl border-border/80 bg-white"
              }
            >
              <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
              {createAndGenerateMode
                ? t("peopleEvent.payroll.createAndGenerate")
                : t("peopleEvent.payroll.createPeriod")}
            </Button>
          ) : null}
          {canGenerate && !createAndGenerateMode ? (
            <Button
              size="sm"
              disabled={generateBusy || generateDisabled}
              title={
                generateDisabled
                  ? t("peopleEvent.payroll.needEvent")
                  : t("peopleEvent.payroll.generateHint")
              }
              onClick={onGenerate}
              className={
                generateNeedsLines
                  ? "h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9]"
                  : "h-10 rounded-xl border-border/80 bg-white"
              }
              variant={generateNeedsLines ? "default" : "outline"}
            >
              <WandSparkles className="me-1.5 h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.payroll.generate")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={onExportCsv}
            className="h-10 rounded-xl border-border/80 bg-white"
          >
            <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
            {t("peopleEvent.payroll.exportCsv")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="space-y-5 p-8">
            <HrEmptyState
              message={t("peopleEvent.payroll.empty")}
              hint={
                hasEvent
                  ? t("peopleEvent.payroll.emptyHintWithEvent")
                  : t("peopleEvent.payroll.emptyHintNoEvent")
              }
              icon={CalendarDays}
            />
            <div className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground/90">
                {t("peopleEvent.payroll.howToTitle")}
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 ps-4">
                <li>{t("peopleEvent.payroll.howToStep1")}</li>
                <li>{t("peopleEvent.payroll.howToStep2")}</li>
                <li>{t("peopleEvent.payroll.howToStep3")}</li>
                <li>{t("peopleEvent.payroll.howToStep4")}</li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                {canCreate ? (
                  <Button
                    size="sm"
                    variant={createAndGenerateMode ? "default" : "outline"}
                    disabled={createBusy || createDisabled}
                    title={
                      createDisabled
                        ? t("peopleEvent.payroll.needEvent")
                        : createAndGenerateMode
                          ? t("peopleEvent.payroll.createAndGenerateHint")
                          : undefined
                    }
                    onClick={onCreate}
                    className={
                      createAndGenerateMode
                        ? "h-9 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                        : "h-9 rounded-xl"
                    }
                  >
                    <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {createAndGenerateMode
                      ? t("peopleEvent.payroll.createAndGenerate")
                      : t("peopleEvent.payroll.createPeriod")}
                  </Button>
                ) : null}
                {canGenerate ? (
                  <Button
                    size="sm"
                    disabled={generateBusy || generateDisabled}
                    title={
                      generateDisabled
                        ? t("peopleEvent.payroll.needEvent")
                        : createAndGenerateMode
                          ? t("peopleEvent.payroll.createAndGenerateHint")
                          : t("peopleEvent.payroll.generateHint")
                    }
                    onClick={onGenerate}
                    className={
                      createAndGenerateMode
                        ? "h-9 rounded-xl border-border/80 bg-white"
                        : "h-9 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    }
                    variant={createAndGenerateMode ? "outline" : "default"}
                  >
                    <WandSparkles className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("peopleEvent.payroll.generate")}
                  </Button>
                ) : null}
                {setupHref ? (
                  <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
                    <Link href={setupHref}>
                      <Settings2 className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {t("peopleEvent.links.openEventPay")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                    aria-label={t("peopleEvent.bulk.selectAll")}
                  />
                </th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.payroll.colMonth")}</th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.columns.event")}</th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.payroll.colCycle")}</th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.payroll.colCrew")}</th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.payroll.colHours")}</th>
                <th className="px-2 py-3 text-start">{t("peopleEvent.payroll.colAmount")}</th>
                <th className="px-2 py-3 text-start">{t("hr.payroll.colStatus")}</th>
                <th className="px-4 py-3 text-end">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const stats = row.stats ?? emptyPeriodStats();
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleOne(row.id, Boolean(v))}
                        aria-label={row.displayName ?? row.month}
                      />
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <span className="inline-flex items-center gap-2 font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
                        {formatPayrollMonthLabel(row.month, locale)}
                      </span>
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {row.eventName ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.eventNumber ?? (row.eventId ? row.eventId.slice(0, 8) : "—")}
                        </p>
                      </div>
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-[#7c3aed]">
                        {t("peopleEvent.payroll.cycleEvent")}
                      </span>
                    </td>
                    <td className="px-2 py-3 align-middle tabular-nums text-foreground">
                      {stats.crewCount}
                    </td>
                    <td className="px-2 py-3 align-middle tabular-nums text-foreground">
                      {formatHours(stats.totalHours, locale)} h
                    </td>
                    <td className="px-2 py-3 align-middle whitespace-nowrap tabular-nums font-medium text-foreground">
                      {formatQarAmount(stats.payrollAmountQar, locale)}
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-0.5">
                        {canGenerate && stats.crewCount === 0 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={generateBusy}
                            className="h-8 w-8 text-[#7c3aed]"
                            aria-label={t("peopleEvent.payroll.generate")}
                            title={t("peopleEvent.payroll.generateHint")}
                            onClick={() => onGeneratePeriod?.(row.id)}
                          >
                            <WandSparkles className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                        >
                          <Link
                            href={`/people/payroll/${row.id}`}
                            aria-label={t("common.view")}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {row.eventId ? (
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                          >
                            <Link
                              href={`/events/${row.eventId}/pay`}
                              aria-label={t("peopleEvent.links.setup")}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-muted-foreground">
            {t("peopleEvent.payroll.paginationShowing", {
              from: showingFrom,
              to: showingTo,
              total,
            })}
          </p>
          <nav
            className="flex flex-wrap items-center gap-1"
            aria-label={t("peopleEvent.payroll.paginationAria")}
          >
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

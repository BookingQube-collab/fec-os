"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SupportedLanguage } from "@/i18n";
import {
  buildMonthWeeks,
  dateInUploadPeriod,
  formatMonthTitle,
  formatShiftTime,
  groupShiftsByDate,
  isCurrentWeek,
  rosterWeekStartsOn,
  type RosterShiftRow,
  type RosterUploadRow,
  weekdayLabels,
  weekHasRosterUpload,
} from "@/lib/daily-ops/roster-calendar-utils";

const EXPORT_SHIFT_LIMIT = 5;

/** Hex/rgba only — html2canvas cannot parse Tailwind v4 oklab/color-mix output. */
const exportColors = {
  white: "#ffffff",
  navy: "#0B1F3A",
  indigo: "#6366F1",
  slate500: "#475569",
  slate400: "#64748B",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  indigoLight: "#EEF2FF",
  greenLight: "rgba(240, 253, 244, 0.6)",
  indigoRing: "0 0 0 1px rgba(129, 140, 248, 0.4)",
  greenRing: "0 0 0 1px rgba(134, 239, 172, 0.5)",
} as const;

export type RosterExportViewProps = {
  yearMonth: string;
  locationLabel: string;
  locationCode: string;
  shifts: RosterShiftRow[];
  uploads: RosterUploadRow[];
  language: SupportedLanguage;
};

export function RosterExportView({
  yearMonth,
  locationLabel,
  locationCode,
  shifts,
  uploads,
  language,
}: RosterExportViewProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const weekStartsOn = rosterWeekStartsOn(language);
  const locale = language === "ar" ? "ar" : "en-US";

  const weeks = useMemo(
    () => buildMonthWeeks(yearMonth, weekStartsOn),
    [yearMonth, weekStartsOn],
  );
  const shiftsByDate = useMemo(() => groupShiftsByDate(shifts), [shifts]);
  const weekdays = useMemo(() => weekdayLabels(language, weekStartsOn), [language, weekStartsOn]);
  const monthTitle = formatMonthTitle(yearMonth, language);
  const generatedAt = new Date().toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const currentWeekDates = useMemo(() => {
    const week = weeks.find((w) => isCurrentWeek(w.map((d) => d.date), today));
    return week?.map((d) => d.date) ?? null;
  }, [weeks, today]);

  const weekRangeLabel = useMemo(() => {
    if (!currentWeekDates?.length) return null;
    const start = new Date(`${currentWeekDates[0]}T12:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
    const end = new Date(`${currentWeekDates[6]}T12:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${start} – ${end}`;
  }, [currentWeekDates, locale]);

  return (
    <div
      data-roster-export
      dir={language === "ar" ? "rtl" : "ltr"}
      style={{
        width: 900,
        padding: 24,
        backgroundColor: exportColors.white,
        color: exportColors.navy,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: `1px solid ${exportColors.slate200}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: exportColors.indigo,
              }}
            >
              FEC-OS
            </p>
            <h1
              style={{
                marginTop: 4,
                fontSize: 20,
                fontWeight: 700,
                color: exportColors.navy,
              }}
            >
              {t("dailyOps.roster.exportTitle")}
            </h1>
            <p style={{ marginTop: 4, fontSize: 14, color: exportColors.slate500 }}>
              {locationCode} — {locationLabel}
            </p>
          </div>
          <div style={{ textAlign: language === "ar" ? "start" : "end", fontSize: 12, color: exportColors.slate400 }}>
            <p style={{ fontWeight: 500, color: exportColors.navy }}>{monthTitle}</p>
            {weekRangeLabel && (
              <p style={{ marginTop: 2 }}>
                {t("dailyOps.roster.exportWeekRange", { range: weekRangeLabel })}
              </p>
            )}
            <p style={{ marginTop: 4 }}>{t("dailyOps.roster.exportGenerated", { date: generatedAt })}</p>
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: 8,
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {weekdays.map((label) => (
          <div
            key={label}
            style={{
              paddingTop: 4,
              paddingBottom: 4,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.025em",
              color: exportColors.slate400,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {weeks.map((week, wi) => {
          const weekDates = week.map((d) => d.date);
          const currentWeek = isCurrentWeek(weekDates, today);
          const hasUpload = weekHasRosterUpload(weekDates, uploads);

          return (
            <div
              key={wi}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 4,
                borderRadius: 8,
                padding: 2,
                ...(currentWeek
                  ? {
                      backgroundColor: exportColors.indigoLight,
                      boxShadow: exportColors.indigoRing,
                    }
                  : hasUpload
                    ? {
                        backgroundColor: exportColors.greenLight,
                        boxShadow: exportColors.greenRing,
                      }
                    : {}),
              }}
            >
              {week.map((cell) => {
                const dayShifts = shiftsByDate.get(cell.date) ?? [];
                const inUploadPeriod = dateInUploadPeriod(cell.date, uploads);
                const visible = dayShifts.slice(0, EXPORT_SHIFT_LIMIT);
                const extra = dayShifts.length - visible.length;

                return (
                  <div
                    key={cell.date}
                    style={{
                      display: "flex",
                      minHeight: "6rem",
                      flexDirection: "column",
                      borderRadius: 6,
                      border: `1px solid ${cell.isToday ? exportColors.indigo : exportColors.slate200}`,
                      padding: 6,
                      opacity: cell.inMonth ? 1 : 0.4,
                      backgroundColor: exportColors.white,
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          height: 24,
                          width: 24,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: cell.isToday ? exportColors.indigo : "transparent",
                          color: cell.isToday ? exportColors.white : exportColors.navy,
                        }}
                      >
                        {cell.dayOfMonth}
                      </span>
                      {dayShifts.length > 0 && (
                        <span
                          style={{
                            borderRadius: 4,
                            backgroundColor: exportColors.slate100,
                            padding: "2px 6px",
                            fontSize: 10,
                            color: exportColors.slate500,
                          }}
                        >
                          {dayShifts.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 2 }}>
                      {visible.map((shift) => (
                        <div
                          key={String(shift.id ?? shift.starts_at)}
                          style={{ fontSize: 10, lineHeight: 1.25, color: exportColors.slate500 }}
                        >
                          <span style={{ fontWeight: 600, color: exportColors.navy }}>
                            {shift.staff?.full_name ?? "—"}
                          </span>
                          <span style={{ display: "block", color: exportColors.slate400 }}>
                            {formatShiftTime(shift.starts_at)}–{formatShiftTime(shift.ends_at)}
                            {shift.role_label ? ` · ${shift.role_label}` : ""}
                          </span>
                        </div>
                      ))}
                      {extra > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 500, color: exportColors.indigo }}>
                          {t("dailyOps.roster.moreShifts", { count: extra })}
                        </span>
                      )}
                      {dayShifts.length === 0 && cell.inMonth && (
                        <span style={{ fontSize: 10, color: exportColors.slate300 }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          borderTop: `1px solid ${exportColors.slate200}`,
          paddingTop: 12,
          fontSize: 11,
          color: exportColors.slate400,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              height: 12,
              width: 24,
              borderRadius: 4,
              backgroundColor: exportColors.indigoLight,
              boxShadow: exportColors.indigoRing,
            }}
          />
          {t("dailyOps.roster.legendCurrentWeek")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              height: 12,
              width: 24,
              borderRadius: 4,
              backgroundColor: exportColors.greenLight,
              boxShadow: exportColors.greenRing,
            }}
          />
          {t("dailyOps.roster.legendRosterWeek")}
        </span>
      </div>
    </div>
  );
}

/**
 * Closed previous compensation windows stored in staff_salary_history.
 * Joker day rates use joker_previous_rate / joker_current_rate_resume.
 * Monthly packages (permanent / secondment) use package_* reasons.
 */

import { addDaysYmd } from "@/lib/hr-overview";

export const PREVIOUS_RATE_REASONS = [
  "joker_previous_rate",
  "package_previous_rate",
] as const;

export const CURRENT_RATE_RESUME_REASONS = [
  "joker_current_rate_resume",
  "package_current_rate_resume",
] as const;

export type SalaryHistoryRateRow = {
  effectiveOn: string;
  dailyRateQar?: number | null;
  monthlyTotalQar?: number | null;
  basicQar?: number | null;
  reason?: string | null;
  createdAt?: string | null;
};

export type PreviousCompensationWindow = {
  amountQar: number;
  from: string;
  to: string;
  kind: "daily" | "monthly";
};

function ymd(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

function positiveAmount(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function compareHistoryDesc(a: SalaryHistoryRateRow, b: SalaryHistoryRateRow): number {
  const aOn = ymd(a.effectiveOn);
  const bOn = ymd(b.effectiveOn);
  if (aOn !== bOn) return aOn < bOn ? 1 : -1;
  const aAt = String(a.createdAt ?? "");
  const bAt = String(b.createdAt ?? "");
  if (aAt === bAt) return 0;
  return aAt < bAt ? 1 : -1;
}

function isPreviousReason(reason: string | null | undefined): boolean {
  return (PREVIOUS_RATE_REASONS as readonly string[]).includes(String(reason ?? ""));
}

function isResumeReason(reason: string | null | undefined): boolean {
  return (CURRENT_RATE_RESUME_REASONS as readonly string[]).includes(String(reason ?? ""));
}

function windowAmount(row: SalaryHistoryRateRow): PreviousCompensationWindow["kind"] | null {
  if (positiveAmount(row.dailyRateQar) != null) return "daily";
  if (positiveAmount(row.monthlyTotalQar) != null || positiveAmount(row.basicQar) != null) {
    return "monthly";
  }
  return null;
}

/**
 * Latest closed previous-rate window from salary history (display + edit preload).
 * To date is the day before the matching current-rate resume (or next history row).
 */
export function resolvePreviousCompensationWindow(
  history: readonly SalaryHistoryRateRow[],
): PreviousCompensationWindow | null {
  const rows = [...(history ?? [])]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(ymd(row.effectiveOn)))
    .sort(compareHistoryDesc);
  if (!rows.length) return null;

  const previous = rows.find((row) => isPreviousReason(row.reason));
  if (!previous) return null;

  const from = ymd(previous.effectiveOn);
  const kind = windowAmount(previous);
  if (!kind) return null;
  const amountQar =
    kind === "daily"
      ? positiveAmount(previous.dailyRateQar)
      : positiveAmount(previous.monthlyTotalQar) ?? positiveAmount(previous.basicQar);
  if (amountQar == null) return null;

  const later = rows
    .filter((row) => {
      const on = ymd(row.effectiveOn);
      if (on < from) return false;
      if (on > from) return true;
      // Same effective_on: resume rows created after the previous row.
      if (!isResumeReason(row.reason) && row !== previous) return false;
      const aAt = String(row.createdAt ?? "");
      const bAt = String(previous.createdAt ?? "");
      return aAt > bAt;
    })
    .sort((a, b) => {
      const aOn = ymd(a.effectiveOn);
      const bOn = ymd(b.effectiveOn);
      if (aOn !== bOn) return aOn < bOn ? -1 : 1;
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    });

  const resume =
    later.find((row) => isResumeReason(row.reason)) ??
    later.find((row) => row !== previous) ??
    null;
  if (!resume) return null;

  const resumeOn = ymd(resume.effectiveOn);
  const to = addDaysYmd(resumeOn, -1);
  if (to < from) return null;

  return { amountQar, from, to, kind };
}

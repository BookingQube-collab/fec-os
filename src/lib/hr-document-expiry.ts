/**
 * Pure document-expiry reminder selection (AT#1, AT#2, AT#19).
 * Policy values come from hr_policy_settings section `document` — never hardcode periods here.
 */

import { HR_POLICY_DEFAULTS, policyNumber } from "@/lib/hr-policy";

export type DocumentExpiryPolicy = {
  qidAlertDays: number;
  passportAlertDays: number[];
  reminderFrequencyDays: number;
};

export function documentExpiryPolicyFromSection(
  section: Record<string, unknown> | null | undefined,
): DocumentExpiryPolicy {
  const defaults = HR_POLICY_DEFAULTS.document;
  const src = section ?? defaults;
  const passportRaw = src.passport_alert_days ?? defaults.passport_alert_days;
  const passportAlertDays = Array.isArray(passportRaw)
    ? passportRaw.map((n) => policyNumber(n, 0)).filter((n) => n > 0)
    : [...(defaults.passport_alert_days as number[])];
  return {
    qidAlertDays: policyNumber(src.qid_alert_days, policyNumber(defaults.qid_alert_days, 30)),
    passportAlertDays:
      passportAlertDays.length > 0
        ? passportAlertDays
        : [...(defaults.passport_alert_days as number[])],
    reminderFrequencyDays: policyNumber(
      src.reminder_frequency_days,
      policyNumber(defaults.reminder_frequency_days, 7),
    ),
  };
}

/** AT#1 — QID alert window from policy (default 30). */
export function qidAlertPeriods(policy: DocumentExpiryPolicy): number[] {
  return [policy.qidAlertDays].filter((n) => n > 0);
}

/** AT#2 — Passport alert periods from policy (not hardcoded). */
export function passportAlertPeriods(policy: DocumentExpiryPolicy): number[] {
  return [...policy.passportAlertDays].filter((n) => n > 0).sort((a, b) => b - a);
}

export function alertPeriodsForDocType(
  docType: string,
  policy: DocumentExpiryPolicy,
): number[] {
  if (docType === "qid") return qidAlertPeriods(policy);
  if (docType === "passport") return passportAlertPeriods(policy);
  return [];
}

export function daysUntilExpiry(todayYmd: string, expiryYmd: string): number {
  const t = Date.parse(`${todayYmd.slice(0, 10)}T00:00:00.000Z`);
  const e = Date.parse(`${expiryYmd.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((e - t) / 86_400_000);
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  return daysUntilExpiry(fromYmd, toYmd);
}

/** Active milestone = largest configured period the doc has entered (daysUntil <= period). */
export function activeMilestone(daysUntil: number, periods: number[]): number | null {
  const entered = periods.filter((p) => daysUntil <= p);
  if (entered.length === 0) return null;
  return Math.max(...entered);
}

/**
 * AT#19 — acknowledgement stops reminder cadence for this document.
 * Keep reminding every frequencyDays while inside an alert window until ack or renewal.
 */
export function shouldSendExpiryReminder(input: {
  daysUntil: number;
  alertPeriods: number[];
  frequencyDays: number;
  todayYmd: string;
  lastSentAtYmd: string | null;
  acknowledged: boolean;
}): boolean {
  if (input.acknowledged) return false;
  if (input.alertPeriods.length === 0) return false;
  if (activeMilestone(input.daysUntil, input.alertPeriods) == null) return false;
  if (!input.lastSentAtYmd) return true;
  return daysBetweenYmd(input.lastSentAtYmd, input.todayYmd) >= input.frequencyDays;
}

export function isExpiredDoc(todayYmd: string, expiryYmd: string | null | undefined): boolean {
  if (!expiryYmd) return false;
  return expiryYmd.slice(0, 10) < todayYmd.slice(0, 10);
}

export function isSoonToExpire(
  todayYmd: string,
  expiryYmd: string | null | undefined,
  horizonDays: number,
): boolean {
  if (!expiryYmd) return false;
  const days = daysUntilExpiry(todayYmd, expiryYmd);
  return days >= 0 && days <= horizonDays;
}

/**
 * HR alert badges + attention buckets for People directory / overview.
 * Uses fields already on StaffRow (QID/passport expiry, missing contact fields, status).
 */

import { expiryBand, qatarTodayYmd, type HrExpiryBand } from "@/lib/hr-expiry-bands";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import {
  isResignedStaffStatus,
  isServingNoticeStaffStatus,
  isTerminatedStaffStatus,
  normalizeDirectoryStatus,
} from "@/lib/staff-status";

export type HrAlertKind = "qid" | "passport" | "contract" | "visa" | "missing" | "probation";

export type HrAlertSeverity = "expired" | "critical" | "urgent" | "watch" | "info";

export type StaffHrAlert = {
  kind: HrAlertKind;
  label: string;
  severity: HrAlertSeverity;
  band?: HrExpiryBand;
  days?: number | null;
};

function bandSeverity(band: HrExpiryBand): HrAlertSeverity | null {
  if (band === "expired") return "expired";
  if (band === "0_30") return "urgent";
  if (band === "31_60") return "watch";
  return null;
}

function severityLabel(severity: HrAlertSeverity): string {
  switch (severity) {
    case "expired":
      return "Expired";
    case "critical":
      return "Critical";
    case "urgent":
      return "Urgent ≤30d";
    case "watch":
      return "Watch ≤60d";
    default:
      return "Info";
  }
}

export function hrAlertSeverityLabel(severity: HrAlertSeverity): string {
  return severityLabel(severity);
}

/** Build display alerts for one employee. Empty = clean (no badges). */
export function staffHrAlerts(s: StaffRow, today = qatarTodayYmd()): StaffHrAlert[] {
  const alerts: StaffHrAlert[] = [];

  const qidBand = expiryBand(today, s.qid_expiry);
  const qidSev = bandSeverity(qidBand);
  if (qidSev) {
    alerts.push({
      kind: "qid",
      label: qidSev === "expired" ? "QID expired" : "QID",
      severity: qidSev === "expired" ? "expired" : qidSev,
      band: qidBand,
    });
  }

  const passBand = expiryBand(today, s.passport_expiry);
  const passSev = bandSeverity(passBand);
  if (passSev) {
    alerts.push({
      kind: "passport",
      label: passSev === "expired" ? "Passport expired" : "Passport",
      severity: passSev === "expired" ? "expired" : passSev,
      band: passBand,
    });
  }

  const contractBand = expiryBand(today, s.contract_end);
  const contractSev = bandSeverity(contractBand);
  if (contractSev) {
    alerts.push({
      kind: "contract",
      label: contractSev === "expired" ? "Contract expired" : "Contract",
      severity: contractSev === "expired" ? "expired" : contractSev,
      band: contractBand,
    });
  }

  const visaBand = expiryBand(today, s.visa_expiry);
  const visaSev = bandSeverity(visaBand);
  if (visaSev) {
    alerts.push({
      kind: "visa",
      label: visaSev === "expired" ? "Work permit expired" : "Work permit",
      severity: visaSev === "expired" ? "expired" : visaSev,
      band: visaBand,
    });
  }

  if (!s.qid || !s.phone || !s.hire_date) {
    alerts.push({ kind: "missing", label: "Missing info", severity: "info" });
  }

  if (normalizeDirectoryStatus(s.status) === "probation") {
    alerts.push({ kind: "probation", label: "Probation", severity: "watch" });
  }

  return alerts;
}

export type HrAttentionBucket = {
  key: string;
  title: string;
  count: number;
  /** Query fragment applied when navigating to Employees */
  filter: { expiry?: string; missing?: boolean; status?: string; attention?: string };
  severity: HrAlertSeverity;
};

const NEW_JOINER_DAYS = 90;

function daysSince(today: string, ymd: string | null | undefined): number | null {
  if (!ymd?.trim()) return null;
  const a = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function isNewJoiner(s: StaffRow, today = qatarTodayYmd()): boolean {
  const d = daysSince(today, s.hire_date);
  return d != null && d >= 0 && d <= NEW_JOINER_DAYS;
}

export function isExitingStaff(s: StaffRow): boolean {
  return (
    isResignedStaffStatus(s.status) ||
    isTerminatedStaffStatus(s.status) ||
    isServingNoticeStaffStatus(s.status)
  );
}

/** Overview attention buckets — clickable into Employees with filters. */
export function computeHrAttention(staff: StaffRow[], today = qatarTodayYmd()): HrAttentionBucket[] {
  let qidExpired = 0;
  let qidUrgent = 0;
  let passportExpired = 0;
  let passportUrgent = 0;
  let contractExp = 0;
  let visaExp = 0;
  let missing = 0;
  let probation = 0;

  for (const s of staff) {
    const qb = expiryBand(today, s.qid_expiry);
    if (qb === "expired") qidExpired += 1;
    else if (qb === "0_30") qidUrgent += 1;
    const pb = expiryBand(today, s.passport_expiry);
    if (pb === "expired") passportExpired += 1;
    else if (pb === "0_30") passportUrgent += 1;
    const cb = expiryBand(today, s.contract_end);
    if (cb === "expired" || cb === "0_30") contractExp += 1;
    const vb = expiryBand(today, s.visa_expiry);
    if (vb === "expired" || vb === "0_30") visaExp += 1;
    if (!s.qid || !s.phone || !s.hire_date) missing += 1;
    if (normalizeDirectoryStatus(s.status) === "probation") probation += 1;
  }

  return [
    {
      key: "qid_expired",
      title: "QID expired",
      count: qidExpired,
      filter: { expiry: "qid_expired" },
      severity: "expired",
    },
    {
      key: "qid_urgent",
      title: "QID expiring ≤30 days",
      count: qidUrgent,
      filter: { expiry: "qid_expiring" },
      severity: "urgent",
    },
    {
      key: "passport_expired",
      title: "Passport expired",
      count: passportExpired,
      filter: { expiry: "passport_expired" },
      severity: "expired",
    },
    {
      key: "passport_urgent",
      title: "Passport expiring ≤30 days",
      count: passportUrgent,
      filter: { expiry: "passport_expiring" },
      severity: "urgent",
    },
    {
      key: "contract",
      title: "Contract expiring / expired",
      count: contractExp,
      filter: { expiry: "contract_expiring" },
      severity: "urgent",
    },
    {
      key: "visa",
      title: "Work permit expiring / expired",
      count: visaExp,
      filter: { expiry: "visa_expiring" },
      severity: "urgent",
    },
    {
      key: "missing",
      title: "Missing info",
      count: missing,
      filter: { missing: true },
      severity: "info",
    },
    {
      key: "probation",
      title: "On probation",
      count: probation,
      filter: { status: "probation" },
      severity: "watch",
    },
  ];
}

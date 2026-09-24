/**
 * HR document expiry bands for directory KPIs / badges.
 * Bands: Expired | 0-30 | 31-60 | 61-90 | Valid
 */

import { daysUntilExpiry } from "@/lib/hr-document-expiry";

export const HR_EXPIRY_BANDS = ["expired", "0_30", "31_60", "61_90", "valid", "unknown"] as const;
export type HrExpiryBand = (typeof HR_EXPIRY_BANDS)[number];

export function expiryBand(todayYmd: string, expiryYmd: string | null | undefined): HrExpiryBand {
  if (!expiryYmd?.trim()) return "unknown";
  const days = daysUntilExpiry(todayYmd.slice(0, 10), expiryYmd.slice(0, 10));
  if (!Number.isFinite(days)) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "0_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "valid";
}

/** True when expiry is past or within the next 30 days (inclusive). */
export function isExpiringSoon(todayYmd: string, expiryYmd: string | null | undefined): boolean {
  const band = expiryBand(todayYmd, expiryYmd);
  return band === "expired" || band === "0_30";
}

export function qatarTodayYmd(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

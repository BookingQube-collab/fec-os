/**
 * Qatar salary package helpers: fixed split (basic / housing / transport)
 * plus optional custom titled extras managed by HR / HOO / Admin.
 */

import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import type { AppRole } from "@/lib/rbac";

export type SalaryExtra = {
  id: string;
  title: string;
  amountQar: number;
};

/** Persistable shape stored on staff_compensation.extras and allowances.extras. */
export type SalaryExtraRow = {
  id: string;
  title: string;
  amount_qar: number;
};

const RESERVED_ALLOWANCE_KEYS = new Set([
  "housing",
  "transportation",
  "transport",
  "food",
  "other",
  "extras",
]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

function asTitle(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function asId(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** Normalize DB / API extras into typed rows (drops empty titles). */
export function parseSalaryExtras(raw: unknown): SalaryExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: SalaryExtra[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const title = asTitle(record.title ?? record.label ?? record.name);
    if (!title) continue;
    const amount =
      asMoney(record.amount_qar) ??
      asMoney(record.amountQar) ??
      asMoney(record.amount) ??
      0;
    out.push({
      id: asId(record.id, `extra-${i + 1}`),
      title,
      amountQar: amount,
    });
  }
  return out;
}

export function serializeSalaryExtras(extras: readonly SalaryExtra[]): SalaryExtraRow[] {
  return extras.map((extra) => ({
    id: extra.id,
    title: extra.title,
    amount_qar: round2(Math.max(0, Number(extra.amountQar) || 0)),
  }));
}

export function sumSalaryExtras(extras: readonly SalaryExtra[]): number {
  return round2(extras.reduce((sum, extra) => sum + (Number(extra.amountQar) || 0), 0));
}

/** Package total used for staff_compensation.monthly_salary_qar. */
export function salaryPackageTotal(parts: {
  basicQar?: number | null;
  housingQar?: number | null;
  transportQar?: number | null;
  extras?: readonly SalaryExtra[];
}): number {
  const basic = asMoney(parts.basicQar) ?? 0;
  const housing = asMoney(parts.housingQar) ?? 0;
  const transport = asMoney(parts.transportQar) ?? 0;
  return round2(basic + housing + transport + sumSalaryExtras(parts.extras ?? []));
}

/**
 * HR, Head of Operations (title), and Admin (CEO/COO) may add/edit/remove
 * custom titled extras. Other salary editors keep the fixed split only.
 */
export function canManageSalaryCustomExtras(
  roles: readonly string[],
  jobTitle?: string | null,
): boolean {
  if (isHeadOfOperationsTitle(jobTitle)) return true;
  const list = roles as AppRole[];
  return list.some((role) => role === "hr" || role === "ceo" || role === "coo");
}

/** Keys reserved for the fixed allowance split — not used as custom titles. */
export function isReservedAllowanceKey(title: string): boolean {
  return RESERVED_ALLOWANCE_KEYS.has(title.trim().toLowerCase());
}

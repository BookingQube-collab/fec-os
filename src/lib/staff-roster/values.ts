import type { EmploymentType, StaffRoleValue } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeQid(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\s+/g, "").trim();
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) return digits;
  return digits;
}

export function normalizePhoneMatch(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+974${digits}`;
  if (digits.length === 11 && digits.startsWith("974")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("974")) return `+${digits.slice(-11)}`;
  if (digits.startsWith("974") && digits.length >= 11) return `+974${digits.slice(-8)}`;
  return `+${digits}`;
}

export function formatPhoneDisplay(value: string | null | undefined): string | null {
  const match = normalizePhoneMatch(value);
  return match;
}

export function parseE3Flag(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "yes" || s === "y" || s === "true" || s === "1") return true;
  if (s === "no" || s === "n" || s === "false" || s === "0") return false;
  return null;
}

export function parseEmploymentType(raw: string | null | undefined): {
  type: EmploymentType | null;
  unknown: boolean;
} {
  if (raw == null) return { type: null, unknown: false };
  const s = String(raw).trim().toLowerCase();
  if (!s) return { type: null, unknown: false };
  if (s === "permanent") return { type: "permanent", unknown: false };
  if (s === "temporary" || s === "temp") return { type: "temporary", unknown: false };
  return { type: null, unknown: true };
}

export function parseRosterStatus(raw: string | null | undefined): {
  status: "active" | "inactive" | "on_leave" | null;
  blank: boolean;
} {
  if (raw == null || !String(raw).trim()) return { status: null, blank: true };
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "active") return { status: "active", blank: false };
  if (s === "inactive") return { status: "inactive", blank: false };
  if (s === "on_leave" || s === "leave" || s === "vacation") return { status: "on_leave", blank: false };
  if (s === "terminated") return { status: "inactive", blank: false };
  return { status: null, blank: false };
}

export function mapPositionToStaffRole(position: string | null | undefined): StaffRoleValue | null {
  if (!position?.trim()) return null;
  const s = position.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (s.includes("venue supervisor") || s === "supervisor") return "venue_supervisor";
  if (s.includes("shift lead")) return "shift_lead";
  if (s.includes("technician")) return "technician";
  if (s.includes("cleaner")) return "cleaner";
  if (s.includes("security")) return "security";
  if (s.includes("cashier")) return "cashier";
  if (s.includes("artist")) return "other";
  if (s.includes("crew") || s.includes("attendant")) return "crew";
  return "other";
}

export function parseSalaryQar(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export type ParsedHireDate = {
  iso: string | null;
  warning: string | null;
  invalid: boolean;
};

export function parseHireDate(raw: string | null | undefined): ParsedHireDate {
  if (raw == null || !String(raw).trim()) {
    return { iso: null, warning: null, invalid: false };
  }
  const trimmed = String(raw).trim();

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    const mon = trimmed.match(/^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2,4})$/);
    if (mon) {
      day = Number(mon[1]);
      month = MONTHS[mon[2].toLowerCase()] ?? null;
      year = Number(mon[3]);
    }
  }

  if (year != null && year < 100) year += 2000;
  if (day == null || month == null || year == null || month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, warning: `Unrecognised joining date "${trimmed}"`, invalid: true };
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year < 1990 || year > 2100) {
    return { iso, warning: `Joining date year ${year} is outside 1990–2100`, invalid: false };
  }
  return { iso, warning: null, invalid: false };
}

export {
  generateEmployeeCode,
  generateSyntheticEmployeeCode,
  isPreservableEmployeeCode,
  isQidShapedCode,
} from "@/lib/staff-employee-code";

export function namesAreFuzzyMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right || left === right) return false;
  const aTokens = left.split(" ").filter(Boolean);
  const bTokens = right.split(" ").filter(Boolean);
  if (!aTokens.length || !bTokens.length) return false;
  if (aTokens[0] !== bTokens[0]) return false;
  const aLast = aTokens[aTokens.length - 1];
  const bLast = bTokens[bTokens.length - 1];
  if (aLast === bLast && aTokens.length > 1 && bTokens.length > 1) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  return false;
}

export function pickNonBlank<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  if (incoming == null || incoming === ("" as T)) {
    return existing ?? null;
  }
  return incoming;
}

export function stripSalary<T extends { monthly_salary_qar?: number | null }>(
  row: T,
  canView: boolean,
): Omit<T, "monthly_salary_qar"> & { monthly_salary_qar?: number | null } {
  if (canView) return row;
  const { monthly_salary_qar: _omit, ...rest } = row;
  return rest;
}

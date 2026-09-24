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
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return { type: null, unknown: false };
  if (s === "permanent") return { type: "permanent", unknown: false };
  if (s === "temporary" || s === "temp") return { type: "temporary", unknown: false };
  if (s === "secondment" || s === "seconded") return { type: "secondment", unknown: false };
  if (s === "joker") return { type: "joker", unknown: false };
  return { type: null, unknown: true };
}

export function parseRosterStatus(raw: string | null | undefined): {
  status: import("./types").StaffDirectoryStatus | null;
  blank: boolean;
} {
  if (raw == null || !String(raw).trim()) return { status: null, blank: true };
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "active") return { status: "active", blank: false };
  if (s === "probation") return { status: "probation", blank: false };
  if (s === "secondment" || s === "seconded") return { status: "secondment", blank: false };
  if (s === "remote") return { status: "remote", blank: false };
  if (s === "vacation" || s === "annual_leave") return { status: "vacation", blank: false };
  if (s === "sick_leave" || s === "sick") return { status: "sick_leave", blank: false };
  if (s === "unpaid_leave") return { status: "unpaid_leave", blank: false };
  if (s === "on_leave" || s === "leave") return { status: "on_leave", blank: false };
  if (s === "resigned" || s === "resignation") return { status: "resigned", blank: false };
  if (s === "terminated" || s === "termination") return { status: "terminated", blank: false };
  if (s === "released" || s === "release") return { status: "released", blank: false };
  if (s === "serving_notice") return { status: "serving_notice", blank: false };
  if (s === "inactive") return { status: "inactive", blank: false };
  return { status: null, blank: false };
}

/** Map E3 sheet membership → default status / employment type / roaming. */
export function statusFromE3Sheet(
  sheet: string | null | undefined,
): {
  status: import("./types").StaffDirectoryStatus;
  employmentType: import("./types").EmploymentType | null;
  isRoaming: boolean | null;
} {
  const n = (sheet ?? "").toLowerCase();
  if (n.includes("secondment")) {
    return { status: "secondment", employmentType: "secondment", isRoaming: null };
  }
  if (n.includes("remote")) {
    return { status: "remote", employmentType: null, isRoaming: true };
  }
  if (n.includes("resigned") || n.includes("terminated")) {
    return { status: "terminated", employmentType: null, isRoaming: null };
  }
  return { status: "active", employmentType: null, isRoaming: null };
}

export function parseGender(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "m" || s === "male") return "male";
  if (s === "f" || s === "female") return "female";
  if (s === "other") return "other";
  return s;
}

export function parseTicketMonths(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number.parseInt(String(raw).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return n;
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
    // E3 Excel sometimes has US M/D/YY (e.g. 7/21/27). Qatar sheets use D/M/Y.
    // If the second number can't be a month, treat as M/D/Y.
    if (month > 12 && day >= 1 && day <= 12) {
      const swap = day;
      day = month;
      month = swap;
    }
  } else {
    const mon = trimmed.match(/^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2,4})$/);
    if (mon) {
      day = Number(mon[1]);
      month = MONTHS[mon[2].toLowerCase()] ?? null;
      year = Number(mon[3]);
    } else {
      // PDF / Excel print: "29 January 2023" or "25 April 1976"
      const long = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
      if (long) {
        day = Number(long[1]);
        month = MONTHS[long[2].toLowerCase()] ?? null;
        year = Number(long[3]);
      }
    }
  }

  if (year != null && year < 100) year += 2000;
  if (day == null || month == null || year == null || month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, warning: `Unrecognised joining date "${trimmed}"`, invalid: true };
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Shared by hire date + DOB + document expiry — allow mid-century birth years.
  if (year < 1940 || year > 2100) {
    return { iso, warning: `Joining date year ${year} is outside 1940–2100`, invalid: false };
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

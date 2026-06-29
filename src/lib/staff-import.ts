
export const BRANCH_CODES = ["KDS-CC", "KDS-DM", "INF-CC", "UA-DM", "CB-VM", "CB-DSM", "CAR-AP"] as const;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};


export function toQatarIso(date: string, time: string): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  return `${date}T${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}:00+03:00`;
}

export interface StaffImportRow {
  location_code: string;
  employee_code: string;
  full_name: string;
  job_title: string | null;
  department: string;
  hire_date: string | null;
  status: string;
  phone: string | null;
  email: string | null;
}

export function parseStaffImportRows(rows: Record<string, string>[]): StaffImportRow[] {
  return rows.map((r, i) => {
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const full_name = r.full_name;
    if (!location_code || !employee_code || !full_name) {
      throw new Error(`Row ${i + 2}: location_code, employee_code, and full_name are required`);
    }
    if (!BRANCH_CODES.includes(location_code as (typeof BRANCH_CODES)[number])) {
      throw new Error(`Row ${i + 2}: unknown location_code "${location_code}"`);
    }
    return {
      location_code,
      employee_code,
      full_name,
      job_title: r.job_title || null,
      department: r.department || r.activity || "Operations",
      hire_date: r.hire_date || null,
      status: r.status || "active",
      phone: r.phone || null,
      email: r.email || null,
    };
  });
}

export interface RosterImportRow {
  location_code: string;
  employee_code: string;
  date: string;
  start_time: string;
  end_time: string;
  role_label: string | null;
  status: string;
}

export function parseDatedRosterRows(rows: Record<string, string>[]): RosterImportRow[] {
  return rows.map((r, i) => {
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const date = r.date || r.shift_date;
    if (!location_code || !employee_code || !date) {
      throw new Error(`Row ${i + 2}: location_code, employee_code, and date are required`);
    }
    if (!BRANCH_CODES.includes(location_code as (typeof BRANCH_CODES)[number])) {
      throw new Error(`Row ${i + 2}: unknown location_code "${location_code}"`);
    }
    return {
      location_code,
      employee_code,
      date,
      start_time: r.start_time || "09:00",
      end_time: r.end_time || "17:00",
      role_label: r.role_label || null,
      status: r.status || "scheduled",
    };
  });
}

export const STAFF_IMPORT_HEADERS = [
  "location_code",
  "employee_code",
  "full_name",
  "job_title",
  "department",
  "hire_date",
  "status",
  "phone",
  "email",
] as const;

export const ROSTER_DATED_IMPORT_HEADERS = [
  "location_code",
  "employee_code",
  "date",
  "start_time",
  "end_time",
  "role_label",
  "status",
] as const;

export const ROSTER_WEEKLY_IMPORT_HEADERS = [
  "location_code",
  "employee_code",
  "weekday",
  "start_time",
  "end_time",
  "role_label",
] as const;

const STAFF_SAMPLE_ROW: Record<(typeof STAFF_IMPORT_HEADERS)[number], string> = {
  location_code: "KDS-CC",
  employee_code: "KDS-CC-BM",
  full_name: "Hassan Al-Kaabi",
  job_title: "Branch Manager",
  department: "Operations",
  hire_date: "2022-03-15",
  status: "active",
  phone: "+97430000006",
  email: "kds.cc.bm@fec.qa",
};

const ROSTER_DATED_SAMPLE_ROW: Record<(typeof ROSTER_DATED_IMPORT_HEADERS)[number], string> = {
  location_code: "KDS-CC",
  employee_code: "KDS-CC-BM",
  date: "2026-06-01",
  start_time: "09:00",
  end_time: "17:00",
  role_label: "Branch Manager",
  status: "scheduled",
};

const ROSTER_WEEKLY_SAMPLE_ROW: Record<(typeof ROSTER_WEEKLY_IMPORT_HEADERS)[number], string> = {
  location_code: "KDS-CC",
  employee_code: "KDS-CC-BM",
  weekday: "sun",
  start_time: "09:00",
  end_time: "17:00",
  role_label: "Branch Manager",
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildSampleCsv(headers: readonly string[], sampleRow: Record<string, string>): string {
  const headerLine = headers.join(",");
  const sampleLine = headers.map((h) => escapeCsvCell(sampleRow[h] ?? "")).join(",");
  return `${headerLine}\n${sampleLine}\n`;
}

export function buildStaffSampleCsv(): string {
  return buildSampleCsv(STAFF_IMPORT_HEADERS, STAFF_SAMPLE_ROW);
}

export function buildRosterDatedSampleCsv(): string {
  return buildSampleCsv(ROSTER_DATED_IMPORT_HEADERS, ROSTER_DATED_SAMPLE_ROW);
}

export function buildRosterWeeklySampleCsv(): string {
  return buildSampleCsv(ROSTER_WEEKLY_IMPORT_HEADERS, ROSTER_WEEKLY_SAMPLE_ROW);
}

export function downloadCsvContent(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function expandWeeklyRoster(
  rows: Record<string, string>[],
  year: number,
  month: number,
): RosterImportRow[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const out: RosterImportRow[] = [];
  for (const r of rows) {
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const weekday = WEEKDAYS[(r.weekday || "").toLowerCase()];
    if (!location_code || !employee_code || weekday === undefined) {
      throw new Error("Weekly roster rows need location_code, employee_code, and weekday");
    }
    const start_time = r.start_time || "09:00";
    const end_time = r.end_time || "17:00";
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+03:00`);
      if (d.getUTCDay() !== weekday) continue;
      out.push({
        location_code,
        employee_code,
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        start_time,
        end_time,
        role_label: r.role_label || null,
        status: "scheduled",
      });
    }
  }
  return out;
}

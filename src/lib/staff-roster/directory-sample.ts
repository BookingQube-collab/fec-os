import { toCsv } from "@/lib/csv-parse";
import { formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";

export const DIRECTORY_SAMPLE_HEADERS = [
  "employee_code",
  "full_name",
  "qid",
  "location",
  "location_name",
  "position",
  "type",
  "e3",
  "contact",
  "joining date",
  "status",
] as const;

export const DIRECTORY_SAMPLE_SALARY_HEADER = "salary";

export type DirectorySampleStaff = {
  employee_code: string | null;
  full_name: string | null;
  qid: string | null;
  locationCode: string;
  locationName?: string | null;
  job_title?: string | null;
  employment_type?: string | null;
  e3_enrolled?: boolean | null;
  phone?: string | null;
  hire_date?: string | null;
  status?: string | null;
  monthly_salary_qar?: number | null;
};

function formatE3(value: boolean | null | undefined): string {
  if (value == null) return "";
  return value ? "Yes" : "No";
}

export function buildDirectorySampleCsv(
  staff: DirectorySampleStaff[],
  options?: { includeSalary?: boolean },
): string {
  const includeSalary = Boolean(options?.includeSalary);
  const headers = includeSalary
    ? [...DIRECTORY_SAMPLE_HEADERS, DIRECTORY_SAMPLE_SALARY_HEADER]
    : [...DIRECTORY_SAMPLE_HEADERS];
  const rows = staff.map((person) => {
    const cells: Array<string | number | null> = [
      person.employee_code ?? "",
      person.full_name ?? "",
      person.qid ?? "",
      formatLocationLabel(person.locationCode, person.locationName || rosterSheetLabel(person.locationCode)),
      person.locationName || rosterSheetLabel(person.locationCode),
      person.job_title ?? "",
      person.employment_type ?? "",
      formatE3(person.e3_enrolled),
      person.phone ?? "",
      person.hire_date ?? "",
      person.status ?? "",
    ];
    if (includeSalary) cells.push(person.monthly_salary_qar ?? "");
    return cells;
  });
  return toCsv(headers, rows);
}

export function directorySampleFilename(locationCode: string | null): string {
  const loc = locationCode ? locationCode.toLowerCase() : "all";
  return `employee-roster-sample-${loc}.csv`;
}

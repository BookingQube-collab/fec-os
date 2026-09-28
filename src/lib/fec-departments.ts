/** FEC site department catalog. Head-office departments are a separate audience. */

export type FecDepartmentSpec = {
  name: string;
  code: string;
  sortOrder: number;
  parentName?: string;
};

export const FEC_DEPARTMENT_CATALOG: readonly FecDepartmentSpec[] = [
  { name: "Managing Director / Chief Executive Officer", code: "MD_CEO", sortOrder: 1000 },
  { name: "General Manager", code: "GM", sortOrder: 1010 },
  { name: "FEC Operations", code: "FEC_OPS", sortOrder: 1020 },
  { name: "Sr. Site Supervisor", code: "SR_SITE_SUP", sortOrder: 1030 },
  { name: "Site Supervisor", code: "SITE_SUP", sortOrder: 1040 },
  { name: "AV Specialist / FEC Supervisor", code: "AV_FEC_SUP", sortOrder: 1050 },
  { name: "FEC Arcade Technician", code: "ARCADE_TECH", sortOrder: 1060 },
  { name: "Team Leader", code: "TEAM_LEAD", sortOrder: 1070 },
  { name: "Crew / Attendant", code: "CREW", sortOrder: 1080 },
  { name: "Cashier", code: "CASHIER", sortOrder: 1090 },
  { name: "Maintenance Assistant / Electrician", code: "MAINT_ELEC", sortOrder: 1100 },
  { name: "Artist", code: "ARTIST", sortOrder: 1110 },
  { name: "Cleaner", code: "CLEANER", sortOrder: 1120 },
  { name: "F&B", code: "FB", sortOrder: 1130 },
  { name: "F&B Manager", code: "FB_MANAGER", sortOrder: 1140, parentName: "F&B" },
  { name: "F&B Supervisor", code: "FB_SUPERVISOR", sortOrder: 1150, parentName: "F&B" },
  { name: "Head Chef", code: "HEAD_CHEF", sortOrder: 1160, parentName: "F&B" },
  { name: "Barista", code: "BARISTA", sortOrder: 1170, parentName: "F&B" },
  { name: "Chef", code: "CHEF", sortOrder: 1180, parentName: "F&B" },
  { name: "F&B Cashier", code: "FB_CASHIER", sortOrder: 1190, parentName: "F&B" },
] as const;

const CATALOG_BY_NORM = new Map(
  FEC_DEPARTMENT_CATALOG.map((row) => [normalizeLabel(row.name), row.name]),
);

/** Job titles that are the same role under a different label already used on site. */
const TITLE_ALIASES: Record<string, string> = {
  "venue supervisor": "Site Supervisor",
  attendant: "Crew / Attendant",
};

const FB_CASHIER_DEPARTMENTS = new Set(["f&b", "f&b cafe", "f&b operations"]);

export function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ");
}

/**
 * Closest FEC department for a site employee.
 * Returns null when the title and department do not clearly match the catalog.
 * Head-office staff must not be passed through this — callers skip location HO.
 */
export function fecDepartmentForSiteStaff(
  jobTitle: string | null | undefined,
  department: string | null | undefined,
): string | null {
  const title = normalizeLabel(jobTitle);
  const fromTitle = CATALOG_BY_NORM.get(title) ?? TITLE_ALIASES[title] ?? null;
  if (fromTitle === "Cashier" && FB_CASHIER_DEPARTMENTS.has(normalizeLabel(department))) {
    return "F&B Cashier";
  }
  if (fromTitle) return fromTitle;

  // Compound titles (Cashier / Attendant, Pastry Chef, Shift Lead) are not guessed.
  if (title.includes("/")) return null;
  if (title) return null;

  const fromDepartment = CATALOG_BY_NORM.get(normalizeLabel(department));
  return fromDepartment ?? null;
}

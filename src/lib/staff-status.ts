function normalizeStaffStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** Blank / null roster status defaults to active — same as the Employee Roster import. */
export function isActiveStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "" || s === "active";
}

export function isOnLeaveStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "on_leave" || s === "leave" || s === "vacation";
}

export function isTerminatedStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "terminated" || s === "inactive";
}

/** Active roster for payroll: active, on leave, or blank. Excludes terminated/archived. */
export function isActiveRosterStaff(status: string | null | undefined): boolean {
  return isActiveStaffStatus(status) || isOnLeaveStaffStatus(status);
}

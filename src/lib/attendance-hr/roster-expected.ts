export type RosterAssignmentRow = {
  staff_id: string;
  work_date: string;
  shift_template_id: string | null;
  is_week_off: boolean;
};

export type RosterCoveragePeriod = {
  start: string;
  end: string;
};

export function isWorkDateCovered(
  workDate: string,
  periods: RosterCoveragePeriod[],
): boolean {
  return periods.some((p) => workDate >= p.start && workDate <= p.end);
}

/**
 * Who is expected on a given day at a site.
 * - Assignments that day win (including week-off).
 * - If the day sits in an uploaded week/month with nobody listed, nobody is expected.
 * - Otherwise fall back to home + roaming staff (legacy tally).
 */
export function expectedRowsForDay(input: {
  workDate: string;
  dayRoster: RosterAssignmentRow[];
  fallbackStaffIds: string[];
  coveredByUpload: boolean;
}): RosterAssignmentRow[] {
  if (input.dayRoster.length > 0) return input.dayRoster;
  if (input.coveredByUpload) return [];
  return input.fallbackStaffIds.map((staffId) => ({
    staff_id: staffId,
    work_date: input.workDate,
    shift_template_id: null,
    is_week_off: false,
  }));
}

/** On-duty staff only — week-off does not count as Absent. */
export function expectedOnDutyStaffIds(dayRoster: RosterAssignmentRow[]): string[] {
  return dayRoster.filter((row) => !row.is_week_off).map((row) => row.staff_id);
}

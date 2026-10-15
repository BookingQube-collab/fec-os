import { isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { summarizeLeaveBalances } from "@/lib/hr-advanced";
import { isManagerTeamSupervisor } from "@/lib/manager-supervisor-team";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { rosterChartTeamIds } from "@/lib/reporting-manager-locations";

/** Statuses the HR dashboard already counts as present today. */
const PRESENT_DAY_STATUSES = new Set([
  "present",
  "late",
  "overtime",
  "early_leave",
  "early_departure",
  "short_hours",
]);

export type TeamTodayStatus = "present" | "annual_leave" | "sick_leave" | "not_present";

export type TeamTodayLeave = {
  leaveType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

export type TeamTodayMember = {
  staffId: string;
  name: string;
  jobTitle: string | null;
  homeLocationId?: string | null;
  extraLocationIds?: readonly (string | null | undefined)[] | null;
  reportingManagerStaffId?: string | null;
  /** False omits the person. The reporting walk still continues through them. */
  assignable?: boolean;
};

export type TeamTodayAnnualBalance = {
  staffId: string;
  allottedDays: number;
  carriedForwardDays?: number;
  expiredDays?: number;
  pendingDays?: number;
  usedDays: number;
};

export type TeamTodayPunchRow = {
  punchCount?: number | null;
  status?: string | null;
  actualIn?: string | null;
};

/**
 * HR and admin already see the whole company.
 * A site supervisor, venue supervisor, branch GM, or duty manager stays on their subtree.
 */
export function teamTodayCompanyWide(roles: readonly string[]): boolean {
  const list = roles as AppRole[];
  return list.includes("hr") || canUserDo(list, "admin.view");
}

/**
 * Operations home and the employee landing page for a supervisor who is not HR or admin.
 * Branch GM and duty manager are the supervisor dashboards. A supervisor job title or
 * venue-supervisor role is the same audience when the login role is front-line.
 */
export function showsSupervisorTeamToday(
  roles: readonly string[],
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  if (teamTodayCompanyWide(roles)) return false;
  const list = roles as AppRole[];
  if (list.includes("branch_gm") || list.includes("duty_manager")) return true;
  return isSiteSupervisorTitle(jobTitle, staffRole) || isManagerTeamSupervisor(jobTitle, staffRole);
}

/**
 * A punch today, using the attendance day already stored for that person.
 * Check-in is an in-punch or a present-style daily status. An excluded punch is not passed in.
 */
export function attendanceRowCountsAsPresent(row: TeamTodayPunchRow): boolean {
  if (Number(row.punchCount ?? 0) > 0) return true;
  if (row.actualIn) return true;
  return PRESENT_DAY_STATUSES.has(String(row.status ?? ""));
}

function coversToday(leave: TeamTodayLeave, today: string): boolean {
  if (leave.status !== "approved") return false;
  const from = leave.dateFrom.slice(0, 10);
  const to = leave.dateTo.slice(0, 10);
  return Boolean(from) && Boolean(to) && from <= today && to >= today;
}

/**
 * Approved sick leave covering today, then approved annual leave, then a punch.
 * Pending leave stays off this list. Any other approved type does not become annual or sick.
 */
export function classifyTeamTodayStatus(input: {
  punched: boolean;
  leaves: readonly TeamTodayLeave[];
  today: string;
}): TeamTodayStatus {
  const covering = input.leaves.filter((leave) => coversToday(leave, input.today));
  if (covering.some((leave) => leave.leaveType === "sick")) return "sick_leave";
  if (covering.some((leave) => leave.leaveType === "annual")) return "annual_leave";
  if (input.punched) return "present";
  return "not_present";
}

export function annualRemainingDays(balance: Omit<TeamTodayAnnualBalance, "staffId"> | null | undefined): number | null {
  if (!balance) return null;
  const [row] = summarizeLeaveBalances(
    [
      {
        leaveType: "annual",
        allottedDays: balance.allottedDays,
        carriedForwardDays: balance.carriedForwardDays,
        expiredDays: balance.expiredDays,
        pendingDays: balance.pendingDays,
      },
    ],
    { annual: balance.usedDays },
  );
  return row?.remainingDays ?? null;
}

export type TeamTodayRow = {
  staffId: string;
  name: string;
  jobTitle: string | null;
  status: TeamTodayStatus;
  annualRemaining: number | null;
};

export type TeamTodayGroup = {
  locationId: string | null;
  label: string;
  people: TeamTodayRow[];
};

export type TeamTodayView = {
  today: string;
  companyWide: boolean;
  singleLocation: boolean;
  groups: TeamTodayGroup[];
};

function assignedLocationIds(person: TeamTodayMember): string[] {
  const ids = new Set<string>();
  if (person.homeLocationId) ids.add(person.homeLocationId);
  for (const id of person.extraLocationIds ?? []) {
    if (id) ids.add(id);
  }
  return [...ids];
}

function memberIds(input: {
  viewerStaffId: string | null;
  companyWide: boolean;
  people: readonly TeamTodayMember[];
}): string[] {
  if (input.companyWide) {
    return input.people
      .filter((person) => person.staffId && person.assignable !== false)
      .map((person) => person.staffId)
      .sort();
  }
  return rosterChartTeamIds(input.viewerStaffId, input.people);
}

/**
 * Team for today, grouped by home site and extra dedicated sites.
 * One site stays a single list. Empty branches are omitted.
 * A person assigned to more than one of those sites is listed under each of them.
 */
export function buildTeamToday(input: {
  viewerStaffId: string | null;
  companyWide: boolean;
  today: string;
  people: readonly TeamTodayMember[];
  /**
   * Already resolved team ids (the monthly roster chart).
   * When set, the walk is not repeated, so a lead who is omitted from the
   * loaded rows does not hide the people under them.
   */
  staffIds?: readonly string[] | null;
  punchedStaffIds?: readonly string[];
  leaves?: readonly (TeamTodayLeave & { staffId: string })[];
  annualBalances?: readonly TeamTodayAnnualBalance[];
  locations?: readonly { id: string; label: string }[];
}): TeamTodayView {
  const included = new Set(
    input.staffIds
      ? input.staffIds.filter((id) => input.people.some((person) => person.staffId === id))
      : memberIds(input),
  );
  const punched = new Set(input.punchedStaffIds ?? []);
  const leavesByStaff = new Map<string, TeamTodayLeave[]>();
  for (const leave of input.leaves ?? []) {
    const list = leavesByStaff.get(leave.staffId) ?? [];
    list.push(leave);
    leavesByStaff.set(leave.staffId, list);
  }
  const balanceByStaff = new Map<string, TeamTodayAnnualBalance>();
  for (const balance of input.annualBalances ?? []) {
    if (balance.staffId) balanceByStaff.set(balance.staffId, balance);
  }
  const labelById = new Map((input.locations ?? []).map((site) => [site.id, site.label]));
  const byPerson = new Map(input.people.map((person) => [person.staffId, person]));

  const groups = new Map<string, TeamTodayGroup>();
  for (const staffId of included) {
    const person = byPerson.get(staffId);
    if (!person) continue;
    const row: TeamTodayRow = {
      staffId,
      name: person.name,
      jobTitle: person.jobTitle,
      status: classifyTeamTodayStatus({
        punched: punched.has(staffId),
        leaves: leavesByStaff.get(staffId) ?? [],
        today: input.today,
      }),
      annualRemaining: annualRemainingDays(balanceByStaff.get(staffId)),
    };
    const locationIds = assignedLocationIds(person);
    const keys = locationIds.length > 0 ? locationIds : [""];
    for (const locationId of keys) {
      const key = locationId || "";
      let group = groups.get(key);
      if (!group) {
        group = {
          locationId: locationId || null,
          label: locationId ? (labelById.get(locationId) ?? locationId) : "",
          people: [],
        };
        groups.set(key, group);
      }
      if (!group.people.some((existing) => existing.staffId === staffId)) group.people.push(row);
    }
  }

  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      people: [...group.people].sort((a, b) => a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId)),
    }))
    .sort((a, b) => {
      if (!a.locationId) return 1;
      if (!b.locationId) return -1;
      return a.label.localeCompare(b.label) || a.locationId.localeCompare(b.locationId);
    });

  return {
    today: input.today,
    companyWide: input.companyWide,
    singleLocation: ordered.length === 1,
    groups: ordered,
  };
}

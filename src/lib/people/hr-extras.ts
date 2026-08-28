import type { Capability } from "@/lib/rbac";

export type HrExtraVisibility = "hidden" | "visible_elsewhere";

export type HrExtraPage = {
  id: string;
  titleKey: string;
  reasonKey: string;
  path: string;
  canonicalPath: string;
  canonicalKey: string;
  visibility: HrExtraVisibility;
  capability: Capability;
};

/**
 * Duplicate or overlapping HR pages unhooked from the main People menu.
 * Routes still work so we can review and later delete the files.
 */
export const HR_EXTRA_PAGES: HrExtraPage[] = [
  {
    id: "ta-roster",
    titleKey: "people.extras.items.taRoster.title",
    reasonKey: "people.extras.items.taRoster.reason",
    path: "/people/attendance/roster",
    canonicalPath: "/people/import",
    canonicalKey: "nav.importRoster",
    visibility: "hidden",
    capability: "attendance.view",
  },
  {
    id: "people-attendance-tab",
    titleKey: "people.extras.items.peopleAttendance.title",
    reasonKey: "people.extras.items.peopleAttendance.reason",
    path: "/people?tab=attendance",
    canonicalPath: "/people/attendance/reports",
    canonicalKey: "nav.attendanceHr",
    visibility: "hidden",
    capability: "people.view_roster",
  },
  {
    id: "people-shifts-tab",
    titleKey: "people.extras.items.peopleShifts.title",
    reasonKey: "people.extras.items.peopleShifts.reason",
    path: "/people?tab=shifts",
    canonicalPath: "/people/import",
    canonicalKey: "nav.importRoster",
    visibility: "hidden",
    capability: "people.view_roster",
  },
  {
    id: "daily-ops-roster",
    titleKey: "people.extras.items.dailyOpsRoster.title",
    reasonKey: "people.extras.items.dailyOpsRoster.reason",
    path: "/daily-ops/roster",
    canonicalPath: "/people/import",
    canonicalKey: "nav.importRoster",
    visibility: "visible_elsewhere",
    capability: "daily_ops.view",
  },
];

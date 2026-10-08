"use server";

import { attendanceListingIsCompanyWide } from "@/lib/attendance-listing-access";
import { createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import {
  loadDirectReportStaffIds,
  loadReportingTreeStaffIds,
  loadTeamCoverageLocations,
  type DirectReportAccess,
  type TeamCoverageLocation,
} from "@/lib/reporting-manager-access.server";

export type { DirectReportAccess, TeamCoverageLocation };

/** Whether this login has at least one active direct report, and who they are. */
export const getMyDirectReports = createAuthenticatedActionNoInput(
  async (context): Promise<DirectReportAccess> => loadDirectReportStaffIds(context.userId),
  { auth: { anyCapability: ["hr.employee_app", "dashboard.view"] } },
);

export type AttendanceListingSites = {
  companyWide: boolean;
  sites: TeamCoverageLocation[];
};

/** Sites where a team leader's reporting line works. Company attendance roles keep the existing site list. */
export const getAttendanceListingSites = createAuthenticatedActionNoInput(
  async (context): Promise<AttendanceListingSites> => {
    if (attendanceListingIsCompanyWide(context.roles ?? [])) {
      return { companyWide: true, sites: [] };
    }
    const staffIds = await loadReportingTreeStaffIds(context.userId);
    if (staffIds.length === 0) return { companyWide: false, sites: [] };
    return { companyWide: false, sites: await loadTeamCoverageLocations(staffIds) };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

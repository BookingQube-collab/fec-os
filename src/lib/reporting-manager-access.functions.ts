"use server";

import { attendanceListingIsCompanyWide } from "@/lib/attendance-listing-access";
import { createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import {
  loadAttendanceListingStaffIds,
  loadDirectReportStaffIds,
  loadViewerScopedTeamLocations,
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
    // Same staff set as the listing (tree + viewer for supervisor/manager rollups).
    const { teamStaffIds } = await loadAttendanceListingStaffIds(context.userId);
    if (teamStaffIds.length === 0) return { companyWide: false, sites: [] };
    // Venue/Site: viewer's managed sites. Sr. Site: team span minus HO.
    return {
      companyWide: false,
      sites: await loadViewerScopedTeamLocations(context.userId, teamStaffIds),
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

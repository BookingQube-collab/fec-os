"use server";

import { attendanceListingIsCompanyWide } from "@/lib/attendance-listing-access";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { locationAccessIsCompanyWide } from "@/lib/reporting-manager-locations";
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
    const linked = await loadLinkedStaffRecord(context.userId);
    if (
      attendanceListingIsCompanyWide(context.roles ?? []) ||
      locationAccessIsCompanyWide(context.roles ?? [], linked?.jobTitle)
    ) {
      return { companyWide: true, sites: [] };
    }
    // Same staff set as the listing (tree + viewer for supervisor/manager rollups).
    const { teamStaffIds } = await loadAttendanceListingStaffIds(context.userId);
    if (teamStaffIds.length === 0) return { companyWide: false, sites: [] };
    // Venue/Site: managed sites. Sr. Site: subtree minus HO. F&B Manager: INF/KDS/UA.
    return {
      companyWide: false,
      sites: await loadViewerScopedTeamLocations(context.userId, teamStaffIds),
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

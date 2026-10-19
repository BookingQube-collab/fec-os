import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchMasterDepartments } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => fetchMasterDepartments(context),
    request,
    // Same caps as monthly roster — Venue Supervisors often reach the grid via
    // attendance.view / title gates without people.view_roster, and an empty
    // department catalog silently disables the Operations show-only filter.
    {
      anyCapability: [
        "people.view_roster",
        "people.import_roster",
        "people.edit_roster",
        "daily_ops.roster.upload",
        "attendance.view",
        "hr.employee_app",
      ],
    },
  );
}

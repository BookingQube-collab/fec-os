import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchShifts, fetchTraining, fetchAttendanceDailySummary, fetchAttendanceExceptions } from "@/lib/queries/people-extended.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId") || null;
      const view = params.get("view") ?? "shifts";
      if (view === "training") return fetchTraining(context, locationId);
      if (view === "attendance-summary") return fetchAttendanceDailySummary(context, locationId);
      if (view === "attendance-exceptions") return fetchAttendanceExceptions(context, locationId);
      return fetchShifts(context, locationId);
    },
    request,
    { capability: "people.view_roster" },
  );
}

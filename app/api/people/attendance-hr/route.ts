import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  getAttendanceHrBootstrap,
  getAttendanceHrDashboard,
  getAttendanceHrDaily,
  getAttendanceHrPunches,
  getAttendanceHrSite,
  listAttendanceCorrections,
  listAttendanceHrMappings,
  listAttendanceImports,
} from "@/lib/attendance-hr.functions";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const params = searchParams(req);
      const view = params.get("view") ?? "dashboard";
      const locationId = params.get("locationId") || null;
      const dateFrom = params.get("dateFrom") ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const dateTo = params.get("dateTo") ?? new Date().toISOString().slice(0, 10);
      const date = params.get("date") || undefined;
      if (view === "bootstrap") return getAttendanceHrBootstrap();
      if (view === "dashboard") {
        return getAttendanceHrDashboard({
          locationId,
          date,
          dateFrom: params.get("dateFrom") || undefined,
          dateTo: params.get("dateTo") || undefined,
          month: params.get("month") || undefined,
        });
      }
      if (view === "site" && locationId) return getAttendanceHrSite({ locationId });
      if (view === "daily") {
        const staffId = params.get("staffId") || null;
        return getAttendanceHrDaily({
          locationId,
          dateFrom,
          dateTo,
          status: params.get("status") || null,
          staffId,
          staffQ: params.get("staffQ")?.trim() || undefined,
        });
      }
      if (view === "punches") return getAttendanceHrPunches({ locationId, dateFrom, dateTo });
      if (view === "mappings") return listAttendanceHrMappings({ locationId, unmatchedOnly: params.get("unmatched") === "1" });
      if (view === "corrections") return listAttendanceCorrections({ locationId });
      if (view === "imports") return listAttendanceImports({ locationId });
      return getAttendanceHrDashboard({ locationId, date });
    },
    request,
    { capability: "attendance.view" },
  );
}

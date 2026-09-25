import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchStaff, fetchStaffDirectory } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const view = params.get("view");
      const pageParam = params.get("page");

      // Paginated directory (People Employees tab). Legacy array kept for other callers.
      if (view === "directory" || pageParam != null) {
        const pageSize = Number(params.get("pageSize") ?? "25");
        return fetchStaffDirectory(context, {
          locationId: params.get("locationId") || null,
          includeArchived: params.get("includeArchived") === "1",
          page: Number(pageParam ?? "1"),
          pageSize,
          q: params.get("q") ?? "",
          loc: params.get("loc") ?? "",
          department: params.get("department") ?? "",
          departmentName: params.get("departmentName") ?? "",
          position: params.get("position") ?? "",
          employmentType: params.get("employmentType") ?? params.get("type") ?? "",
          status: params.get("status") ?? "",
          nationality: params.get("nationality") ?? "",
          gender: params.get("gender") ?? "",
          sponsorship: params.get("sponsorship") ?? "",
          e3: params.get("e3") ?? "",
          missing: params.get("missing") === "1",
          expiry: params.get("expiry") ?? "",
          sort: (params.get("sort") as "name" | "code" | "location" | "joining" | "qid_expiry" | "passport_expiry") || "name",
        });
      }

      return fetchStaff(context, params.get("locationId") || null, {
        includeArchived: params.get("includeArchived") === "1",
      });
    },
    request,
    { capability: "people.view_roster" },
  );
}

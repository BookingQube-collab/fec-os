import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchUsersWithRoles } from "@/lib/queries/admin.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchUsersWithRoles(context), request, { capability: "admin.view" });
}

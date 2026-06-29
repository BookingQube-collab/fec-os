import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchBookingQubeSyncStatus } from "@/lib/queries/revenue.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchBookingQubeSyncStatus(context), request, { capability: "revenue.view" });
}

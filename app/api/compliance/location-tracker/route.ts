import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchLocationTrackerAlerts,
  fetchLocationTrackerItems,
  fetchLocationTrackerKpis,
} from "@/lib/queries/location-compliance.core";

function parseFilters(sp: URLSearchParams) {
  return {
    locationId: sp.get("locationId"),
    category: sp.get("category"),
    status: sp.get("status"),
    vendor: sp.get("vendor"),
    expiryBucket: sp.get("expiryBucket"),
    missingDocs: sp.get("missingDocs") === "1",
    outstandingPayment: sp.get("outstandingPayment") === "1",
    highRisk: sp.get("highRisk") === "1",
    requiredOnly: sp.get("requiredOnly") === "1",
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const sp = searchParams(req);
      const filters = parseFilters(sp);
      const mode = sp.get("mode");

      if (mode === "kpis") {
        return fetchLocationTrackerKpis(context, filters);
      }
      if (mode === "alerts") {
        return fetchLocationTrackerAlerts(context, filters);
      }
      return fetchLocationTrackerItems(context, filters);
    },
    request,
    { capability: "compliance.view" },
  );
}

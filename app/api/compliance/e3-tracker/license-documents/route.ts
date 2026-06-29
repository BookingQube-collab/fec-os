import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchE3TrackerLicenseDocuments,
  logE3TrackerPerf,
} from "@/lib/queries/e3-compliance-tracker.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const location = params.get("location") || "All";
      const field = params.get("field") || "All";
      const handlerStart = performance.now();
      const dbStart = performance.now();
      const payload = await fetchE3TrackerLicenseDocuments(context, { location, field });
      const dbMs = performance.now() - dbStart;
      const handlerMs = performance.now() - handlerStart;
      logE3TrackerPerf("license-documents", payload.stats.totalDocuments, handlerMs, dbMs);
      return payload;
    },
    request,
    { capability: "compliance.view" },
  );
}

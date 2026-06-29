import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchE3TrackerRegister,
  logE3TrackerPerf,
  parseE3TrackerFilters,
} from "@/lib/queries/e3-compliance-tracker.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const filters = parseE3TrackerFilters(searchParams(req));
      const handlerStart = performance.now();
      const dbStart = performance.now();
      const payload = await fetchE3TrackerRegister(context, filters);
      const dbMs = performance.now() - dbStart;
      const handlerMs = performance.now() - handlerStart;
      logE3TrackerPerf("register", payload.items.length, handlerMs, dbMs);
      return payload;
    },
    request,
    { capability: "compliance.view" },
  );
}

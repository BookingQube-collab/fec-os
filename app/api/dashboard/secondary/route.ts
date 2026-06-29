import { ForbiddenError } from "@/lib/server/authorize";
import {
  dashboardSecondaryQuerySchema,
  parseWithSchema,
  searchParamsToObject,
} from "@/core/api/validation";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { createTimer } from "@/lib/performance/timer";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";
import { canUserDo } from "@/lib/rbac";

const SECONDARY_CACHE_TTL_MS = 60_000;

export interface DashboardSecondaryPayload {
  charts?: Awaited<ReturnType<typeof import("@/lib/queries/dashboard-kpis.core").fetchDashboardCharts>>;
  complianceKpis?: Awaited<ReturnType<typeof import("@/lib/queries/compliance-kpis.core").fetchExecutiveComplianceKpis>>;
  renewals?: Awaited<ReturnType<typeof import("@/lib/queries/amc-queries.core").fetchComplianceRenewals>>;
}

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const query = parseWithSchema(
        dashboardSecondaryQuerySchema,
        searchParamsToObject(searchParams(req)),
      );
      const { include, locationId, year, utilityBase, renewalsLimit, locationCode } = query;

      const roles = context.roles ?? [];
      const needsComplianceView = include.has("renewals");
      if (needsComplianceView && !canUserDo(roles, "compliance.view")) {
        throw new ForbiddenError("Forbidden: missing capability compliance.view");
      }

      const cacheKey = routeCacheKey([
        "dashboard-secondary",
        context.userId,
        [...include].sort().join("+"),
        locationId,
        String(year),
        String(utilityBase ?? ""),
        locationCode,
        String(renewalsLimit),
      ]);
      const cached = getRouteCache<DashboardSecondaryPayload>(cacheKey);
      if (cached) return cached;

      const timer = createTimer("/api/dashboard/secondary", "parallel-fetch");
      const payload: DashboardSecondaryPayload = {};
      const tasks: Promise<void>[] = [];

      if (include.has("charts")) {
        tasks.push(
          import("@/lib/queries/dashboard-kpis.core").then(({ fetchDashboardCharts }) =>
            fetchDashboardCharts(context, { locationId, year, utilityBase }).then((data) => {
              payload.charts = data;
            }),
          ),
        );
      }
      if (include.has("complianceKpis")) {
        tasks.push(
          import("@/lib/queries/compliance-kpis.core").then(({ fetchExecutiveComplianceKpis }) =>
            fetchExecutiveComplianceKpis(context, locationId).then((data) => {
              payload.complianceKpis = data;
            }),
          ),
        );
      }
      if (include.has("renewals")) {
        tasks.push(
          import("@/lib/queries/amc-queries.core").then(({ fetchComplianceRenewals }) =>
            fetchComplianceRenewals(context, { locationCode, limit: renewalsLimit }).then((data) => {
              payload.renewals = data;
            }),
          ),
        );
      }

      await Promise.all(tasks);
      timer.end({
        rowCount:
          (payload.charts?.siteIssues.length ?? 0) +
          (payload.renewals?.length ?? 0) +
          (payload.complianceKpis ? 1 : 0),
      });

      setRouteCache(cacheKey, payload, SECONDARY_CACHE_TTL_MS);
      return payload;
    },
    request,
    { capability: "dashboard.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  }
  return response;
}

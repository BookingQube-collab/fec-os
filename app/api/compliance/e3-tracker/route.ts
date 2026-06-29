import { withAuthRouteRequest } from "@/lib/server/api-route";
import {
  createE3ComplianceItem,
  deleteE3ComplianceItem,
  updateE3ComplianceItem,
} from "@/lib/e3-compliance.functions";
import { fetchE3ComplianceItems } from "@/lib/queries/e3-compliance-tracker.core";
import { getRouteCache, routeCacheKey, setRouteCache, ROUTE_CACHE_TTL } from "@/lib/server/route-cache";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => {
      const cacheKey = routeCacheKey(["e3-compliance-items", context.userId]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchE3ComplianceItems>>>(cacheKey);
      if (cached) return cached;
      const payload = await fetchE3ComplianceItems(context);
      setRouteCache(cacheKey, payload, ROUTE_CACHE_TTL.lists);
      return payload;
    },
    request,
    { capability: "compliance.view" },
  );
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const body = await req.json();
      return createE3ComplianceItem(body);
    },
    request,
    { capability: "compliance.edit_e3_tracker" },
  );
}

export async function PUT(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const body = await req.json();
      return updateE3ComplianceItem(body);
    },
    request,
    { capability: "compliance.edit_e3_tracker" },
  );
}

export async function DELETE(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const body = await req.json();
      return deleteE3ComplianceItem(body);
    },
    request,
    { capability: "compliance.edit_e3_tracker" },
  );
}

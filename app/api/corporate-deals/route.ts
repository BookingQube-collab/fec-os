import { createApiRoute, searchParams } from "@/lib/server/api-route";
import {
  commitCorporateDealImport,
  deleteCorporateDealMomAction,
  fetchCorporateDealCodes,
  fetchCorporateDealMomActions,
  fetchCorporateDealPartners,
  fetchCorporateDealReport,
  fetchWeeklyLog,
  listCorporateDealWeeks,
  previewCorporateDealImport,
  saveCorporateDealCode,
  saveCorporateDealMomAction,
} from "@/lib/queries/corporate-deals.core";
import type { DealCategory, ImportKind } from "@/lib/corporate-deals/constants";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      const view = params.get("view") || "report";
      if (view === "weeks") return listCorporateDealWeeks(context);
      if (view === "partners") return fetchCorporateDealPartners(context);
      if (view === "codes") {
        return fetchCorporateDealCodes(context, { unmappedOnly: params.get("unmapped") === "1" });
      }
      if (view === "log") return fetchWeeklyLog(context, params.get("week"));
      if (view === "mom") return fetchCorporateDealMomActions(context);
      const week = params.get("week");
      if (!week) {
        const weeks = await listCorporateDealWeeks(context);
        if (!weeks.length) {
          return {
            iso_week: null,
            weeks: [],
            empty: true,
            partner_master: (await import("@/lib/corporate-deals/constants")).PARTNER_MASTER,
          };
        }
        return fetchCorporateDealReport(context, weeks[0]);
      }
      return fetchCorporateDealReport(context, week);
    },
    request,
    { capability: "corporate_deals.view" },
  );
}

export async function POST(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const body = (await req.json()) as Record<string, unknown>;
      const action = String(body.action ?? "preview");
      if (action === "preview") {
        return previewCorporateDealImport(context, {
          csv: String(body.csv ?? ""),
          kind: (body.kind as ImportKind) || "week",
          period: (body.period as string | null) ?? null,
        });
      }
      if (action === "commit") {
        return commitCorporateDealImport(context, {
          csv: String(body.csv ?? ""),
          kind: (body.kind as ImportKind) || "week",
          period: String(body.period ?? ""),
          replace: Boolean(body.replace),
        });
      }
      if (action === "save_code") {
        return saveCorporateDealCode(context, {
          id: body.id as string | undefined,
          promocode: String(body.promocode ?? ""),
          partner_name: (body.partner_name as string | null) ?? null,
          category: (body.category as DealCategory) || "Unmapped",
          venue: String(body.venue ?? "Not specified"),
          notes: (body.notes as string | null) ?? null,
        });
      }
      if (action === "save_mom") {
        return saveCorporateDealMomAction(context, {
          id: body.id as string | undefined,
          review_id: (body.review_id as string | null) ?? null,
          venue_text: (body.venue_text as string | null) ?? null,
          action: String(body.action_text ?? body.matter ?? ""),
          owner: (body.owner as string | null) ?? null,
          due: (body.due as string | null) ?? null,
          status: (body.status as "open" | "wip" | "done") || "open",
          update_note: (body.update_note as string | null) ?? null,
          sort_order: body.sort_order as number | undefined,
        });
      }
      if (action === "delete_mom") {
        return deleteCorporateDealMomAction(context, String(body.id ?? ""));
      }
      throw new Error(`Unknown action: ${action}`);
    },
    request,
    { capability: "corporate_deals.edit" },
  );
}

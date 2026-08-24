import { ApiValidationError } from "@/core/api/validation";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchI18nOverrides, upsertI18nOverride } from "@/lib/queries/i18n-overrides.core";

const LOCALES = new Set(["en", "ar"]);

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const locale = searchParams(req).get("locale") ?? "ar";
      if (!LOCALES.has(locale)) {
        throw new ApiValidationError("Unsupported locale.");
      }
      return { items: await fetchI18nOverrides(context, locale) };
    },
    request,
  );
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const body = (await req.json().catch(() => null)) as {
        locale?: string;
        key?: string;
        value?: string;
      } | null;
      if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
        throw new ApiValidationError("key and value are required.");
      }
      const item = await upsertI18nOverride(context, {
        locale: typeof body.locale === "string" ? body.locale : "ar",
        key: body.key,
        value: body.value,
      });
      return { item };
    },
    request,
    { capability: "admin.view" },
  );
}

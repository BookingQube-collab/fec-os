import { createApiRoute } from "@/lib/server/api-route";
import { fetchWeeklyReviewPack, saveWeeklyReviewPack } from "@/lib/queries/weekly-review.core";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createApiRoute(async (context) => fetchWeeklyReviewPack(context, id), request, {
    capability: "weekly_review.view",
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createApiRoute(
    async (context, req) => saveWeeklyReviewPack(context, id, await req.json()),
    request,
    { capability: "weekly_review.edit" },
  );
}

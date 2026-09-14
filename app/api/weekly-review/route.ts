import { createApiRoute } from "@/lib/server/api-route";
import { createNextWeeklyReview, fetchWeeklyReviewList } from "@/lib/queries/weekly-review.core";

export async function GET(request: Request) {
  return createApiRoute(async (context) => fetchWeeklyReviewList(context), request, {
    capability: "weekly_review.view",
  });
}

export async function POST(request: Request) {
  return createApiRoute(async (context) => createNextWeeklyReview(context), request, {
    capability: "weekly_review.edit",
  });
}

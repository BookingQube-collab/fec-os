import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import type {
  ReviewAction,
  ReviewAggregator,
  ReviewCorporate,
  ReviewDecision,
  ReviewIncident,
  ReviewLoyalty,
  ReviewPack,
  ReviewSocial,
  ReviewSummary,
  WeeklyReview,
} from "@/lib/weekly-review/model";
import { isCorporateDealsActionModule } from "@/lib/weekly-review/action-source";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asReview(row: Record<string, unknown>, name: string | null): WeeklyReview {
  return {
    id: String(row.id),
    week_label: String(row.week_label ?? ""),
    week_start: String(row.week_start),
    week_end: String(row.week_end),
    meeting_date: String(row.meeting_date),
    prepared_by: (row.prepared_by as string | null) ?? null,
    prepared_by_name: name,
    notes: (row.notes as string | null) ?? null,
    status: row.status === "presented" ? "presented" : "draft",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asSummary(row: Record<string, unknown>): ReviewSummary {
  const prev = (key: string) => (row[key] == null ? null : num(row[key]));
  return {
    review_id: String(row.review_id),
    week_start: String(row.week_start),
    week_label: String(row.week_label ?? ""),
    aggregator_redemptions: num(row.aggregator_redemptions),
    corporate_deals: num(row.corporate_deals),
    decisions_pending: num(row.decisions_pending),
    actions_open: num(row.actions_open),
    actions_total: num(row.actions_total),
    incidents: num(row.incidents),
    new_reviews: num(row.new_reviews),
    prev_aggregator_redemptions: prev("prev_aggregator_redemptions"),
    prev_corporate_deals: prev("prev_corporate_deals"),
    prev_decisions_pending: prev("prev_decisions_pending"),
    prev_actions_open: prev("prev_actions_open"),
    prev_actions_total: prev("prev_actions_total"),
    prev_incidents: prev("prev_incidents"),
    prev_new_reviews: prev("prev_new_reviews"),
  };
}

export interface ReviewListItem {
  review: WeeklyReview;
  summary: ReviewSummary | null;
}

export async function fetchWeeklyReviewList(context: AuthContext): Promise<ReviewListItem[]> {
  const { data: rows, error } = await context.supabase
    .from("weekly_reviews")
    .select("*")
    .order("week_start", { ascending: false });
  if (error) throw error;

  const { data: summaries, error: sumErr } = await context.supabase
    .from("weekly_review_summary")
    .select("*");
  if (sumErr) throw sumErr;
  const sumMap = new Map((summaries ?? []).map((s) => [String(s.review_id), asSummary(s)]));

  const ids = [...new Set((rows ?? []).map((r) => r.prepared_by).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.display_name ?? "");
  }

  return (rows ?? []).map((r) => ({
    review: asReview(r, r.prepared_by ? names.get(r.prepared_by) ?? null : null),
    summary: sumMap.get(String(r.id)) ?? null,
  }));
}

export async function fetchWeeklyReviewPack(context: AuthContext, id: string): Promise<ReviewPack> {
  const { data: row, error } = await context.supabase.from("weekly_reviews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("not found");

  const [
    decisions,
    aggregators,
    corporate,
    social,
    loyalty,
    actions,
    incidents,
    summaryRow,
    profile,
  ] = await Promise.all([
    context.supabase.from("weekly_review_decisions").select("*").eq("review_id", id).order("sort_order"),
    context.supabase.from("weekly_review_aggregators").select("*").eq("review_id", id),
    context.supabase.from("weekly_review_corporate").select("*").eq("review_id", id),
    context.supabase.from("weekly_review_social").select("*").eq("review_id", id),
    context.supabase.from("weekly_review_loyalty").select("*").eq("review_id", id),
    context.supabase.from("weekly_review_actions").select("*").eq("review_id", id).order("sort_order"),
    context.supabase.from("weekly_review_incidents").select("*").eq("review_id", id),
    context.supabase.from("weekly_review_summary").select("*").eq("review_id", id).maybeSingle(),
    row.prepared_by
      ? context.supabase.from("profiles").select("display_name").eq("id", row.prepared_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const part of [decisions, aggregators, corporate, social, loyalty, actions, incidents]) {
    if (part.error) throw part.error;
  }

  const pack: ReviewPack = {
    review: asReview(row, profile.data?.display_name ?? null),
    decisions: (decisions.data ?? []) as ReviewDecision[],
    aggregators: (aggregators.data ?? []).map((r) => ({
      ...r,
      redemptions: num(r.redemptions),
      saving_qar: num(r.saving_qar),
    })) as ReviewAggregator[],
    corporate: (corporate.data ?? []).map((r) => ({
      ...r,
      deals: num(r.deals),
      revenue_qar: num(r.revenue_qar),
    })) as ReviewCorporate[],
    social: (social.data ?? []).map((r) => ({
      ...r,
      google_rating: r.google_rating == null ? null : num(r.google_rating),
      total_reviews: num(r.total_reviews),
      new_reviews_campaign: num(r.new_reviews_campaign),
      new_reviews_organic: num(r.new_reviews_organic),
      ig_followers: num(r.ig_followers),
      rewards_15min: num(r.rewards_15min),
    })) as ReviewSocial[],
    loyalty: (loyalty.data ?? []).map((r) => ({
      ...r,
      new_members: num(r.new_members),
      active_members: num(r.active_members),
      rewards_redeemed: num(r.rewards_redeemed),
    })) as ReviewLoyalty[],
    // Corporate-deals MoM / unmap rows live on the shared register but are edited on /operations/corporate-deals
    actions: ((actions.data ?? []) as Array<ReviewAction & { source_module?: string | null }>).filter(
      (a) => !isCorporateDealsActionModule(a.source_module),
    ) as ReviewAction[],
    incidents: (incidents.data ?? []) as ReviewIncident[],
    summary: summaryRow.data ? asSummary(summaryRow.data) : null,
    previous_social: [],
    previous_loyalty: [],
  };

  const { data: prev } = await context.supabase
    .from("weekly_reviews")
    .select("id")
    .lt("week_start", row.week_start)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prev?.id) {
    const [ps, pl] = await Promise.all([
      context.supabase.from("weekly_review_social").select("*").eq("review_id", prev.id),
      context.supabase.from("weekly_review_loyalty").select("*").eq("review_id", prev.id),
    ]);
    pack.previous_social = (ps.data ?? []).map((r) => ({
      ...r,
      google_rating: r.google_rating == null ? null : num(r.google_rating),
      total_reviews: num(r.total_reviews),
      new_reviews_campaign: num(r.new_reviews_campaign),
      new_reviews_organic: num(r.new_reviews_organic),
      ig_followers: num(r.ig_followers),
      rewards_15min: num(r.rewards_15min),
    })) as ReviewSocial[];
    pack.previous_loyalty = (pl.data ?? []).map((r) => ({
      ...r,
      new_members: num(r.new_members),
      active_members: num(r.active_members),
      rewards_redeemed: num(r.rewards_redeemed),
    })) as ReviewLoyalty[];
  }

  return pack;
}

export async function createNextWeeklyReview(context: AuthContext): Promise<{ id: string }> {
  if (!canUserDo(context.roles ?? [], "weekly_review.edit")) {
    throw new ForbiddenError("weekly_review.edit");
  }
  const { data, error } = await context.supabase.rpc("create_next_weekly_review");
  if (error) throw error;
  if (!data) throw new Error("create_next_weekly_review returned no id");
  return { id: data };
}

type ChildTable =
  | "weekly_review_decisions"
  | "weekly_review_aggregators"
  | "weekly_review_corporate"
  | "weekly_review_social"
  | "weekly_review_loyalty"
  | "weekly_review_actions"
  | "weekly_review_incidents";

async function replaceChildRows(
  context: AuthContext,
  table: ChildTable,
  reviewId: string,
  rows: Array<{ id: string }>,
) {
  const { data: existing, error: readErr } = await context.supabase.from(table).select("id").eq("review_id", reviewId);
  if (readErr) throw readErr;
  const keep = new Set(rows.map((r) => r.id));
  let toDelete = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  let upsertRows = rows;
  // Preserve corporate-deals MoM / unmapped follow-ups (not weekly_review_mom) from replace-all wipe
  if (table === "weekly_review_actions") {
    const { data: tagged } = await context.supabase
      .from("weekly_review_actions")
      .select("id, source_module")
      .eq("review_id", reviewId)
      .like("source_module", "corporate_deals_%");
    const protectedIds = new Set((tagged ?? []).map((r) => String(r.id)));
    toDelete = toDelete.filter((id) => !protectedIds.has(String(id)));
    upsertRows = rows.filter((r) => !protectedIds.has(String(r.id)));
  }
  if (toDelete.length) {
    const { error } = await context.supabase.from(table).delete().in("id", toDelete);
    if (error) throw error;
  }
  if (!upsertRows.length) return;
  const payload = upsertRows.map((r) => ({ ...r, review_id: reviewId }));
  const { error } = await context.supabase.from(table).upsert(payload);
  if (error) throw error;
}

export interface SaveWeeklyReviewInput {
  notes?: string | null;
  week_label?: string;
  week_start?: string;
  week_end?: string;
  meeting_date?: string;
  status?: "draft" | "presented";
  decisions?: ReviewDecision[];
  aggregators?: ReviewAggregator[];
  corporate?: ReviewCorporate[];
  social?: ReviewSocial[];
  loyalty?: ReviewLoyalty[];
  actions?: ReviewAction[];
  incidents?: ReviewIncident[];
}

export async function saveWeeklyReviewPack(
  context: AuthContext,
  id: string,
  input: SaveWeeklyReviewInput,
): Promise<ReviewPack> {
  if (!canUserDo(context.roles ?? [], "weekly_review.edit")) {
    throw new ForbiddenError("weekly_review.edit");
  }

  const header: Record<string, unknown> = {};
  if (input.notes !== undefined) header.notes = input.notes;
  if (input.week_label !== undefined) header.week_label = input.week_label;
  if (input.week_start !== undefined) header.week_start = input.week_start;
  if (input.week_end !== undefined) header.week_end = input.week_end;
  if (input.meeting_date !== undefined) header.meeting_date = input.meeting_date;
  if (input.status !== undefined) header.status = input.status;

  if (Object.keys(header).length) {
    const { error } = await context.supabase.from("weekly_reviews").update(header).eq("id", id);
    if (error) throw error;
  }

  const jobs: Promise<void>[] = [];
  if (input.decisions) jobs.push(replaceChildRows(context, "weekly_review_decisions", id, input.decisions));
  if (input.aggregators) jobs.push(replaceChildRows(context, "weekly_review_aggregators", id, input.aggregators));
  if (input.corporate) jobs.push(replaceChildRows(context, "weekly_review_corporate", id, input.corporate));
  if (input.social) jobs.push(replaceChildRows(context, "weekly_review_social", id, input.social));
  if (input.loyalty) jobs.push(replaceChildRows(context, "weekly_review_loyalty", id, input.loyalty));
  if (input.actions) jobs.push(replaceChildRows(context, "weekly_review_actions", id, input.actions));
  if (input.incidents) jobs.push(replaceChildRows(context, "weekly_review_incidents", id, input.incidents));
  await Promise.all(jobs);

  return fetchWeeklyReviewPack(context, id);
}

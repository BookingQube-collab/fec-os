import {
  type ActionStatus,
  type AggregatorPlatform,
  type DecisionOutcome,
  type DecisionPriority,
  type ReviewStatus,
} from "./constants";

export interface WeeklyReview {
  id: string;
  week_label: string;
  week_start: string;
  week_end: string;
  meeting_date: string;
  prepared_by: string | null;
  prepared_by_name: string | null;
  notes: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface ReviewDecision {
  id: string;
  review_id: string;
  location_id: string | null;
  venue_text: string | null;
  matter: string;
  decision_required: string;
  priority: DecisionPriority;
  outcome: DecisionOutcome;
  note: string | null;
  sort_order: number;
}

export interface ReviewAggregator {
  id: string;
  review_id: string;
  location_id: string;
  platform: AggregatorPlatform;
  redemptions: number;
  saving_qar: number;
}

export interface ReviewCorporate {
  id: string;
  review_id: string;
  location_id: string | null;
  company: string;
  deals: number;
  revenue_qar: number;
}

export interface ReviewSocial {
  id: string;
  review_id: string;
  location_id: string;
  google_rating: number | null;
  total_reviews: number;
  new_reviews_campaign: number;
  new_reviews_organic: number;
  ig_followers: number;
  rewards_15min: number;
}

export interface ReviewLoyalty {
  id: string;
  review_id: string;
  location_id: string;
  new_members: number;
  active_members: number;
  rewards_redeemed: number;
}

export interface ReviewAction {
  id: string;
  review_id: string;
  venue_text: string | null;
  action: string;
  owner: string | null;
  due: string | null;
  status: ActionStatus;
  update_note: string | null;
  carried_from: string | null;
  sort_order: number;
}

export interface ReviewIncident {
  id: string;
  review_id: string;
  location_id: string | null;
  description: string;
  action_taken: string | null;
  closed: boolean;
}

export interface ReviewSummary {
  review_id: string;
  week_start: string;
  week_label: string;
  aggregator_redemptions: number;
  corporate_deals: number;
  decisions_pending: number;
  actions_open: number;
  actions_total: number;
  incidents: number;
  new_reviews: number;
  prev_aggregator_redemptions: number | null;
  prev_corporate_deals: number | null;
  prev_decisions_pending: number | null;
  prev_actions_open: number | null;
  prev_actions_total: number | null;
  prev_incidents: number | null;
  prev_new_reviews: number | null;
}

export interface ReviewPack {
  review: WeeklyReview;
  decisions: ReviewDecision[];
  aggregators: ReviewAggregator[];
  corporate: ReviewCorporate[];
  social: ReviewSocial[];
  loyalty: ReviewLoyalty[];
  actions: ReviewAction[];
  incidents: ReviewIncident[];
  summary: ReviewSummary | null;
  previous_social: ReviewSocial[];
  previous_loyalty: ReviewLoyalty[];
}

export function carryForwardActions(source: ReviewAction[]): Omit<ReviewAction, "id" | "review_id">[] {
  return source
    .filter((row) => row.status !== "done")
    .map((row) => ({
      venue_text: row.venue_text,
      action: row.action,
      owner: row.owner,
      due: row.due,
      status: row.status,
      update_note: null,
      carried_from: row.id,
      sort_order: row.sort_order,
    }));
}

export function carryForwardDecisions(
  source: ReviewDecision[],
): Omit<ReviewDecision, "id" | "review_id">[] {
  return source
    .filter((row) => row.outcome === "pending" || row.outcome === "deferred")
    .map((row) => ({
      location_id: row.location_id,
      venue_text: row.venue_text,
      matter: row.matter,
      decision_required: row.decision_required,
      priority: row.priority,
      outcome: "pending" as const,
      note: null,
      sort_order: row.sort_order,
    }));
}

export function packHasNumbers(pack: Pick<ReviewPack, "aggregators" | "corporate" | "social" | "loyalty">): boolean {
  return (
    pack.aggregators.some((r) => r.redemptions > 0 || r.saving_qar > 0) ||
    pack.corporate.some((r) => r.deals > 0 || r.revenue_qar > 0) ||
    pack.social.some(
      (r) =>
        r.total_reviews > 0 ||
        r.new_reviews_campaign > 0 ||
        r.new_reviews_organic > 0 ||
        r.ig_followers > 0,
    ) ||
    pack.loyalty.some((r) => r.new_members > 0 || r.active_members > 0 || r.rewards_redeemed > 0)
  );
}

export function delta(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null;
  return current - previous;
}

export function formatDelta(value: number | null): string | undefined {
  if (value == null) return undefined;
  if (value === 0) return "0 vs last week";
  return `${value > 0 ? "+" : ""}${value} vs last week`;
}

export function summarizePack(pack: ReviewPack, previous?: ReviewSummary | null): ReviewSummary {
  const aggregator_redemptions = pack.aggregators.reduce((s, r) => s + r.redemptions, 0);
  const corporate_deals = pack.corporate.reduce((s, r) => s + r.deals, 0);
  const decisions_pending = pack.decisions.filter((d) => d.outcome === "pending").length;
  const actions_open = pack.actions.filter((a) => a.status !== "done").length;
  const new_reviews = pack.social.reduce(
    (s, r) => s + r.new_reviews_campaign + r.new_reviews_organic,
    0,
  );
  return {
    review_id: pack.review.id,
    week_start: pack.review.week_start,
    week_label: pack.review.week_label,
    aggregator_redemptions,
    corporate_deals,
    decisions_pending,
    actions_open,
    actions_total: pack.actions.length,
    incidents: pack.incidents.length,
    new_reviews,
    prev_aggregator_redemptions: previous?.aggregator_redemptions ?? null,
    prev_corporate_deals: previous?.corporate_deals ?? null,
    prev_decisions_pending: previous?.decisions_pending ?? null,
    prev_actions_open: previous?.actions_open ?? null,
    prev_actions_total: previous?.actions_total ?? null,
    prev_incidents: previous?.incidents ?? null,
    prev_new_reviews: previous?.new_reviews ?? null,
  };
}

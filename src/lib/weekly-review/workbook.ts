import {
  ACTION_STATUSES,
  AGGREGATOR_LOCATION_CODES,
  AGGREGATOR_PLATFORMS,
  AGGREGATOR_WEEKLY_PACE,
  CAMPAIGN_LOCATION_CODES,
  CORPORATE_PARTNERS,
  DECISION_OUTCOMES,
  DECISION_PRIORITIES,
  LOCATION_SHORT_NAME,
  type ActionStatus,
  type AggregatorPlatform,
  type DecisionOutcome,
  type DecisionPriority,
} from "./constants";
import type { ReviewPack } from "./model";

export const WORKBOOK_SHEETS = [
  "Header",
  "Decisions",
  "Aggregators",
  "Corporate",
  "Reviews",
  "Loyalty",
  "Actions",
  "Incidents",
] as const;

export type SheetMap = Record<string, string[][]>;

export type SiteRef = { id: string; code: string; name: string };

function newId() {
  return crypto.randomUUID();
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "closed" || s === "y";
}

function headerIndex(row: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((cell, i) => {
    map[cell.trim().toLowerCase().replace(/\s+/g, "_")] = i;
  });
  return map;
}

function cell(row: string[], idx: Record<string, number>, key: string): string {
  const i = idx[key];
  return i == null ? "" : String(row[i] ?? "").trim();
}

export function resolveSite(venues: SiteRef[], raw: string): SiteRef | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const upper = s.toUpperCase();
  const key = s.toLowerCase();
  return venues.find(
    (v) =>
      v.code.toUpperCase() === upper ||
      v.name.toLowerCase() === key ||
      (LOCATION_SHORT_NAME[v.code] ?? "").toLowerCase() === key,
  );
}

function asPlatform(raw: string): AggregatorPlatform | null {
  const hit = AGGREGATOR_PLATFORMS.find((p) => p.toLowerCase() === raw.trim().toLowerCase());
  return hit ?? null;
}

function asPriority(raw: string): DecisionPriority {
  const hit = DECISION_PRIORITIES.find((p) => p === raw.trim().toLowerCase());
  return hit ?? "other";
}

function asOutcome(raw: string): DecisionOutcome {
  const hit = DECISION_OUTCOMES.find((p) => p === raw.trim().toLowerCase());
  return hit ?? "pending";
}

function asActionStatus(raw: string): ActionStatus {
  const s = raw.trim().toLowerCase();
  if (s === "closed" || s === "done") return "done";
  if (s === "wip" || s === "in progress" || s === "in_progress") return "wip";
  return ACTION_STATUSES.includes(s as ActionStatus) ? (s as ActionStatus) : "open";
}

export function sampleSheetMap(): SheetMap {
  const aggRows: string[][] = [["venue", "platform", "redemptions", "saving_qar"]];
  for (const code of AGGREGATOR_LOCATION_CODES) {
    for (const platform of AGGREGATOR_PLATFORMS) {
      const pace = AGGREGATOR_WEEKLY_PACE[platform];
      const share = code === "INF-CC" ? 0.35 : code === "KDS-CC" ? 0.25 : code === "UA-DM" ? 0.22 : 0.09;
      aggRows.push([
        code,
        platform,
        String(Math.round(pace * share)),
        String(Math.round(pace * share * 12)),
      ]);
    }
  }
  return {
    Header: [
      ["week_label", "notes"],
      ["Week 37", "Sample pack: replace these figures, then upload onto the open week."],
    ],
    Decisions: [
      ["venue", "matter", "decision_required", "priority", "outcome", "note"],
      ["INF-CC", "Gate sensor", "Approve spare parts PO", "safety", "pending", ""],
      ["", "Weekend rate card", "Hold or go live Friday", "commercial", "deferred", "Need CFO"],
    ],
    Aggregators: aggRows,
    Corporate: [
      ["venue", "company", "deals", "revenue_qar"],
      ["INF-CC", CORPORATE_PARTNERS[0], "12", "4800"],
      ["KDS-CC", "QIB", "8", "2100"],
      ["UA-DM", "Qatar Airways", "5", "1600"],
    ],
    Reviews: [
      [
        "venue",
        "google_rating",
        "total_reviews",
        "new_reviews_campaign",
        "new_reviews_organic",
        "ig_followers",
        "rewards_15min",
      ],
      ["INF-CC", "4.6", "312", "18", "7", "21400", "9"],
      ["KDS-CC", "4.8", "190", "11", "4", "18200", "6"],
      ["UA-DM", "4.4", "88", "5", "3", "9600", "4"],
    ],
    Loyalty: [
      ["venue", "new_members", "active_members", "rewards_redeemed"],
      ["INF-CC", "22", "410", "31"],
      ["KDS-CC", "14", "260", "18"],
      ["UA-DM", "9", "140", "11"],
    ],
    Actions: [
      ["venue", "action", "owner", "due", "status", "update"],
      ["INF-CC", "Replace gate sensor", "Ops", "Tue", "open", ""],
      ["KDS-CC", "Post Google review QR", "CX", "Wed", "wip", "Prints ordered"],
      ["UA-DM", "Close CCTV ticket", "Tech", "Mon", "done", "Closed"],
    ],
    Incidents: [
      ["venue", "description", "action_taken", "closed"],
      ["INF-CC", "Guest slip at entrance", "Mat replaced, logged", "yes"],
      ["KDS-CC", "", "", ""],
    ],
  };
}

export function packToSheetMap(pack: ReviewPack, sites: SiteRef[]): SheetMap {
  const codeOf = (id: string | null) => sites.find((s) => s.id === id)?.code ?? "";
  return {
    Header: [
      ["week_label", "notes"],
      [pack.review.week_label, pack.review.notes ?? ""],
    ],
    Decisions: [
      ["venue", "matter", "decision_required", "priority", "outcome", "note"],
      ...pack.decisions.map((r) => [
        r.venue_text || codeOf(r.location_id),
        r.matter,
        r.decision_required,
        r.priority,
        r.outcome,
        r.note ?? "",
      ]),
    ],
    Aggregators: [
      ["venue", "platform", "redemptions", "saving_qar"],
      ...pack.aggregators.map((r) => [
        codeOf(r.location_id),
        r.platform,
        String(r.redemptions),
        String(r.saving_qar),
      ]),
    ],
    Corporate: [
      ["venue", "company", "deals", "revenue_qar"],
      ...pack.corporate.map((r) => [
        codeOf(r.location_id),
        r.company,
        String(r.deals),
        String(r.revenue_qar),
      ]),
    ],
    Reviews: [
      [
        "venue",
        "google_rating",
        "total_reviews",
        "new_reviews_campaign",
        "new_reviews_organic",
        "ig_followers",
        "rewards_15min",
      ],
      ...pack.social.map((r) => [
        codeOf(r.location_id),
        r.google_rating == null ? "" : String(r.google_rating),
        String(r.total_reviews),
        String(r.new_reviews_campaign),
        String(r.new_reviews_organic),
        String(r.ig_followers),
        String(r.rewards_15min),
      ]),
    ],
    Loyalty: [
      ["venue", "new_members", "active_members", "rewards_redeemed"],
      ...pack.loyalty.map((r) => [
        codeOf(r.location_id),
        String(r.new_members),
        String(r.active_members),
        String(r.rewards_redeemed),
      ]),
    ],
    Actions: [
      ["venue", "action", "owner", "due", "status", "update"],
      ...pack.actions.map((r) => [
        r.venue_text ?? "",
        r.action,
        r.owner ?? "",
        r.due ?? "",
        r.status,
        r.update_note ?? "",
      ]),
    ],
    Incidents: [
      ["venue", "description", "action_taken", "closed"],
      ...pack.incidents.map((r) => [
        codeOf(r.location_id),
        r.description,
        r.action_taken ?? "",
        r.closed ? "yes" : "no",
      ]),
    ],
  };
}

function dataRows(sheet: string[][] | undefined): { idx: Record<string, number>; rows: string[][] } {
  if (!sheet || sheet.length < 2) return { idx: {}, rows: [] };
  return { idx: headerIndex(sheet[0]), rows: sheet.slice(1).filter((r) => r.some((c) => String(c ?? "").trim())) };
}

export function applySheetMap(
  pack: ReviewPack,
  sheets: SheetMap,
  sites: SiteRef[],
): { pack: ReviewPack; errors: string[] } {
  const errors: string[] = [];
  const next: ReviewPack = {
    ...pack,
    aggregators: pack.aggregators.map((r) => ({ ...r })),
    social: pack.social.map((r) => ({ ...r })),
    loyalty: pack.loyalty.map((r) => ({ ...r })),
  };

  const header = dataRows(sheets.Header);
  if (header.rows[0]) {
    const notes = cell(header.rows[0], header.idx, "notes");
    const label = cell(header.rows[0], header.idx, "week_label");
    next.review = {
      ...next.review,
      notes: notes || next.review.notes,
      week_label: label || next.review.week_label,
    };
  }

  const dec = dataRows(sheets.Decisions);
  if (sheets.Decisions) {
    next.decisions = dec.rows.map((row, i) => {
      const venueRaw = cell(row, dec.idx, "venue");
      const site = resolveSite(sites, venueRaw);
      return {
        id: newId(),
        review_id: pack.review.id,
        location_id: site?.id ?? null,
        venue_text: venueRaw || (site ? LOCATION_SHORT_NAME[site.code] ?? site.name : ""),
        matter: cell(row, dec.idx, "matter"),
        decision_required: cell(row, dec.idx, "decision_required"),
        priority: asPriority(cell(row, dec.idx, "priority")),
        outcome: asOutcome(cell(row, dec.idx, "outcome")),
        note: cell(row, dec.idx, "note") || null,
        sort_order: i,
      };
    });
  }

  const agg = dataRows(sheets.Aggregators);
  for (const row of agg.rows) {
    const site = resolveSite(sites, cell(row, agg.idx, "venue"));
    const platform = asPlatform(cell(row, agg.idx, "platform"));
    if (!site || !platform) {
      errors.push(`Aggregators: unknown venue or platform (${cell(row, agg.idx, "venue")} / ${cell(row, agg.idx, "platform")})`);
      continue;
    }
    const existing = next.aggregators.find((r) => r.location_id === site.id && r.platform === platform);
    const redemptions = num(cell(row, agg.idx, "redemptions"));
    const saving_qar = num(cell(row, agg.idx, "saving_qar"));
    if (existing) {
      existing.redemptions = redemptions;
      existing.saving_qar = saving_qar;
    } else {
      next.aggregators.push({
        id: newId(),
        review_id: pack.review.id,
        location_id: site.id,
        platform,
        redemptions,
        saving_qar,
      });
    }
  }

  const corp = dataRows(sheets.Corporate);
  if (sheets.Corporate) {
    next.corporate = corp.rows
      .filter((row) => cell(row, corp.idx, "company"))
      .map((row) => {
        const site = resolveSite(sites, cell(row, corp.idx, "venue"));
        return {
          id: newId(),
          review_id: pack.review.id,
          location_id: site?.id ?? null,
          company: cell(row, corp.idx, "company"),
          deals: num(cell(row, corp.idx, "deals")),
          revenue_qar: num(cell(row, corp.idx, "revenue_qar")),
        };
      });
  }

  const rev = dataRows(sheets.Reviews);
  for (const row of rev.rows) {
    const site = resolveSite(sites, cell(row, rev.idx, "venue"));
    if (!site) {
      errors.push(`Reviews: unknown venue ${cell(row, rev.idx, "venue")}`);
      continue;
    }
    const ratingRaw = cell(row, rev.idx, "google_rating");
    const patch = {
      google_rating: ratingRaw === "" ? null : num(ratingRaw),
      total_reviews: num(cell(row, rev.idx, "total_reviews")),
      new_reviews_campaign: num(cell(row, rev.idx, "new_reviews_campaign")),
      new_reviews_organic: num(cell(row, rev.idx, "new_reviews_organic")),
      ig_followers: num(cell(row, rev.idx, "ig_followers")),
      rewards_15min: num(cell(row, rev.idx, "rewards_15min")),
    };
    const existing = next.social.find((r) => r.location_id === site.id);
    if (existing) Object.assign(existing, patch);
    else if ((CAMPAIGN_LOCATION_CODES as readonly string[]).includes(site.code)) {
      next.social.push({ id: newId(), review_id: pack.review.id, location_id: site.id, ...patch });
    }
  }

  const loy = dataRows(sheets.Loyalty);
  for (const row of loy.rows) {
    const site = resolveSite(sites, cell(row, loy.idx, "venue"));
    if (!site) {
      errors.push(`Loyalty: unknown venue ${cell(row, loy.idx, "venue")}`);
      continue;
    }
    const patch = {
      new_members: num(cell(row, loy.idx, "new_members")),
      active_members: num(cell(row, loy.idx, "active_members")),
      rewards_redeemed: num(cell(row, loy.idx, "rewards_redeemed")),
    };
    const existing = next.loyalty.find((r) => r.location_id === site.id);
    if (existing) Object.assign(existing, patch);
    else if ((CAMPAIGN_LOCATION_CODES as readonly string[]).includes(site.code)) {
      next.loyalty.push({ id: newId(), review_id: pack.review.id, location_id: site.id, ...patch });
    }
  }

  const act = dataRows(sheets.Actions);
  if (sheets.Actions) {
    next.actions = act.rows
      .filter((row) => cell(row, act.idx, "action"))
      .map((row, i) => ({
        id: newId(),
        review_id: pack.review.id,
        venue_text: cell(row, act.idx, "venue"),
        action: cell(row, act.idx, "action"),
        owner: cell(row, act.idx, "owner") || null,
        due: cell(row, act.idx, "due") || null,
        status: asActionStatus(cell(row, act.idx, "status")),
        update_note: cell(row, act.idx, "update") || null,
        carried_from: null,
        sort_order: i,
      }));
  }

  const inc = dataRows(sheets.Incidents);
  if (sheets.Incidents) {
    next.incidents = inc.rows
      .filter((row) => cell(row, inc.idx, "description"))
      .map((row) => {
        const site = resolveSite(sites, cell(row, inc.idx, "venue"));
        return {
          id: newId(),
          review_id: pack.review.id,
          location_id: site?.id ?? null,
          description: cell(row, inc.idx, "description"),
          action_taken: cell(row, inc.idx, "action_taken") || null,
          closed: bool(cell(row, inc.idx, "closed")),
        };
      });
  }

  return { pack: next, errors };
}

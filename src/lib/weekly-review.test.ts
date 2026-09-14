import { describe, expect, it } from "vitest";

import { isoWeekLabel, nextWeekBounds } from "./weekly-review/constants";
import {
  carryForwardActions,
  carryForwardDecisions,
  formatDelta,
  packHasNumbers,
  summarizePack,
  type ReviewAction,
  type ReviewDecision,
  type ReviewPack,
} from "./weekly-review/model";
import { applySheetMap, sampleSheetMap } from "./weekly-review/workbook";

const action = (over: Partial<ReviewAction>): ReviewAction => ({
  id: "a1",
  review_id: "r1",
  venue_text: "InflataPark",
  action: "Fix gate",
  owner: "Ops",
  due: "Tue",
  status: "open",
  update_note: "chased",
  carried_from: null,
  sort_order: 0,
  ...over,
});

const decision = (over: Partial<ReviewDecision>): ReviewDecision => ({
  id: "d1",
  review_id: "r1",
  location_id: null,
  venue_text: "Estate",
  matter: "Pricing",
  decision_required: "Approve rate card",
  priority: "commercial",
  outcome: "pending",
  note: "wait",
  sort_order: 0,
  ...over,
});

describe("weekly review week math", () => {
  it("labels ISO week 37 for 7 Sep 2026 and advances seven days", () => {
    expect(isoWeekLabel("2026-09-07")).toBe("Week 37");
    const next = nextWeekBounds("2026-09-07");
    expect(next).toEqual({
      week_start: "2026-09-14",
      week_end: "2026-09-20",
      meeting_date: "2026-09-15",
      week_label: "Week 38",
    });
  });
});

describe("weekly review carry-forward", () => {
  it("copies open and wip actions, drops done, clears the update note", () => {
    const carried = carryForwardActions([
      action({ id: "open", status: "open" }),
      action({ id: "wip", status: "wip", action: "CCTV" }),
      action({ id: "done", status: "done" }),
    ]);
    expect(carried.map((r) => r.carried_from)).toEqual(["open", "wip"]);
    expect(carried.every((r) => r.update_note === null)).toBe(true);
    expect(carried.some((r) => r.action === "CCTV")).toBe(true);
  });

  it("copies pending and deferred decisions as pending with note cleared", () => {
    const carried = carryForwardDecisions([
      decision({ id: "p", outcome: "pending" }),
      decision({ id: "def", outcome: "deferred" }),
      decision({ id: "ok", outcome: "approved" }),
      decision({ id: "no", outcome: "declined" }),
    ]);
    expect(carried).toHaveLength(2);
    expect(carried.every((r) => r.outcome === "pending" && r.note === null)).toBe(true);
  });
});

describe("weekly review summary", () => {
  const pack = {
    review: {
      id: "r2",
      week_label: "Week 38",
      week_start: "2026-09-14",
      week_end: "2026-09-20",
      meeting_date: "2026-09-15",
      prepared_by: null,
      prepared_by_name: null,
      notes: null,
      status: "draft" as const,
      created_at: "",
      updated_at: "",
    },
    decisions: [decision({ outcome: "pending" }), decision({ id: "d2", outcome: "approved" })],
    aggregators: [
      {
        id: "g1",
        review_id: "r2",
        location_id: "loc",
        platform: "Entertainer" as const,
        redemptions: 10,
        saving_qar: 0,
      },
    ],
    corporate: [{ id: "c1", review_id: "r2", location_id: null, company: "QIB", deals: 3, revenue_qar: 0 }],
    social: [
      {
        id: "s1",
        review_id: "r2",
        location_id: "loc",
        google_rating: 4.5,
        total_reviews: 20,
        new_reviews_campaign: 2,
        new_reviews_organic: 1,
        ig_followers: 0,
        rewards_15min: 0,
      },
    ],
    loyalty: [],
    actions: [action({ status: "open" }), action({ id: "a2", status: "done" })],
    incidents: [],
    summary: null,
    previous_social: [],
    previous_loyalty: [],
  } satisfies ReviewPack;

  it("totals current week and exposes previous-week deltas", () => {
    const summary = summarizePack(pack, {
      review_id: "r1",
      week_start: "2026-09-07",
      week_label: "Week 37",
      aggregator_redemptions: 8,
      corporate_deals: 1,
      decisions_pending: 4,
      actions_open: 3,
      actions_total: 3,
      incidents: 0,
      new_reviews: 1,
      prev_aggregator_redemptions: null,
      prev_corporate_deals: null,
      prev_decisions_pending: null,
      prev_actions_open: null,
      prev_actions_total: null,
      prev_incidents: null,
      prev_new_reviews: null,
    });
    expect(summary.aggregator_redemptions).toBe(10);
    expect(summary.corporate_deals).toBe(3);
    expect(summary.decisions_pending).toBe(1);
    expect(summary.actions_open).toBe(1);
    expect(summary.actions_total).toBe(2);
    expect(summary.new_reviews).toBe(3);
    expect(formatDelta(summary.aggregator_redemptions - (summary.prev_aggregator_redemptions ?? 0))).toBe(
      "+2 vs last week",
    );
  });

  it("detects whether numbers have been entered", () => {
    expect(packHasNumbers(pack)).toBe(true);
    expect(
      packHasNumbers({ aggregators: [], corporate: [], social: [], loyalty: [] }),
    ).toBe(false);
  });
});

describe("weekly review workbook", () => {
  const sites = [
    { id: "inf", code: "INF-CC", name: "InflataPark" },
    { id: "kds", code: "KDS-CC", name: "Kids Driving School" },
  ];

  it("loads sample aggregator and review rows onto a pack by venue code", () => {
    const empty: ReviewPack = {
      review: {
        id: "r1",
        week_label: "Week 1",
        week_start: "2026-09-07",
        week_end: "2026-09-13",
        meeting_date: "2026-09-08",
        prepared_by: null,
        prepared_by_name: null,
        notes: null,
        status: "draft",
        created_at: "",
        updated_at: "",
      },
      decisions: [],
      aggregators: [
        {
          id: "a1",
          review_id: "r1",
          location_id: "inf",
          platform: "Entertainer",
          redemptions: 0,
          saving_qar: 0,
        },
      ],
      corporate: [],
      social: [
        {
          id: "s1",
          review_id: "r1",
          location_id: "inf",
          google_rating: null,
          total_reviews: 0,
          new_reviews_campaign: 0,
          new_reviews_organic: 0,
          ig_followers: 0,
          rewards_15min: 0,
        },
      ],
      loyalty: [],
      actions: [],
      incidents: [],
      summary: null,
      previous_social: [],
      previous_loyalty: [],
    };
    const { pack, errors } = applySheetMap(empty, sampleSheetMap(), sites);
    expect(errors.filter((e) => /INF-CC|KDS-CC/.test(e))).toEqual([]);
    expect(pack.aggregators.find((r) => r.platform === "Entertainer" && r.location_id === "inf")?.redemptions).toBeGreaterThan(0);
    expect(pack.social[0]?.total_reviews).toBe(312);
    expect(pack.corporate.some((c) => c.company === "QIB")).toBe(true);
    expect(pack.review.notes).toMatch(/Sample pack/);
  });
});

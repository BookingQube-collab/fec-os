import { describe, expect, it } from "vitest";

import {
  assembleEventReports,
  FINANCE_REPORT_IDS,
  redactReportBlockForExport,
  type ReportEventFact,
  type ReportTaskFact,
} from "@/lib/events/reports";

function baseEvent(partial: Partial<ReportEventFact> = {}): ReportEventFact {
  return {
    id: "e1",
    event_number: "EVT-1",
    name: "Demo",
    client_name: "Client",
    venue_name: "Mall",
    status: "active",
    stage_code: "bump_in",
    stage_label: "Bump-in",
    pm_staff_id: "s1",
    pm_name: "Sara",
    event_start: "2026-02-01",
    event_end: "2026-02-10",
    setup_start: "2026-01-28",
    dismantle_date: "2026-02-12",
    health_rag: "amber",
    readiness_pct: 70,
    go_live_approved: false,
    contracted_value: 5000,
    lessons_learned: null,
    overall_progress: 40,
    finance: {
      original: 1000,
      approvedChanges: 0,
      revised: 1000,
      committed: 400,
      actual: 300,
      forecast: 900,
      variance: 100,
      varianceForecast: 100,
      varianceCommitted: 600,
      remaining: 700,
      contractValue: 5000,
      additionalRevenue: 0,
      changeOrders: 0,
      discounts: 0,
      taxes: 0,
      finalRevenue: 5000,
      recognizedRevenue: 0,
      grossProfit: 4700,
      forecastProfit: 4100,
      actualProfit: 4700,
      marginPct: 94,
      originalMarginPct: 94,
      revisedMarginPct: 94,
      forecastMarginPct: 82,
      actualMarginPct: 94,
      receivable: 5000,
      payable: 0,
      hasBudget: true,
      hasInvoices: false,
    },
    ...partial,
  };
}

function baseTask(partial: Partial<ReportTaskFact> = {}): ReportTaskFact {
  return {
    event_id: "e1",
    title: "Install",
    status: "in_progress",
    priority: "normal",
    due_date: "2026-02-05",
    percent_complete: 40,
    is_critical: false,
    is_snag: false,
    owner_name: "Sara",
    owner_staff_id: "s1",
    estimated_hours: 10,
    actual_hours: 4,
    story_points: 5,
    sprint_id: "sp1",
    completed_at: null,
    workstream_code: "operations",
    workstream_title: "Operations",
    lifecycle_phase: "bump_in",
    ...partial,
  };
}

describe("assembleEventReports phase 8", () => {
  it("builds resource, timeline, agile, and EV-lite blocks", () => {
    const reports = assembleEventReports({
      events: [baseEvent()],
      tasks: [baseTask()],
      readiness: [],
      issues: [],
      risks: [],
      prs: [],
      pos: [],
      payables: [],
      assets: [],
      sprints: [
        {
          id: "sp1",
          event_id: "e1",
          name: "Sprint 1",
          status: "active",
          start_date: "2026-01-28",
          end_date: "2026-02-10",
        },
      ],
      canFinance: true,
      today: "2026-02-01",
    });

    const byId = Object.fromEntries(reports.map((r) => [r.id, r]));
    expect(byId.resource_utilization.rows).toHaveLength(1);
    expect(byId.est_vs_actual_hours.rows[0]?.variance).toBe(-6);
    expect(byId.portfolio_timeline.rows).toHaveLength(1);
    expect(byId.agile_performance.rows).toHaveLength(1);
    expect(byId.earned_value_lite.rows).toHaveLength(1);
    expect(byId.earned_value_lite.finance).toBe(true);
    expect(FINANCE_REPORT_IDS.has("earned_value_lite")).toBe(true);
  });

  it("redacts EV-lite rows without finance", () => {
    const reports = assembleEventReports({
      events: [baseEvent()],
      tasks: [baseTask()],
      readiness: [],
      issues: [],
      risks: [],
      prs: [],
      pos: [],
      payables: [],
      assets: [],
      canFinance: false,
      today: "2026-02-01",
    });
    const ev = reports.find((r) => r.id === "earned_value_lite")!;
    expect(ev.rows).toEqual([]);
    const redacted = redactReportBlockForExport(
      reports.find((r) => r.id === "budget_vs_actual")!,
      false,
    );
    expect(redacted.rows).toEqual([]);
    expect(redacted.columns.every((c) => !c.money)).toBe(true);
  });
});

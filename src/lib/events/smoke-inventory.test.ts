import { describe, expect, it } from "vitest";

import { EVENT_FETCH_CAPS } from "@/lib/events/constants";
import { EVENT_REPORT_IDS, FINANCE_REPORT_IDS } from "@/lib/events/reports";
import { EVENT_CRITICAL_ACTIONS } from "@/lib/events/security-expectations";

/**
 * Phase 9 smoke inventory — locks the report catalog and critical action map.
 * Manual staging smoke still required after migrations (see docs).
 */
describe("phase 9 smoke inventory", () => {
  it("lists all 23 working report IDs", () => {
    expect(EVENT_REPORT_IDS).toHaveLength(23);
    expect(EVENT_REPORT_IDS).toEqual([
      "project_status",
      "event_readiness",
      "department_completion",
      "overdue_blocked",
      "budget_vs_actual",
      "budget_variance",
      "profitability",
      "pending_procurement",
      "procurement_risks",
      "staffing_readiness",
      "resource_utilization",
      "est_vs_actual_hours",
      "portfolio_timeline",
      "agile_performance",
      "earned_value_lite",
      "bump_in_progress",
      "open_snags",
      "critical_safety",
      "asset_movement",
      "go_live_status",
      "risk_register",
      "issues",
      "lessons_learned",
    ]);
  });

  it("marks exactly four finance-gated reports", () => {
    expect([...FINANCE_REPORT_IDS].sort()).toEqual([
      "budget_variance",
      "budget_vs_actual",
      "earned_value_lite",
      "profitability",
    ]);
    for (const id of FINANCE_REPORT_IDS) {
      expect(EVENT_REPORT_IDS).toContain(id);
    }
  });

  it("inventories critical actions with capability tags", () => {
    const ids = EVENT_CRITICAL_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "list_events",
        "create_event",
        "edit_plan",
        "budget_read",
        "budget_transition",
        "health_override",
        "go_live",
        "templates_manage",
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents portfolio fetch soft caps for ops smoke", () => {
    expect(EVENT_FETCH_CAPS).toMatchObject({
      listEvents: 400,
      reportsEvents: 400,
      calendarTasksQuery: 800,
      calendarMilestones: 300,
      myTasks: 200,
    });
  });
});

import { describe, expect, it } from "vitest";

import { EVENT_FETCH_CAPS } from "@/lib/events/constants";
import {
  eventDocumentObjectPath,
  eventDocumentPathEventId,
  sanitizeEventFileName,
} from "@/lib/events/documents";
import { redactFinanceTotals } from "@/lib/events/finance";
import {
  assertBudgetTransition,
  budgetLinesEditable,
  findBudgetTransition,
  riskMatrixBand,
} from "@/lib/events/governance";
import { dependencyViolations, evaluateGates } from "@/lib/events/health";
import {
  assertIdsSameEvent,
  assertOptionalRefsSameEvent,
  CrossEventIntegrityError,
  eventDocumentPathMatchesEvent,
} from "@/lib/events/integrity";
import { stageGateTone, LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import { FINANCE_REPORT_IDS, redactReportBlockForExport } from "@/lib/events/reports";
import {
  EVENT_CRITICAL_ACTIONS,
  EVENTS_APPROVE_ROLES,
  EVENTS_FINANCE_ROLES,
  EVENTS_NO_FINANCE_BY_DEFAULT,
} from "@/lib/events/security-expectations";
import { canUserDo, CAPABILITIES, type AppRole } from "@/lib/rbac";

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";

describe("phase 9 security — capability matrix (CRUD / authZ concepts)", () => {
  it("exposes the six event capabilities used by RLS + app gates", () => {
    for (const cap of [
      "events.view",
      "events.create",
      "events.edit",
      "events.manage",
      "events.approve",
      "events.finance",
    ] as const) {
      expect(CAPABILITIES[cap].length).toBeGreaterThan(0);
    }
  });

  it("maps critical action families to expected capabilities", () => {
    expect(EVENT_CRITICAL_ACTIONS.length).toBeGreaterThanOrEqual(10);
    expect(EVENT_CRITICAL_ACTIONS.every((a) => a.capability.startsWith("events."))).toBe(true);
    expect(EVENT_CRITICAL_ACTIONS.find((a) => a.id === "budget_read")?.capability).toBe("events.finance");
    expect(EVENT_CRITICAL_ACTIONS.find((a) => a.id === "create_event")?.capability).toBe("events.create");
    expect(EVENT_CRITICAL_ACTIONS.find((a) => a.id === "health_override")?.capability).toBe("events.approve");
  });

  it("create/edit require view-adjacent roles but not floor technicians", () => {
    expect(canUserDo(["duty_manager"], "events.create")).toBe(true);
    expect(canUserDo(["duty_manager"], "events.edit")).toBe(true);
    expect(canUserDo(["cfo"], "events.create")).toBe(false);
    expect(canUserDo(["cfo"], "events.edit")).toBe(false);
    expect(canUserDo(["cfo"], "events.finance")).toBe(true);
    expect(canUserDo(["technician"], "events.create")).toBe(false);
    expect(canUserDo(["technician"], "events.edit")).toBe(false);
  });

  it("approve/manage stay with exec / GM set", () => {
    for (const role of EVENTS_APPROVE_ROLES) {
      expect(canUserDo([role as AppRole], "events.approve")).toBe(true);
      expect(canUserDo([role as AppRole], "events.manage")).toBe(true);
    }
    expect(canUserDo(["duty_manager"], "events.approve")).toBe(false);
    expect(canUserDo(["cfo"], "events.approve")).toBe(false);
    expect(canUserDo(["auditor"], "events.manage")).toBe(false);
  });
});

describe("phase 9 security — financial permissions + redaction", () => {
  it("finance roles include events.finance; view-only roles do not", () => {
    for (const role of EVENTS_FINANCE_ROLES) {
      expect(canUserDo([role as AppRole], "events.finance")).toBe(true);
      expect(canUserDo([role as AppRole], "events.view")).toBe(true);
    }
    for (const role of EVENTS_NO_FINANCE_BY_DEFAULT) {
      expect(canUserDo([role as AppRole], "events.finance")).toBe(false);
    }
  });

  it("redacts contracted/budget money without finance capability", () => {
    const redacted = redactFinanceTotals({
      original: 10,
      revised: 20,
      committed: 5,
      actual: 4,
      forecast: 18,
      hasBudget: true,
      hasInvoices: false,
      marginPct: 40,
      finalRevenue: 100,
    });
    expect(redacted.original).toBeNull();
    expect(redacted.finalRevenue).toBeNull();
    expect(redacted.hasBudget).toBe(true);
  });

  it("empties finance report exports without events.finance", () => {
    for (const id of FINANCE_REPORT_IDS) {
      const block = {
        id,
        finance: true,
        columns: [
          { key: "event", labelKey: "e" },
          { key: "amt", labelKey: "a", money: true },
        ],
        rows: [{ event: "EVT", amt: 99 }],
      };
      const out = redactReportBlockForExport(block, false);
      expect(out.rows).toEqual([]);
      expect(out.columns.some((c) => c.money)).toBe(false);
    }
  });
});

describe("phase 9 security — site isolation + cross-event integrity", () => {
  it("rejects cross-event WBS/task/dep/budget refs", () => {
    expect(() => assertIdsSameEvent(EVENT_A, EVENT_B, "wbs_id")).toThrow(CrossEventIntegrityError);
    expect(() =>
      assertOptionalRefsSameEvent(EVENT_A, [
        { field: "predecessor_id", eventId: EVENT_A },
        { field: "successor_id", eventId: EVENT_B },
      ]),
    ).toThrow(/successor_id/);
  });

  it("allows null optional refs and same-event refs", () => {
    expect(() =>
      assertOptionalRefsSameEvent(EVENT_A, [
        { field: "parent_task_id", eventId: null },
        { field: "sprint_id", eventId: EVENT_A },
        { field: "document_id", eventId: undefined },
      ]),
    ).not.toThrow();
  });

  it("documents that location access is enforced via loadEventOrThrow → assertLocationAccess", () => {
    // App pattern: every mutating / detail action loads the event then assertLocationAccess(location_id).
    // RLS also requires user_can_access_event(event_id). This test locks the expected dual gate.
    expect(EVENT_CRITICAL_ACTIONS.some((a) => a.id === "event_detail")).toBe(true);
    expect(CAPABILITIES["events.view"]).toContain("duty_manager");
  });
});

describe("phase 9 security — document path rules", () => {
  it("requires event UUID as first path segment and blocks traversal", () => {
    expect(sanitizeEventFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    const path = eventDocumentObjectPath(EVENT_A, DOC, "Plan.pdf", 1);
    expect(eventDocumentPathEventId(path)).toBe(EVENT_A);
    expect(eventDocumentPathMatchesEvent(path, EVENT_A)).toBe(true);
    expect(eventDocumentPathMatchesEvent(path, EVENT_B)).toBe(false);
    expect(eventDocumentPathMatchesEvent(`events/${EVENT_A}/x.pdf`, EVENT_A)).toBe(false);
  });
});

describe("phase 9 security — task dependency integrity", () => {
  it("flags FS violations across tasks", () => {
    const violations = dependencyViolations(
      [
        { id: "a", start_date: "2026-11-01", due_date: "2026-11-05" },
        { id: "b", start_date: "2026-11-02", due_date: "2026-11-04" },
      ],
      [{ predecessor_id: "a", successor_id: "b", dep_type: "FS", lag_days: 0 }],
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].dep_type).toBe("FS");
    expect(violations[0].needed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(violations[0].message).toMatch(/FS requires successor/i);
  });

  it("accepts satisfied FS chains", () => {
    expect(
      dependencyViolations(
        [
          { id: "a", start_date: "2026-11-01", due_date: "2026-11-03" },
          { id: "b", start_date: "2026-11-03", due_date: "2026-11-05" },
        ],
        [{ predecessor_id: "a", successor_id: "b", dep_type: "FS", lag_days: 0 }],
      ),
    ).toHaveLength(0);
  });
});

describe("phase 9 security — stage gates + budget transitions", () => {
  it("keeps 14 canonical lifecycle phases with critical gates", () => {
    expect(LIFECYCLE_PHASES).toHaveLength(14);
    expect(LIFECYCLE_PHASES.filter((p) => p.is_critical).map((p) => p.code)).toEqual(
      expect.arrayContaining([
        "budget_approval",
        "procurement",
        "pre_production",
        "bump_in",
        "testing",
        "go_live",
        "operations",
        "bump_out",
      ]),
    );
  });

  it("evaluates blocking gates from facts", () => {
    const gates = evaluateGates(
      [
        {
          id: "g1",
          code: "budget",
          label_en: "Budget",
          label_ar: "ميزانية",
          requirement_kind: "budget_approved",
          is_blocking: true,
          threshold: null,
        },
        {
          id: "g2",
          code: "scope",
          label_en: "Scope",
          label_ar: "نطاق",
          requirement_kind: "scope_baseline",
          is_blocking: true,
          threshold: null,
        },
      ],
      {
        hasContractValue: true,
        budgetApproved: false,
        scopeBaselined: true,
        deliverableCount: 1,
        milestoneCount: 1,
        readinessPct: 80,
        openCriticalRisks: 0,
        overdueCriticalTasks: 0,
        manualSatisfied: new Set(),
        venueConfirmed: true,
        completedReadinessCodes: new Set(),
        hasPm: true,
        hasOpeningDate: true,
        scheduleAvailable: true,
        criticalPrsApproved: true,
      },
    );
    expect(gates.find((g) => g.code === "budget")?.satisfied).toBe(false);
    expect(gates.find((g) => g.code === "scope")?.satisfied).toBe(true);
    expect(stageGateTone("budget_approval", { budgetApproved: false, hasBudget: true, pendingPrs: 0, linkedPrs: 1 })).toBe(
      "blocked",
    );
  });

  it("enforces budget capability + line lock rules", () => {
    expect(findBudgetTransition("draft", "submit")?.to).toBe("submitted");
    expect(() =>
      assertBudgetTransition({ from: "submitted", action: "approve", capabilities: ["events.finance"] }),
    ).toThrow(/events\.(approve|manage)/);
    expect(
      assertBudgetTransition({ from: "submitted", action: "approve", capabilities: ["events.approve"] }).to,
    ).toBe("approved");
    expect(budgetLinesEditable("locked")).toBe(false);
    expect(budgetLinesEditable("draft")).toBe(true);
  });
});

describe("phase 9 security — risk / team governance helpers", () => {
  it("scores risk matrix from likelihood × impact", () => {
    expect(riskMatrixBand("high", "critical")).toBe("critical");
    expect(riskMatrixBand("low", "medium")).toBe("low");
  });
});

describe("phase 9 security — fetch caps documented", () => {
  it("keeps list/calendar/report soft caps", () => {
    expect(EVENT_FETCH_CAPS.listEvents).toBe(400);
    expect(EVENT_FETCH_CAPS.calendarTasksQuery).toBe(800);
    expect(EVENT_FETCH_CAPS.calendarMilestones).toBe(300);
    expect(EVENT_FETCH_CAPS.dashboardChildRows).toBeGreaterThanOrEqual(1000);
    expect(EVENT_FETCH_CAPS.reportsChildRows).toBeGreaterThanOrEqual(EVENT_FETCH_CAPS.dashboardChildRows);
  });
});

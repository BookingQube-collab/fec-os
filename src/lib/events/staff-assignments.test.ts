import { describe, expect, it } from "vitest";

import {
  assignmentRangesOverlap,
  assignmentTypeLabel,
  closeAssignmentStampNote,
  defaultPayOnEventRun,
  eventCrewReadinessMet,
  eventHireEmploymentDefaults,
  eventHireParkStatus,
  findOverlappingAssignment,
  isEventAssignmentClosed,
  isEventHireParkedStatus,
  reopenAssignmentStampNote,
  isEventStaffAssignmentType,
  looksLikeJokerPoolStaff,
  normalizeAssignmentType,
  validateAssignmentDates,
} from "@/lib/events/staff-assignments";
import {
  buildEventStaffingTemplateCsv,
  parseEventStaffingImportRows,
} from "@/lib/events/staffing-import";
import { parseCsv } from "@/lib/csv-parse";

describe("event staff assignments", () => {
  it("recognizes assignment types and labels", () => {
    expect(isEventStaffAssignmentType("joker")).toBe(true);
    expect(isEventStaffAssignmentType("loaned")).toBe(true);
    expect(isEventStaffAssignmentType("event_hire")).toBe(true);
    expect(isEventStaffAssignmentType("labour")).toBe(false);
    expect(isEventStaffAssignmentType("other")).toBe(false);
    expect(assignmentTypeLabel("joker")).toBe("Joker");
    expect(assignmentTypeLabel("labour")).toBe("Joker");
    expect(assignmentTypeLabel("loaned")).toBe("Loaned");
    expect(assignmentTypeLabel("event_hire")).toBe("Event hire");
  });

  it("normalizes legacy labour to joker", () => {
    expect(normalizeAssignmentType("labour")).toBe("joker");
    expect(normalizeAssignmentType("FEC joker")).toBe("joker");
    expect(normalizeAssignmentType("event hire")).toBe("event_hire");
    expect(normalizeAssignmentType("loaned")).toBe("loaned");
  });

  it("defaults pay_on_event_run true for all Phase 2 types", () => {
    expect(defaultPayOnEventRun("joker")).toBe(true);
    expect(defaultPayOnEventRun("loaned")).toBe(true);
    expect(defaultPayOnEventRun("event_hire")).toBe(true);
  });

  it("validates date order", () => {
    expect(validateAssignmentDates("2026-11-01", "2026-11-10")).toBeNull();
    expect(validateAssignmentDates("2026-11-10", "2026-11-01")).toMatch(/on or after/);
    expect(validateAssignmentDates("", "2026-11-01")).toMatch(/required/);
  });

  it("detects inclusive range overlaps", () => {
    expect(assignmentRangesOverlap("2026-11-01", "2026-11-05", "2026-11-05", "2026-11-10")).toBe(
      true,
    );
    expect(assignmentRangesOverlap("2026-11-01", "2026-11-04", "2026-11-05", "2026-11-10")).toBe(
      false,
    );
  });

  it("flags overlapping assignments for the same staff", () => {
    const existing = [
      {
        id: "a1",
        staff_id: "s1",
        assignment_type: "loaned",
        date_from: "2026-11-01",
        date_to: "2026-11-10",
      },
      {
        id: "a2",
        staff_id: "s2",
        assignment_type: "joker",
        date_from: "2026-11-01",
        date_to: "2026-11-10",
      },
    ];
    expect(
      findOverlappingAssignment(existing, {
        staff_id: "s1",
        assignment_type: "loaned",
        date_from: "2026-11-08",
        date_to: "2026-11-15",
      })?.id,
    ).toBe("a1");
    expect(
      findOverlappingAssignment(
        existing,
        {
          id: "a1",
          staff_id: "s1",
          assignment_type: "loaned",
          date_from: "2026-11-01",
          date_to: "2026-11-12",
        },
        "a1",
      ),
    ).toBeNull();
    expect(
      findOverlappingAssignment(existing, {
        staff_id: "s1",
        assignment_type: "loaned",
        date_from: "2026-11-11",
        date_to: "2026-11-15",
      }),
    ).toBeNull();
  });

  it("marks event crew readiness when assignments exist", () => {
    expect(eventCrewReadinessMet([])).toBe(false);
    expect(eventCrewReadinessMet([{ id: "1" }])).toBe(true);
  });

  it("suggests temporary employment for event-only hires", () => {
    expect(eventHireEmploymentDefaults("2026-12-01", "2026-12-15")).toEqual({
      employmentType: "temporary",
      status: "active",
      hireDate: "2026-12-01",
      contractStart: "2026-12-01",
      contractEnd: "2026-12-15",
      jobTitle: "Event hire",
    });
  });

  it("recognizes joker-pool staff", () => {
    expect(looksLikeJokerPoolStaff({ employment_type: "joker", status: "active" })).toBe(true);
    expect(looksLikeJokerPoolStaff({ employment_type: "permanent", status: "joker" })).toBe(true);
    expect(looksLikeJokerPoolStaff({ employment_type: "permanent", status: "active" })).toBe(
      false,
    );
  });

  it("closes and parks event hires clearly", () => {
    expect(isEventAssignmentClosed({ status: "closed" })).toBe(true);
    expect(isEventAssignmentClosed({ status: "active" })).toBe(false);
    expect(eventHireParkStatus()).toBe("contract_finished");
    expect(isEventHireParkedStatus("contract_finished")).toBe(true);
    expect(isEventHireParkedStatus("active")).toBe(false);
    expect(closeAssignmentStampNote("2026-11-05", "abcd1234-xxxx")).toMatch(/Closed via event/);
    expect(reopenAssignmentStampNote("2026-11-08")).toMatch(/Reopened via event/);
  });

  it("parses staffing import template", () => {
    const preview = parseEventStaffingImportRows(parseCsv(buildEventStaffingTemplateCsv()));
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]?.assignment_type).toBe("joker");
    expect(preview.rows[1]?.assignment_type).toBe("loaned");
    expect(preview.rows[2]?.assignment_type).toBe("event_hire");
  });

  it("accepts legacy labour type in import files", () => {
    const preview = parseEventStaffingImportRows([
      {
        employee_code: "X-1",
        assignment_type: "labour",
        role_label: "Crew",
        date_from: "2026-08-01",
        date_to: "2026-08-05",
      },
    ]);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]?.assignment_type).toBe("joker");
  });
});

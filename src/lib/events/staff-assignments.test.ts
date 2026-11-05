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
  isEventStaffAssignmentType,
  looksLikeLabourPoolStaff,
  validateAssignmentDates,
} from "@/lib/events/staff-assignments";

describe("event staff assignments", () => {
  it("recognizes assignment types and labels", () => {
    expect(isEventStaffAssignmentType("labour")).toBe(true);
    expect(isEventStaffAssignmentType("loaned")).toBe(true);
    expect(isEventStaffAssignmentType("event_hire")).toBe(true);
    expect(isEventStaffAssignmentType("other")).toBe(false);
    expect(assignmentTypeLabel("labour")).toBe("Labour");
    expect(assignmentTypeLabel("loaned")).toBe("Loaned");
    expect(assignmentTypeLabel("event_hire")).toBe("Event hire");
  });

  it("defaults pay_on_event_run true for all Phase 2 types", () => {
    expect(defaultPayOnEventRun("labour")).toBe(true);
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
        assignment_type: "labour",
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

  it("recognizes labour-pool staff", () => {
    expect(looksLikeLabourPoolStaff({ employment_type: "joker", status: "active" })).toBe(true);
    expect(looksLikeLabourPoolStaff({ employment_type: "permanent", status: "joker" })).toBe(true);
    expect(looksLikeLabourPoolStaff({ employment_type: "permanent", status: "active" })).toBe(
      false,
    );
  });

  it("closes and parks event hires clearly", () => {
    expect(isEventAssignmentClosed({ status: "closed" })).toBe(true);
    expect(isEventAssignmentClosed({ status: "active" })).toBe(false);
    expect(eventHireParkStatus()).toBe("contract_finished");
    expect(closeAssignmentStampNote("2026-11-05", "abcd1234-xxxx")).toMatch(/Closed via event/);
  });
});

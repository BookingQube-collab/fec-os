import { describe, expect, it } from "vitest";

import {
  eventCrewScheduleAddShiftMode,
  eventCrewScheduleCategoryRoleLabel,
  groupByEventCrewScheduleCategory,
  isLabourStyleEventCrewCategory,
  resolveEventCrewScheduleCategory,
  selectCrewForScheduleCategory,
} from "./crew-schedule-categories";

describe("resolveEventCrewScheduleCategory", () => {
  it("maps explicit event role_label over job title", () => {
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "Cleaner",
        job_title: "Crew / Attendant",
      }),
    ).toBe("cleaner");
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "Maintenance Team",
        job_title: "Cashier",
      }),
    ).toBe("maintenance");
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "Management Team",
        job_title: "Crew / Attendant",
        is_head_office: false,
      }),
    ).toBe("management");
  });

  it("treats generic crew role as soft and falls through to job / HO", () => {
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "crew",
        job_title: "Cleaner",
      }),
    ).toBe("cleaner");
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "Crew",
        job_title: "Maintenance Assistant / Electrician",
      }),
    ).toBe("maintenance");
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "crew",
        is_head_office: true,
      }),
    ).toBe("management");
  });

  it("defaults site floor roles to Crew", () => {
    expect(
      resolveEventCrewScheduleCategory({
        role_label: null,
        job_title: "Crew / Attendant",
      }),
    ).toBe("crew");
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "Cashier",
        job_title: null,
        is_head_office: true,
      }),
    ).toBe("crew");
    expect(resolveEventCrewScheduleCategory({})).toBe("crew");
  });

  it("maps FEC arcade technician job to Crew (not Maintenance)", () => {
    expect(
      resolveEventCrewScheduleCategory({
        role_label: "crew",
        job_title: "FEC Arcade Technician",
      }),
    ).toBe("crew");
  });
});

describe("groupByEventCrewScheduleCategory", () => {
  it("keeps category order and drops empty buckets", () => {
    const groups = groupByEventCrewScheduleCategory(
      [
        { id: "m", role: "management" as const },
        { id: "c", role: "crew" as const },
        { id: "cl", role: "cleaner" as const },
      ],
      (row) => row.role,
    );
    expect(groups.map((g) => g.category)).toEqual(["crew", "cleaner", "management"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["c"]);
  });
});

describe("eventCrewScheduleCategoryRoleLabel", () => {
  it("returns stable persist labels", () => {
    expect(eventCrewScheduleCategoryRoleLabel("crew")).toBe("Crew");
    expect(eventCrewScheduleCategoryRoleLabel("cleaner")).toBe("Cleaner");
    expect(eventCrewScheduleCategoryRoleLabel("maintenance")).toBe("Maintenance Team");
    expect(eventCrewScheduleCategoryRoleLabel("management")).toBe("Management Team");
  });
});

describe("eventCrewScheduleAddShiftMode", () => {
  it("uses labour day assignment (no shift module) for Cleaner and Maintenance", () => {
    expect(eventCrewScheduleAddShiftMode("cleaner")).toBe("labour_days");
    expect(eventCrewScheduleAddShiftMode("maintenance")).toBe("labour_days");
    expect(isLabourStyleEventCrewCategory("cleaner")).toBe(true);
    expect(isLabourStyleEventCrewCategory("maintenance")).toBe(true);
  });

  it("uses single event-day shifts for Crew and Management", () => {
    expect(eventCrewScheduleAddShiftMode("crew")).toBe("event_day");
    expect(eventCrewScheduleAddShiftMode("management")).toBe("event_day");
    expect(isLabourStyleEventCrewCategory("crew")).toBe(false);
    expect(isLabourStyleEventCrewCategory("management")).toBe(false);
  });
});

describe("selectCrewForScheduleCategory", () => {
  it("filters by category and dedupes staff_id (first wins)", () => {
    const selected = selectCrewForScheduleCategory(
      [
        {
          staff_id: "c1",
          assignment_id: "a1",
          role_label: "Crew",
          job_title: "Crew / Attendant",
        },
        {
          staff_id: "cl1",
          assignment_id: "a2",
          role_label: "Cleaner",
          job_title: "Cleaner",
        },
        {
          staff_id: "c1",
          assignment_id: "a3",
          role_label: "Crew",
          job_title: "Crew / Attendant",
        },
        {
          staff_id: "m1",
          role_label: "crew",
          is_head_office: true,
        },
      ],
      "crew",
    );
    expect(selected.map((s) => s.staff_id)).toEqual(["c1"]);
    expect(selected[0].assignment_id).toBe("a1");
  });

  it("selects labour and management categories from role / HO signals", () => {
    const pool = [
      { staff_id: "cl1", role_label: "Cleaner", job_title: null },
      { staff_id: "mt1", role_label: "Maintenance Team", job_title: null },
      { staff_id: "mg1", role_label: null, job_title: "General Manager", is_head_office: true },
      { staff_id: "c1", role_label: "Crew", job_title: "Cashier" },
    ];
    expect(selectCrewForScheduleCategory(pool, "cleaner").map((s) => s.staff_id)).toEqual(["cl1"]);
    expect(selectCrewForScheduleCategory(pool, "maintenance").map((s) => s.staff_id)).toEqual([
      "mt1",
    ]);
    expect(selectCrewForScheduleCategory(pool, "management").map((s) => s.staff_id)).toEqual([
      "mg1",
    ]);
  });

  it("returns empty when no candidates match the role", () => {
    expect(
      selectCrewForScheduleCategory(
        [{ staff_id: "c1", role_label: "Crew", job_title: "Crew / Attendant" }],
        "cleaner",
      ),
    ).toEqual([]);
  });
});

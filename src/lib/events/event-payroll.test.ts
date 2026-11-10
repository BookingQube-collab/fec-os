import { describe, expect, it } from "vitest";

import { enumerateDatesInclusive } from "@/lib/events/event-schedule";
import {
  collectEventPaidDays,
  computeLabourDayPayQar,
  EVENT_PAY_POLICY,
  eventPaidDayKey,
  eventPayOpenWindow,
  eventPayrollBatchLabel,
  eventPeriodMonthAnchor,
  excludeEventPaidDaysFromMonthly,
  isEventLabourerRole,
  isEventPayrollEligibleCategory,
  isEventPayrollPeriod,
  labourDayPayUnits,
  labourDayPayUnitsFromMinutes,
  payrollExportMonthLabel,
  resolveEventPayTrack,
  staffIdsForEventPayRun,
  staffIdsForEventPayRunByTrack,
  summarizeEventPayGenerateBlockers,
  sumLabourDayPayUnitsForStaff,
} from "@/lib/events/event-payroll";

describe("event payroll helpers", () => {
  const assignments = [
    {
      staff_id: "loaned1",
      assignment_type: "loaned",
      date_from: "2026-11-05",
      date_to: "2026-11-07",
      pay_on_event_run: true,
    },
    {
      staff_id: "hire1",
      assignment_type: "event_hire",
      date_from: "2026-11-05",
      date_to: "2026-11-06",
      pay_on_event_run: true,
    },
    {
      staff_id: "skip1",
      assignment_type: "loaned",
      date_from: "2026-11-05",
      date_to: "2026-11-05",
      pay_on_event_run: false,
    },
  ];

  it("collects event-paid day keys", () => {
    const days = collectEventPaidDays(assignments, enumerateDatesInclusive);
    expect(days.has(eventPaidDayKey("loaned1", "2026-11-05"))).toBe(true);
    expect(days.has(eventPaidDayKey("loaned1", "2026-11-07"))).toBe(true);
    expect(days.has(eventPaidDayKey("skip1", "2026-11-05"))).toBe(false);
  });

  it("lists staff for event pay window", () => {
    expect(staffIdsForEventPayRun(assignments, "2026-11-05", "2026-11-07").sort()).toEqual([
      "hire1",
      "loaned1",
    ]);
  });

  it("excludes event-paid days from monthly day inputs", () => {
    const days = collectEventPaidDays(assignments, enumerateDatesInclusive);
    const filtered = excludeEventPaidDaysFromMonthly(
      [
        { staff_id: "loaned1", work_date: "2026-11-05" },
        { staff_id: "loaned1", work_date: "2026-11-08" },
        { staff_id: "other", work_date: "2026-11-05" },
      ],
      days,
    );
    expect(filtered).toEqual([
      { staff_id: "loaned1", work_date: "2026-11-08" },
      { staff_id: "other", work_date: "2026-11-05" },
    ]);
  });

  it("anchors event period month and detects kind", () => {
    expect(eventPeriodMonthAnchor("2026-12-15")).toBe("2026-12");
    expect(isEventPayrollPeriod({ periodKind: "event" })).toBe(true);
    expect(isEventPayrollPeriod({ period_kind: "monthly" })).toBe(false);
  });

  it("labels event WPS batches without breaking monthly months", () => {
    expect(eventPayrollBatchLabel("InflataRun")).toBe("Event: InflataRun");
    expect(eventPayrollBatchLabel("Event: Lego")).toBe("Event: Lego");
    expect(
      payrollExportMonthLabel({
        periodKind: "event",
        month: "2026-11",
        displayName: "InflataCity",
      }),
    ).toBe("Event: InflataCity");
    expect(payrollExportMonthLabel({ periodKind: "monthly", month: "2026-11" })).toBe("2026-11");
  });
});

describe("event pay eligibility and tracks", () => {
  it("excludes management categories from event payroll", () => {
    expect(isEventPayrollEligibleCategory("management")).toBe(false);
    expect(isEventPayrollEligibleCategory("crew")).toBe(true);
    expect(isEventPayrollEligibleCategory("cleaner")).toBe(true);
    expect(isEventPayrollEligibleCategory("maintenance")).toBe(true);
  });

  it("detects labourer roles separately from crew staff", () => {
    expect(isEventLabourerRole("Labourer")).toBe(true);
    expect(isEventLabourerRole("Day labour")).toBe(true);
    expect(isEventLabourerRole("Crew")).toBe(false);
    expect(isEventLabourerRole("Cleaner")).toBe(false);
  });

  it("resolves labour vs staff tracks and omits management", () => {
    expect(resolveEventPayTrack({ role_label: "Labourer" })).toBe("labour");
    expect(resolveEventPayTrack({ role_label: "Crew" })).toBe("staff");
    expect(resolveEventPayTrack({ role_label: "Cleaner" })).toBe("staff");
    expect(resolveEventPayTrack({ role_label: "Maintenance Team" })).toBe("staff");
    expect(resolveEventPayTrack({ role_label: "Management", is_head_office: true })).toBeNull();
    expect(resolveEventPayTrack({ role_label: "crew", is_head_office: true })).toBeNull();
  });

  it("splits pay-run staff by track and drops management", () => {
    const split = staffIdsForEventPayRunByTrack(
      [
        {
          staff_id: "lab1",
          assignment_type: "joker",
          role_label: "Labourer",
          date_from: "2026-11-05",
          date_to: "2026-11-07",
          pay_on_event_run: true,
        },
        {
          staff_id: "crew1",
          assignment_type: "loaned",
          role_label: "Crew",
          date_from: "2026-11-05",
          date_to: "2026-11-07",
          pay_on_event_run: true,
        },
        {
          staff_id: "clean1",
          assignment_type: "loaned",
          role_label: "Cleaner",
          date_from: "2026-11-05",
          date_to: "2026-11-06",
          pay_on_event_run: true,
        },
        {
          staff_id: "mgr1",
          assignment_type: "loaned",
          role_label: "Management",
          is_head_office: true,
          date_from: "2026-11-05",
          date_to: "2026-11-07",
          pay_on_event_run: true,
        },
        {
          staff_id: "off1",
          assignment_type: "loaned",
          role_label: "Crew",
          date_from: "2026-11-05",
          date_to: "2026-11-05",
          pay_on_event_run: false,
        },
      ],
      "2026-11-05",
      "2026-11-07",
    );
    expect(split.labour.sort()).toEqual(["lab1"]);
    expect(split.staff.sort()).toEqual(["clean1", "crew1"]);
    expect(split.all.sort()).toEqual(["clean1", "crew1", "lab1"]);
  });

  it("returns zero eligible staff when seed assignment dates miss the open window", () => {
    const seededOutsideOpen = [
      {
        staff_id: "lab1",
        assignment_type: "event_hire",
        role_label: "Labourer",
        date_from: "2026-11-23",
        date_to: "2026-12-06",
        pay_on_event_run: true,
      },
      {
        staff_id: "crew1",
        assignment_type: "event_hire",
        role_label: "Crew",
        date_from: "2026-11-23",
        date_to: "2026-12-06",
        pay_on_event_run: true,
      },
    ];
    // Period synced to event open dates that do not overlap seed From–To.
    expect(staffIdsForEventPayRunByTrack(seededOutsideOpen, "2026-11-02", "2026-11-08").all).toEqual(
      [],
    );
    const blockers = summarizeEventPayGenerateBlockers(
      seededOutsideOpen,
      "2026-11-02",
      "2026-11-08",
    );
    expect(blockers.payOnEvent).toBe(2);
    expect(blockers.overlappingOpenWindow).toBe(0);
    expect(blockers.eligibleStaff).toBe(0);
  });

  it("encodes labour day rate × paid calendar days policy", () => {
    expect(EVENT_PAY_POLICY.paidWindow).toBe("event_open_dates");
    expect(EVENT_PAY_POLICY.labourTrack).toBe("day_rate_times_paid_days");
    expect(EVENT_PAY_POLICY.managementExcluded).toBe(true);
    expect(EVENT_PAY_POLICY.labourDayPayUsesHoursOverBaseline).toBe(false);
  });
});

describe("event pay open window", () => {
  it("prefers event_start → event_end over venue/dismantle", () => {
    expect(
      eventPayOpenWindow({
        event_start: "2026-11-10",
        event_end: "2026-11-12",
        venue_access: "2026-11-08",
        dismantle_end: "2026-11-14",
      }),
    ).toEqual({ dateFrom: "2026-11-10", dateTo: "2026-11-12" });
  });

  it("falls back to venue/setup/dismantle when open dates are missing", () => {
    expect(
      eventPayOpenWindow({
        event_start: null,
        event_end: null,
        venue_access: "2026-11-08",
        setup_start: "2026-11-09",
        dismantle_end: "2026-11-14",
      }),
    ).toEqual({ dateFrom: "2026-11-08", dateTo: "2026-11-14" });
  });
});

describe("labour hours helpers (schedule/UI)", () => {
  it("converts hours to day units vs 10h baseline (20h = double)", () => {
    expect(labourDayPayUnits(10)).toBe(1);
    expect(labourDayPayUnits(20)).toBe(2);
    expect(labourDayPayUnits(5)).toBe(0.5);
    expect(labourDayPayUnitsFromMinutes(600)).toBe(1);
    expect(labourDayPayUnitsFromMinutes(1200)).toBe(2);
  });

  it("computes day pay as (hours / 10) × daily rate", () => {
    expect(computeLabourDayPayQar(10, 100)).toBe(100);
    expect(computeLabourDayPayQar(20, 100)).toBe(200);
    expect(computeLabourDayPayQar(5, 100)).toBe(50);
  });

  it("sums attendance-derived units for a staff member", () => {
    const units = sumLabourDayPayUnitsForStaff(
      [
        {
          staff_id: "lab1",
          work_date: "2026-11-05",
          status: "present",
          worked_minutes: 1200,
        },
        {
          staff_id: "lab1",
          work_date: "2026-11-06",
          status: "present",
          worked_minutes: 600,
        },
        {
          staff_id: "other",
          work_date: "2026-11-05",
          status: "present",
          worked_minutes: 1200,
        },
      ],
      "lab1",
    );
    expect(units).toBe(3);
  });
});

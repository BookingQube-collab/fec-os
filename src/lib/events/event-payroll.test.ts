import { describe, expect, it } from "vitest";

import { enumerateDatesInclusive } from "@/lib/events/event-schedule";
import {
  collectEventPaidDays,
  computeLabourDayPayQar,
  eventPaidDayKey,
  eventPayrollBatchLabel,
  eventPeriodMonthAnchor,
  excludeEventPaidDaysFromMonthly,
  isEventPayrollPeriod,
  labourDayPayUnits,
  labourDayPayUnitsFromMinutes,
  payrollExportMonthLabel,
  staffIdsForEventPayRun,
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

describe("labour 10h day pay", () => {
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


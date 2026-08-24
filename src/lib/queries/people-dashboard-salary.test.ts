import { describe, expect, it } from "vitest";

import {
  aggregateActiveRosterSalary,
  stripPeopleDashboardSalary,
  type PeopleDashboardPayload,
} from "./people-dashboard.core";

const locations = [
  { id: "inf", code: "INF-CC", name: "Inflatapark" },
  { id: "kds", code: "KDS-CC", name: "Kids Driving School" },
];

describe("aggregateActiveRosterSalary", () => {
  it("sums monthly salary for active roster only and flags daily-rate staff as missing", () => {
    const result = aggregateActiveRosterSalary(
      [
        { id: "a", location_id: "inf", status: "active" },
        { id: "b", location_id: "inf", status: "on_leave" },
        { id: "c", location_id: "kds", status: null },
        { id: "d", location_id: "kds", status: "terminated" },
        { id: "e", location_id: "inf", status: "active" },
      ],
      locations,
      [
        { staff_id: "a", monthly_salary_qar: 4000, daily_rate_qar: null },
        { staff_id: "b", monthly_salary_qar: 3500, daily_rate_qar: null },
        { staff_id: "c", monthly_salary_qar: null, daily_rate_qar: 120 },
        { staff_id: "d", monthly_salary_qar: 9000, daily_rate_qar: null },
      ],
    );

    expect(result.total).toBe(7500);
    expect(result.missing_monthly).toBe(2);
    expect(result.daily_rate_only).toBe(1);
    expect(result.by_location.map((l) => l.code)).toEqual(["INF-CC", "KDS-CC"]);
    expect(result.by_location[0]).toMatchObject({
      monthly_salary_qar: 7500,
      roster_headcount: 3,
      missing_monthly: 1,
    });
    expect(result.by_location[1]).toMatchObject({
      monthly_salary_qar: 0,
      roster_headcount: 1,
      missing_monthly: 1,
      daily_rate_only: 1,
    });
  });
});

describe("stripPeopleDashboardSalary", () => {
  it("nulls salary fields without touching headcount", () => {
    const payload = {
      kpis: {
        total_staff: 4,
        active_staff: 3,
        inactive_staff: 1,
        on_leave: 1,
        terminated: 0,
        locations_with_staff: 2,
        permanent: 3,
        temporary: 1,
        missing_qid: 0,
        missing_contact: 0,
        missing_joining_date: 0,
        total_monthly_salary_qar: 12000,
        missing_monthly_salary: 2,
        daily_rate_only: 1,
      },
      staff_by_location: [{ code: "INF-CC", name: "Inflatapark", count: 3 }],
      staff_by_job_title: [],
      staff_by_department: [],
      staff_by_status: [],
      staff_by_employment_type: [],
      salary_by_location: [
        {
          code: "INF-CC",
          name: "Inflatapark",
          monthly_salary_qar: 12000,
          roster_headcount: 3,
          missing_monthly: 0,
          daily_rate_only: 0,
        },
      ],
      recent_hires: [],
    } satisfies PeopleDashboardPayload;

    const stripped = stripPeopleDashboardSalary(payload);
    expect(stripped.kpis.total_monthly_salary_qar).toBeNull();
    expect(stripped.kpis.missing_monthly_salary).toBeNull();
    expect(stripped.kpis.daily_rate_only).toBeNull();
    expect(stripped.salary_by_location).toBeNull();
    expect(stripped.kpis.total_staff).toBe(4);
    expect(stripped.staff_by_location[0].count).toBe(3);
  });
});

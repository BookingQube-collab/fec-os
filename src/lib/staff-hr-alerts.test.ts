import { describe, expect, it } from "vitest";

import type { StaffRow } from "@/lib/queries/module-queries.core";
import { computeHrAttention, staffHrAlerts } from "./staff-hr-alerts";

function row(partial: Partial<StaffRow> & Pick<StaffRow, "id" | "full_name" | "employee_code">): StaffRow {
  return {
    job_title: null,
    department: null,
    department_ids: [],
    department_names: [],
    status: "active",
    location_id: "",
    location_code: null,
    location_name: null,
    is_roaming: false,
    work_locations: [],
    work_location_ids: [],
    phone: "50000000",
    email: null,
    hire_date: "2020-01-01",
    qid: "123",
    e3_enrolled: null,
    employment_type: null,
    staff_role: null,
    has_photo: false,
    photo_updated_at: null,
    ...partial,
  };
}

describe("staffHrAlerts", () => {
  it("returns empty when clean", () => {
    expect(
      staffHrAlerts(
        row({
          id: "1",
          full_name: "Clean",
          employee_code: "E1",
          qid_expiry: "2099-01-01",
          passport_expiry: "2099-01-01",
        }),
        "2026-09-24",
      ),
    ).toEqual([]);
  });

  it("flags missing info and expired QID with severity labels", () => {
    const alerts = staffHrAlerts(
      row({
        id: "2",
        full_name: "Missing",
        employee_code: "E2",
        qid: null,
        phone: null,
        hire_date: null,
        qid_expiry: "2020-01-01",
      }),
      "2026-09-24",
    );
    expect(alerts.some((a) => a.kind === "missing")).toBe(true);
    expect(alerts.some((a) => a.kind === "qid" && a.severity === "expired")).toBe(true);
  });
});

describe("computeHrAttention", () => {
  it("counts attention buckets", () => {
    const buckets = computeHrAttention(
      [
        row({
          id: "1",
          full_name: "A",
          employee_code: "E1",
          qid_expiry: "2026-09-01",
          status: "probation",
        }),
        row({
          id: "2",
          full_name: "B",
          employee_code: "E2",
          qid: null,
          phone: null,
          hire_date: null,
        }),
      ],
      "2026-09-24",
    );
    expect(buckets.find((b) => b.key === "qid_expired")?.count).toBe(1);
    expect(buckets.find((b) => b.key === "missing")?.count).toBe(1);
    expect(buckets.find((b) => b.key === "probation")?.count).toBe(1);
  });
});

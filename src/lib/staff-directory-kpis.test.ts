import { describe, expect, it } from "vitest";

import type { StaffRow } from "@/lib/queries/module-queries.core";
import { computeStaffDirectoryKpis, filterStaffDirectory } from "./staff-directory-kpis";

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
    phone: null,
    email: null,
    hire_date: null,
    qid: null,
    e3_enrolled: null,
    employment_type: null,
    staff_role: null,
    has_photo: false,
    photo_updated_at: null,
    ...partial,
  };
}

const staff: StaffRow[] = [
  row({
    id: "1",
    full_name: "Alice Permanent",
    employee_code: "E1",
    employment_type: "permanent",
    job_title: "Cashier",
    location_code: "KDS",
    location_name: "Kids",
  }),
  row({
    id: "2",
    full_name: "Bob Joker",
    employee_code: "E2",
    employment_type: "joker",
    job_title: "Cashier",
    location_code: "FEC",
    location_name: "Main",
  }),
  row({
    id: "3",
    full_name: "Cara Secondment",
    employee_code: "E3",
    employment_type: "secondment",
    job_title: "Supervisor",
    location_code: "KDS",
    location_name: "Kids",
  }),
  row({
    id: "4",
    full_name: "Dan Inactive",
    employee_code: "E4",
    employment_type: "permanent",
    job_title: "Cashier",
    status: "terminated",
    location_code: "KDS",
    location_name: "Kids",
  }),
];

const base = {
  q: "",
  loc: "",
  position: "",
  department: "",
  type: "",
  e3: "",
  status: "active",
  missing: false,
  sort: "name" as const,
};

describe("staff directory KPIs follow filters", () => {
  it("matches table rows for active default scope", () => {
    const filtered = filterStaffDirectory(staff, base);
    expect(computeStaffDirectoryKpis(filtered)).toEqual({
      total: 3,
      permanent: 1,
      joker: 1,
      secondment: 1,
    });
  });

  it("updates when location / position / search change", () => {
    const byLoc = filterStaffDirectory(staff, { ...base, loc: "KDS" });
    expect(computeStaffDirectoryKpis(byLoc)).toEqual({
      total: 2,
      permanent: 1,
      joker: 0,
      secondment: 1,
    });

    const byPos = filterStaffDirectory(staff, { ...base, position: "Supervisor" });
    expect(computeStaffDirectoryKpis(byPos)).toEqual({
      total: 1,
      permanent: 0,
      joker: 0,
      secondment: 1,
    });

    const bySearch = filterStaffDirectory(staff, { ...base, q: "bob" });
    expect(computeStaffDirectoryKpis(bySearch)).toEqual({
      total: 1,
      permanent: 0,
      joker: 1,
      secondment: 0,
    });
  });

  it("matches when the selected department is one of several on the person", () => {
    const withDepts: StaffRow[] = [
      row({
        id: "a",
        full_name: "Cafe And Ops",
        employee_code: "A1",
        employment_type: "permanent",
        department_ids: ["fb-cafe", "ops"],
        department_names: ["F&B Cafe", "Operations"],
      }),
      row({
        id: "b",
        full_name: "Ops Only",
        employee_code: "B1",
        employment_type: "joker",
        department_ids: ["ops"],
        department_names: ["Operations"],
      }),
      row({
        id: "c",
        full_name: "No Dept",
        employee_code: "C1",
        employment_type: "secondment",
        department_ids: [],
      }),
    ];
    const filtered = filterStaffDirectory(withDepts, { ...base, department: "fb-cafe" });
    expect(filtered.map((s) => s.id)).toEqual(["a"]);
    expect(computeStaffDirectoryKpis(filtered)).toEqual({
      total: 1,
      permanent: 1,
      joker: 0,
      secondment: 0,
    });
  });

  it("zeros other type cards when type filter is on (same as table)", () => {
    const filtered = filterStaffDirectory(staff, { ...base, type: "joker" });
    expect(filtered.map((s) => s.id)).toEqual(["2"]);
    expect(computeStaffDirectoryKpis(filtered)).toEqual({
      total: 1,
      permanent: 0,
      joker: 1,
      secondment: 0,
    });
  });
});

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
    status: "secondment",
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
  nationality: "",
  gender: "",
  sponsorship: "",
  missing: false,
  expiry: "",
  sort: "name" as const,
};

describe("staff directory KPIs follow filters", () => {
  it("matches table rows for active default scope", () => {
    const filtered = filterStaffDirectory(staff, base);
    const kpis = computeStaffDirectoryKpis(filtered);
    expect(kpis.total).toBe(3);
    expect(kpis.active).toBe(2);
    expect(kpis.secondment).toBe(1);
  });

  it("updates when location / position / search change", () => {
    const byLoc = filterStaffDirectory(staff, { ...base, loc: "KDS" });
    expect(computeStaffDirectoryKpis(byLoc).total).toBe(2);

    const byPos = filterStaffDirectory(staff, { ...base, position: "Supervisor" });
    expect(computeStaffDirectoryKpis(byPos).secondment).toBe(1);

    const bySearch = filterStaffDirectory(staff, { ...base, q: "bob" });
    expect(computeStaffDirectoryKpis(bySearch).total).toBe(1);
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
    ];
    const filtered = filterStaffDirectory(withDepts, { ...base, department: "fb-cafe" });
    expect(filtered.map((s) => s.id)).toEqual(["a"]);
    expect(computeStaffDirectoryKpis(filtered).total).toBe(1);
  });

  it("matches legacy department text when junction ids are empty", () => {
    const withLegacy: StaffRow[] = [
      row({
        id: "legacy",
        full_name: "Cafe Legacy",
        employee_code: "L1",
        employment_type: "permanent",
        department: "F&B Cafe",
        department_ids: [],
        department_names: [],
      }),
      row({
        id: "compound",
        full_name: "Cafe Plus Ops",
        employee_code: "L2",
        employment_type: "joker",
        department: "F&B Cafe + Operations",
        department_ids: [],
        department_names: [],
      }),
    ];
    const filtered = filterStaffDirectory(withLegacy, {
      ...base,
      department: "fb-cafe",
      departmentName: "F&B Cafe",
    });
    expect(filtered.map((s) => s.id)).toEqual(["legacy", "compound"]);
  });

  it("zeros other type cards when type filter is on (same as table)", () => {
    const filtered = filterStaffDirectory(staff, { ...base, type: "joker" });
    expect(filtered.map((s) => s.id)).toEqual(["2"]);
    expect(computeStaffDirectoryKpis(filtered).total).toBe(1);
  });

  it("searches passport and position", () => {
    const withPass = [
      ...staff,
      row({
        id: "5",
        full_name: "Eve Passport",
        employee_code: "E5",
        passport_number: "P1234567",
        job_title: "Technician",
      }),
    ];
    expect(filterStaffDirectory(withPass, { ...base, q: "p123" }).map((s) => s.id)).toEqual(["5"]);
    expect(filterStaffDirectory(withPass, { ...base, q: "technician" }).map((s) => s.id)).toEqual(["5"]);
  });
});

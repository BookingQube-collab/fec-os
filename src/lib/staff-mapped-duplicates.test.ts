import { describe, expect, it } from "vitest";

import type { StaffRow } from "@/lib/queries/module-queries.core";
import { computeStaffDirectoryKpis, filterStaffDirectory } from "@/lib/staff-directory-kpis";

import { hiddenUnmappedDuplicateIds, type StaffIdentityRow } from "./staff-mapped-duplicates";

const UA = "loc-ua-dr";

function person(partial: Partial<StaffIdentityRow> & Pick<StaffIdentityRow, "id" | "employee_code">): StaffIdentityRow {
  return {
    full_name: "Sarah Oxel",
    location_id: UA,
    phone: null,
    user_id: null,
    attendance_mapped: false,
    ...partial,
  };
}

const directoryFilters = {
  q: "sarah",
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

function directoryRow(identity: StaffIdentityRow, extra: Partial<StaffRow> = {}): StaffRow {
  return {
    id: identity.id,
    employee_code: identity.employee_code,
    full_name: identity.full_name,
    job_title: null,
    department: null,
    department_ids: [],
    department_names: [],
    status: "active",
    location_id: identity.location_id,
    location_code: "UA-DR",
    location_name: "Urban Arena",
    is_roaming: false,
    work_locations: [],
    work_location_ids: [],
    phone: identity.phone ?? null,
    email: null,
    hire_date: null,
    qid: null,
    e3_enrolled: null,
    employment_type: "temporary",
    staff_role: null,
    has_photo: false,
    photo_updated_at: null,
    ...extra,
  };
}

describe("hiddenUnmappedDuplicateIds", () => {
  it("keeps the master employee code and hides the generated location stub", () => {
    const master = person({
      id: "master",
      employee_code: "543",
      phone: "+97470054113",
    });
    const stub = person({ id: "stub", employee_code: "UA-DR-STF84" });
    const other = person({
      id: "other",
      full_name: "Sarah Khan",
      employee_code: "UA-DR-STF90",
    });

    const hidden = hiddenUnmappedDuplicateIds([master, stub, other]);

    expect(hidden).toEqual(new Set(["stub"]));
  });

  it("does not collapse people who only share a first name", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "a", full_name: "Sarah", employee_code: "543" }),
      person({ id: "b", full_name: "Sarah", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("does not collapse the same full name at a different location", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "a", employee_code: "543", location_id: UA }),
      person({ id: "b", employee_code: "UA-DM-STF01", location_id: "loc-ua-dm" }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("hides a generated stub that shares name and phone with the master", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({
        id: "master",
        employee_code: "543",
        phone: "70054113",
        location_id: UA,
      }),
      person({
        id: "stub",
        employee_code: "UA-DM-STF02",
        phone: "+97470054113",
        location_id: "loc-other",
      }),
    ]);
    expect(hidden).toEqual(new Set(["stub"]));
  });

  it("keeps two real employee codes when neither is login- or attendance-mapped", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "a", employee_code: "543" }),
      person({ id: "b", employee_code: "544" }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("keeps only the login-mapped real record when two master codes exist", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "mapped", employee_code: "543", user_id: "user-1" }),
      person({ id: "plain", employee_code: "544" }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden).toEqual(new Set(["plain", "stub"]));
  });

  it("keeps the attendance-mapped generated row when there is no master code", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "mapped", employee_code: "UA-DR-STF01", attendance_mapped: true }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden).toEqual(new Set(["stub"]));
  });

  it("leaves two generated rows when neither is mapped", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "a", employee_code: "UA-DR-STF01" }),
      person({ id: "b", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("directory search and headcount use the mapped row only", () => {
    const master = person({ id: "master", employee_code: "543", phone: "+97470054113" });
    const stub = person({ id: "stub", employee_code: "UA-DR-STF84" });
    const rows = [
      directoryRow(master, {
        status: "secondment",
        employment_type: "secondment",
        job_title: "Attendant",
        hire_date: "2026-09-17",
      }),
      directoryRow(stub, { status: "active", employment_type: "temporary" }),
    ];
    const hidden = hiddenUnmappedDuplicateIds([master, stub]);
    const visible = rows.filter((row) => !hidden.has(row.id));
    const found = filterStaffDirectory(visible, directoryFilters);

    expect(found.map((row) => row.employee_code)).toEqual(["543"]);
    expect(computeStaffDirectoryKpis(visible).total).toBe(1);
    expect(computeStaffDirectoryKpis(visible).temporary).toBe(0);
    expect(computeStaffDirectoryKpis(visible).secondment).toBe(1);
  });
});

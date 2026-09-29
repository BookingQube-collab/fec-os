import { describe, expect, it } from "vitest";

import type { StaffRow } from "@/lib/queries/module-queries.core";
import { computeStaffDirectoryKpis, filterStaffDirectory } from "@/lib/staff-directory-kpis";

import {
  fillEmptyStaffFields,
  hiddenUnmappedDuplicateIds,
  planStaffDuplicateMerges,
  type StaffIdentityRow,
} from "./staff-mapped-duplicates";

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
      person({
        id: "rajan-only",
        full_name: "Rajan",
        employee_code: "UA-DR-STF11",
        location_id: UA,
      }),
      person({
        id: "rajan-pathak",
        full_name: "Rajan Pathak",
        employee_code: "9",
        user_id: "user-9",
        location_id: UA,
      }),
      person({
        id: "sarah-khan-stub",
        full_name: "Sarah Khan",
        employee_code: "UA-DR-STF90",
        location_id: UA,
      }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("matches the complete name ignoring case and extra spaces", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({
        id: "master",
        full_name: "  SARAH   OXEL ",
        employee_code: "543",
        phone: "+97470054113",
      }),
      person({ id: "stub", full_name: "Sarah Oxel", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden).toEqual(new Set(["stub"]));
  });

  it("keeps Rajan Pathak even when a same-name stub and another real code exist", () => {
    const rajanId = "64cde3a2-90fd-47c1-83cc-fa49900b1143";
    const hidden = hiddenUnmappedDuplicateIds([
      person({
        id: rajanId,
        full_name: "Rajan Pathak",
        employee_code: "9",
        location_id: "loc-ho",
        user_id: "user-9",
        phone: null,
      }),
      person({
        id: "rajan-stub",
        full_name: "Rajan Pathak",
        employee_code: "HO-STF09",
        location_id: "loc-ho",
      }),
      person({
        id: "rajan-other-real",
        full_name: "Rajan Pathak",
        employee_code: "10",
        location_id: "loc-ho",
      }),
      person({
        id: "rajan-khadka",
        full_name: "Rajan Khadka",
        employee_code: "HO-STF02",
        location_id: "loc-ho",
      }),
      person({
        id: "first-name-only",
        full_name: "Rajan",
        employee_code: "HO-STF03",
        location_id: "loc-ho",
      }),
    ]);

    expect(hidden.has(rajanId)).toBe(false);
    expect(hidden.has("rajan-other-real")).toBe(false);
    expect(hidden.has("rajan-khadka")).toBe(false);
    expect(hidden.has("first-name-only")).toBe(false);
    expect(hidden).toEqual(new Set(["rajan-stub"]));
  });

  it("does not hide a generated stub that already has a login", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({
        id: "logged-in-stub",
        full_name: "Rajan Pathak",
        employee_code: "HO-STF09",
        location_id: "loc-ho",
        user_id: "user-9",
      }),
      person({
        id: "master",
        full_name: "Rajan Pathak",
        employee_code: "9",
        location_id: "loc-ho",
        phone: "+97400000000",
      }),
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

  it("does not hide a stub that only shares a phone at a different location", () => {
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
    expect(hidden.size).toBe(0);
  });

  it("keeps two real employee codes when neither is login- or attendance-mapped", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "a", employee_code: "543" }),
      person({ id: "b", employee_code: "544" }),
    ]);
    expect(hidden.size).toBe(0);
  });

  it("keeps both real employee codes and hides only the generated stub", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "mapped", employee_code: "543", user_id: "user-1" }),
      person({ id: "plain", employee_code: "544" }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden).toEqual(new Set(["stub"]));
  });

  it("does not hide a generated row just because another stub is attendance-mapped", () => {
    const hidden = hiddenUnmappedDuplicateIds([
      person({ id: "mapped", employee_code: "UA-DR-STF01", attendance_mapped: true }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(hidden.size).toBe(0);
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

describe("planStaffDuplicateMerges", () => {
  it("keeps the real employee code and removes the generated location stub", () => {
    expect(
      planStaffDuplicateMerges([
        person({ id: "master", employee_code: "543", phone: "+97470054113" }),
        person({ id: "stub", employee_code: "UA-DR-STF84" }),
      ]),
    ).toEqual([{ keepId: "master", removeId: "stub" }]);

    expect(
      planStaffDuplicateMerges([
        person({
          id: "oxel",
          employee_code: "S43",
          phone: "+97470654415",
          user_id: "user-s43",
          location_id: "loc-ua-dm",
        }),
        person({ id: "oxel-stub", employee_code: "UA-DM-STF04", location_id: "loc-ua-dm" }),
      ]),
    ).toEqual([{ keepId: "oxel", removeId: "oxel-stub" }]);
  });

  it("does not merge people who only share a first name or a different location", () => {
    expect(
      planStaffDuplicateMerges([
        person({ id: "a", full_name: "Sarah", employee_code: "543" }),
        person({ id: "b", full_name: "Sarah", employee_code: "UA-DR-STF84" }),
        person({ id: "c", employee_code: "543", location_id: UA }),
        person({ id: "d", employee_code: "UA-DM-STF01", location_id: "loc-ua-dm" }),
      ]),
    ).toEqual([]);
  });

  it("merges a stub that shares the full name and phone at another location", () => {
    const plans = planStaffDuplicateMerges([
      person({ id: "master", employee_code: "543", phone: "70054113", location_id: UA }),
      person({
        id: "stub",
        employee_code: "UA-DM-STF02",
        phone: "+97470054113",
        location_id: "loc-other",
      }),
    ]);
    expect(plans).toEqual([{ keepId: "master", removeId: "stub" }]);
  });

  it("keeps two real codes when neither has a login or attendance link", () => {
    expect(
      planStaffDuplicateMerges([
        person({ id: "a", employee_code: "543" }),
        person({ id: "b", employee_code: "544" }),
      ]),
    ).toEqual([]);
  });

  it("folds an unmapped real code and the stub into the login-mapped record", () => {
    const plans = planStaffDuplicateMerges([
      person({ id: "mapped", employee_code: "543", user_id: "user-1" }),
      person({ id: "plain", employee_code: "544" }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(plans).toEqual([
      { keepId: "mapped", removeId: "plain" },
      { keepId: "mapped", removeId: "stub" },
    ]);
  });

  it("keeps both real codes when each has a login, and still removes the stub", () => {
    const plans = planStaffDuplicateMerges([
      person({ id: "a", employee_code: "543", user_id: "user-1" }),
      person({ id: "b", employee_code: "544", user_id: "user-2" }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(plans).toEqual([{ keepId: "a", removeId: "stub" }]);
  });

  it("keeps the attendance-mapped stub when there is no real employee code", () => {
    const plans = planStaffDuplicateMerges([
      person({ id: "mapped", employee_code: "UA-DR-STF01", attendance_mapped: true }),
      person({ id: "stub", employee_code: "UA-DR-STF84" }),
    ]);
    expect(plans).toEqual([{ keepId: "mapped", removeId: "stub" }]);
  });

  it("copies only empty fields from the stub onto the kept row", () => {
    const merged = fillEmptyStaffFields(
      {
        employee_code: "543",
        full_name: "Sarah Oxel",
        status: "secondment",
        phone: "+97470054113",
        job_title: "Attendant",
        email: "  ",
        hire_date: "2026-09-17",
        user_id: "user-1",
        photo_data: null,
      },
      {
        employee_code: "UA-DR-STF84",
        full_name: "Sarah Oxel",
        status: "active",
        phone: "+97470000000",
        job_title: null,
        email: "sarah@example.com",
        hire_date: null,
        user_id: null,
        department: "Crew",
        photo_data: "bytes",
        photo_mime: "image/jpeg",
        photo_updated_at: "2026-09-17T00:00:00Z",
      },
    );

    expect(merged).toMatchObject({
      employee_code: "543",
      status: "secondment",
      phone: "+97470054113",
      job_title: "Attendant",
      email: "sarah@example.com",
      hire_date: "2026-09-17",
      user_id: "user-1",
      department: "Crew",
      photo_data: "bytes",
      photo_mime: "image/jpeg",
    });
  });
});

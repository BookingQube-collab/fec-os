import { describe, expect, it } from "vitest";

import { qatarTodayYmd } from "@/lib/hr-expiry-bands";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { shiftYmd } from "@/lib/staff-temporary-moves";
import {
  computeStaffDirectoryKpis,
  computeStaffDirectoryTileKpis,
  filterStaffDirectory,
  filterStaffDirectoryForKpis,
} from "./staff-directory-kpis";

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
    expect(filtered.map((s) => s.id).sort()).toEqual(["1", "3"]);
    expect(kpis.total).toBe(2);
    expect(kpis.active).toBe(1);
    expect(kpis.secondment).toBe(1);
  });

  it("does not count a joker as active, and the joker filter shows them", () => {
    const roster = computeStaffDirectoryKpis(staff);
    expect(roster.active).toBe(1);
    expect(filterStaffDirectory(staff, base).some((s) => s.employment_type === "joker")).toBe(false);
    const shown = filterStaffDirectory(staff, { ...base, showJokers: true });
    expect(shown.map((s) => s.id)).toEqual(["2"]);
    expect(computeStaffDirectoryKpis(shown).active).toBe(0);
  });

  it("updates when location / position / search change", () => {
    const byLoc = filterStaffDirectory(staff, { ...base, loc: "KDS" });
    expect(computeStaffDirectoryKpis(byLoc).total).toBe(2);

    const byPos = filterStaffDirectory(staff, { ...base, position: "Supervisor" });
    expect(computeStaffDirectoryKpis(byPos).secondment).toBe(1);

    const bySearch = filterStaffDirectory(staff, { ...base, q: "alice" });
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
      status: "",
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

  it("temporary_project KPI matches active temporary staff and not jokers", () => {
    const withTemp = [
      ...staff,
      row({
        id: "6",
        full_name: "Temp Active",
        employee_code: "E6",
        employment_type: "temporary",
        status: "active",
      }),
      row({
        id: "7",
        full_name: "Temp Gone",
        employee_code: "E7",
        employment_type: "temporary",
        status: "terminated",
      }),
    ];
    const kpis = computeStaffDirectoryKpis(withTemp);
    expect(kpis.temporary).toBe(1);
    const filtered = filterStaffDirectory(withTemp, {
      ...base,
      status: "",
      expiry: "temporary_project",
    });
    expect(filtered.map((s) => s.id).sort()).toEqual(["6"]);
  });

  it("scopes bucket tiles by location and search, and Total follows the table status", () => {
    const filters = { ...base, loc: "KDS", status: "active" };
    const table = filterStaffDirectory(staff, filters);
    const kpis = computeStaffDirectoryTileKpis(staff, filters);

    expect(table.map((s) => s.id).sort()).toEqual(["1", "3"]);
    expect(kpis.total).toBe(table.length);
    expect(kpis.total).toBe(2);
    expect(kpis.active).toBe(1);
    expect(kpis.secondment).toBe(1);
    expect(kpis.exiting).toBe(1);

    const searched = computeStaffDirectoryTileKpis(staff, { ...filters, q: "cara" });
    expect(searched.total).toBe(1);
    expect(searched.secondment).toBe(1);
    expect(searched.active).toBe(0);
  });

  it("keeps bucket tiles on the full roster when the only control is the default active status", () => {
    const tiles = computeStaffDirectoryTileKpis(staff, base);
    const roster = computeStaffDirectoryKpis(staff);
    expect(tiles.active).toBe(roster.active);
    expect(tiles.secondment).toBe(roster.secondment);
    expect(tiles.temporary).toBe(roster.temporary);
    expect(tiles.exiting).toBe(roster.exiting);
    expect(tiles.total).toBe(filterStaffDirectory(staff, base).length);
    expect(tiles.total).toBe(2);
  });

  it("leaves a person who fails the active status filter out of Total", () => {
    const carousel: StaffRow[] = [
      row({
        id: "flora",
        full_name: "Flora Mae",
        employee_code: "CAR-AP-STF06",
        status: "active",
        location_code: "CAR-AP",
        department: "Operations",
        department_names: ["Operations"],
      }),
      row({
        id: "zaryab",
        full_name: "Zaryab Javaid",
        employee_code: "CAR-AP-VS",
        status: "active",
        location_code: "CAR-AP",
        department: "Operations",
        department_names: ["Operations"],
      }),
      row({
        id: "beth",
        full_name: "Beth Wangechi",
        employee_code: "CAR-AP-STF01",
        status: "joker",
        employment_type: "joker",
        location_code: "CAR-AP",
        department: "Operations",
        department_names: ["Operations"],
      }),
    ];
    const filters = {
      ...base,
      loc: "CAR-AP",
      status: "active",
      showOrgDepartments: ["operations"] as const,
    };
    const table = filterStaffDirectory(carousel, filters);
    const kpis = computeStaffDirectoryTileKpis(carousel, filters);

    expect(table.map((s) => s.id).sort()).toEqual(["flora", "zaryab"]);
    expect(kpis.total).toBe(2);
    expect(kpis.active).toBe(2);
    expect(kpis.secondment).toBe(0);
    expect(kpis.temporary).toBe(0);
    expect(kpis.newJoiners).toBe(0);
    expect(kpis.exiting).toBe(0);

    const allStatuses = computeStaffDirectoryTileKpis(carousel, { ...filters, status: "" });
    expect(allStatuses.total).toBe(3);
    expect(allStatuses.active).toBe(2);
  });

  it("applies the show-only department filter to every tile, and Total follows status", () => {
    const withOps = [
      ...staff,
      row({
        id: "ops",
        full_name: "Ops Only",
        employee_code: "OPS1",
        employment_type: "permanent",
        status: "terminated",
        department_names: ["Operations"],
        location_code: "KDS",
      }),
      row({
        id: "maint",
        full_name: "Maint Only",
        employee_code: "M1",
        employment_type: "permanent",
        status: "active",
        department_names: ["Maintenance"],
        location_code: "KDS",
      }),
    ];
    const open = computeStaffDirectoryTileKpis(withOps, { ...base, loc: "KDS", status: "active" });
    expect(open.total).toBe(3);

    const filters = {
      ...base,
      loc: "KDS",
      status: "active",
      showOrgDepartments: ["operations"] as const,
    };
    const kpis = computeStaffDirectoryTileKpis(withOps, filters);
    expect(kpis.total).toBe(0);
    expect(kpis.exiting).toBe(1);

    const two = filterStaffDirectoryForKpis(withOps, {
      ...filters,
      showOrgDepartments: ["operations", "maintenance"],
    });
    expect(two.map((s) => s.id).sort()).toEqual(["maint", "ops"]);

    const explicit = filterStaffDirectoryForKpis(withOps, {
      ...filters,
      department: "maint-id",
      departmentName: "Maintenance",
      showOrgDepartments: ["operations"],
    });
    expect(explicit.map((s) => s.id)).toEqual(["maint"]);
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

  it("lists home and an active temporary site, not an extra dedicated site, a punch, or an ended move", () => {
    const today = qatarTodayYmd();
    const person = {
      ...row({
        id: "russell",
        full_name: "Russell Bombita Pante",
        employee_code: "FEC-TEC01",
        employment_type: "permanent",
        status: "active",
        is_roaming: true,
        location_id: "inf",
        location_code: "INF-CC",
        location_name: "Inflatapark",
        work_locations: [
          { id: "kds", code: "KDS-CC", name: "Kids Driving School" },
          { id: "cb", code: "CB-DSM", name: "Crayons & Bricks" },
        ],
        work_location_ids: ["kds", "cb"],
        temporary_site_moves: [
          {
            to_location_id: "ua",
            to_location_code: "UA-DM",
            to_location_name: "Urban Arena",
            starts_on: shiftYmd(today, -2),
            ends_on: shiftYmd(today, 5),
          },
        ],
      }),
      punch_location_codes: ["CB-VM"],
    };
    const ended = row({
      id: "ended",
      full_name: "Ended Move",
      employee_code: "E-END",
      employment_type: "permanent",
      status: "active",
      location_id: "inf",
      location_code: "INF-CC",
      location_name: "Inflatapark",
      temporary_site_moves: [
        {
          to_location_id: "ua",
          to_location_code: "UA-DM",
          to_location_name: "Urban Arena",
          starts_on: shiftYmd(today, -30),
          ends_on: shiftYmd(today, -1),
        },
      ],
    });

    expect(filterStaffDirectory([person, ended], { ...base, loc: "KDS-CC" })).toEqual([]);
    expect(filterStaffDirectory([person, ended], { ...base, loc: "CB-DSM" })).toEqual([]);
    expect(filterStaffDirectory([person], { ...base, loc: "CB-VM" })).toEqual([]);

    const atHome = filterStaffDirectory([person, ended], { ...base, loc: "INF-CC" });
    expect(atHome.map((s) => s.id).sort()).toEqual(["ended", "russell"]);

    const atTemp = filterStaffDirectory([person, ended], { ...base, loc: "UA-DM" });
    expect(atTemp.map((s) => s.id)).toEqual(["russell"]);

    const tempTiles = computeStaffDirectoryTileKpis([person, ended], {
      ...base,
      loc: "UA-DM",
      status: "active",
    });
    expect(tempTiles.total).toBe(1);

    const extraTiles = computeStaffDirectoryTileKpis([person, ended], {
      ...base,
      loc: "CB-DSM",
      status: "active",
    });
    expect(extraTiles.total).toBe(0);
  });
});

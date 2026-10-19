import { describe, expect, it } from "vitest";

import {
  isLikelyStaffDuplicatePair,
  nearDuplicateStaffNames,
  rankLikelyStaffDuplicates,
  shortEditDistance,
} from "./staff-duplicate-match";

describe("nearDuplicateStaffNames", () => {
  it("matches Agnes Kirorio with Agnes Muthoni Kurorio (surname typo + middle name)", () => {
    expect(nearDuplicateStaffNames("Agnes Kirorio", "Agnes Muthoni Kurorio")).toBe(true);
    expect(nearDuplicateStaffNames("AGNES KIRORIO", "Agnes Muthoni Kurorio")).toBe(true);
  });

  it("matches exact and payroll-style fuzzy names", () => {
    expect(nearDuplicateStaffNames("Sarah Oxel", "Sarah Oxel")).toBe(true);
    expect(nearDuplicateStaffNames("Muhammad Furkan", "Muhammad Furqan Choudhry")).toBe(false);
    expect(nearDuplicateStaffNames("Sarah Oxel", "Sarah Oxel Khan")).toBe(true);
  });

  it("does not collapse people who only share a first name", () => {
    expect(nearDuplicateStaffNames("Agnes Kirorio", "Agnes Wanjiku")).toBe(false);
    expect(nearDuplicateStaffNames("Agnes", "Agnes Muthoni Kurorio")).toBe(false);
  });
});

describe("shortEditDistance", () => {
  it("scores Kirorio vs Kurorio as one edit", () => {
    expect(shortEditDistance("kirorio", "kurorio")).toBe(1);
  });
});

describe("isLikelyStaffDuplicatePair", () => {
  const ua = "loc-ua-dm";

  it("links the UA-DM stub and S42 secondment row for Agnes", () => {
    expect(
      isLikelyStaffDuplicatePair(
        {
          id: "stub",
          full_name: "Agnes Kirorio",
          employee_code: "UA-DM-STF18",
          location_id: ua,
          phone: null,
        },
        {
          id: "real",
          full_name: "Agnes Muthoni Kurorio",
          employee_code: "S42",
          location_id: ua,
          phone: "+97460037636",
        },
      ),
    ).toBe(true);
  });

  it("does not link the same name at a different site without a shared phone", () => {
    expect(
      isLikelyStaffDuplicatePair(
        {
          id: "a",
          full_name: "Agnes Kirorio",
          employee_code: "UA-DM-STF18",
          location_id: ua,
        },
        {
          id: "b",
          full_name: "Agnes Muthoni Kurorio",
          employee_code: "S42",
          location_id: "loc-other",
        },
      ),
    ).toBe(false);
  });
});

describe("rankLikelyStaffDuplicates", () => {
  it("returns only near duplicates at the same site", () => {
    const anchor = {
      id: "stub",
      full_name: "Agnes Kirorio",
      employee_code: "UA-DM-STF18",
      location_id: "loc-ua-dm",
    };
    const ranked = rankLikelyStaffDuplicates(anchor, [
      {
        id: "real",
        full_name: "Agnes Muthoni Kurorio",
        employee_code: "S42",
        location_id: "loc-ua-dm",
        phone: "+97460037636",
      },
      {
        id: "other",
        full_name: "Agnes Wanjiku",
        employee_code: "S99",
        location_id: "loc-ua-dm",
      },
    ]);
    expect(ranked.map((row) => row.employee_code)).toEqual(["S42"]);
  });
});

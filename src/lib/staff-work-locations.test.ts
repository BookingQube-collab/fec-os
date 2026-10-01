import { describe, expect, it } from "vitest";

import { punchOrHomeStaffOrFilter, staffHomeWorkSiteIds, staffWorksAtLocation } from "./staff-work-locations";

describe("staffWorksAtLocation", () => {
  const russell = {
    location_id: "inf",
    is_roaming: true,
    work_location_ids: ["inf", "kds", "ua"],
  };

  it("matches home and attached work sites", () => {
    expect(staffWorksAtLocation(russell, "inf")).toBe(true);
    expect(staffWorksAtLocation(russell, "kds")).toBe(true);
    expect(staffWorksAtLocation(russell, "cb")).toBe(false);
  });

  it("lets roaming staff appear at every site for mapping", () => {
    expect(staffWorksAtLocation(russell, "cb", { roamingEverywhere: true })).toBe(true);
    expect(staffWorksAtLocation({ ...russell, is_roaming: false }, "cb", { roamingEverywhere: true })).toBe(false);
  });
});

describe("staffHomeWorkSiteIds", () => {
  it("keeps the current home and drops it from extra sites", () => {
    expect(
      staffHomeWorkSiteIds({
        previousHomeId: "ho",
        homeLocationId: "ho",
        locationIds: ["ho", "mall", "ho"],
      }),
    ).toEqual({ homeLocationId: "ho", locationIds: ["ho", "mall"] });
  });

  it("moves home and does not leave the new home in extra sites", () => {
    expect(
      staffHomeWorkSiteIds({
        previousHomeId: "ho",
        homeLocationId: "mall",
        locationIds: ["mall", "park", "mall"],
      }),
    ).toEqual({ homeLocationId: "mall", locationIds: ["mall", "park"] });
  });

  it("does not put the previous home back when it was not kept as an extra", () => {
    expect(
      staffHomeWorkSiteIds({
        previousHomeId: "ho",
        homeLocationId: "mall",
        locationIds: ["mall"],
      }).locationIds,
    ).toEqual(["mall"]);
  });

  it("keeps the previous home only when it is still listed as an extra", () => {
    expect(
      staffHomeWorkSiteIds({
        previousHomeId: "ho",
        homeLocationId: "mall",
        locationIds: ["mall", "ho"],
      }).locationIds,
    ).toEqual(["mall", "ho"]);
  });

  it("still forces the existing home when no new home is sent", () => {
    expect(
      staffHomeWorkSiteIds({
        previousHomeId: "ho",
        locationIds: ["park"],
      }),
    ).toEqual({ homeLocationId: "ho", locationIds: ["ho", "park"] });
  });
});

describe("punchOrHomeStaffOrFilter", () => {
  it("filters only the site when nobody is based there", () => {
    expect(punchOrHomeStaffOrFilter("inf", [])).toBe("location_id.eq.inf");
  });

  it("includes other-site punches for staff whose home is the filtered location", () => {
    expect(punchOrHomeStaffOrFilter("inf", ["aaa", "bbb"])).toBe(
      "location_id.eq.inf,staff_id.in.(aaa,bbb)",
    );
  });
});

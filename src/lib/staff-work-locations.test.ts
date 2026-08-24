import { describe, expect, it } from "vitest";

import { punchOrHomeStaffOrFilter, staffWorksAtLocation } from "./staff-work-locations";

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

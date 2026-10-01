import { describe, expect, it } from "vitest";

import { locationRosterCoverage, type LocationRosterSite } from "./roster-location-coverage";

const sites: LocationRosterSite[] = [
  { id: "inf", code: "INF-CC", name: "Inflatapark", region: "City Center Doha" },
  { id: "kds", code: "KDS-DM", name: "Kids Mini Driving School", region: "Doha Mall" },
  { id: "cb", code: "CB-VM", name: "Crayons & Bricks", region: "Vendome Mall" },
];

const label = (site: LocationRosterSite) => site.name ?? site.id;

describe("locationRosterCoverage", () => {
  it("marks a location uploaded when the period has rows, and counts staff once", () => {
    const items = locationRosterCoverage(
      sites,
      [
        { locationId: "inf", staffId: "s1" },
        { locationId: "inf", staffId: "s1" },
        { locationId: "inf", staffId: "s2" },
        { locationId: "kds", staffId: "s3" },
      ],
      label,
    );

    expect(items.map((item) => [item.id, item.uploaded, item.rowCount, item.staffCount])).toEqual([
      ["inf", true, 3, 2],
      ["kds", true, 1, 1],
      ["cb", false, 0, 0],
    ]);
  });

  it("keeps every site when no rows exist and ignores rows for unknown locations", () => {
    const items = locationRosterCoverage(sites, [{ locationId: "other", staffId: "s9" }], label);
    expect(items).toHaveLength(3);
    expect(items.every((item) => !item.uploaded)).toBe(true);
  });
});

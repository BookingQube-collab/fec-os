import { describe, expect, it } from "vitest";

import {
  locationRosterCoverage,
  locationsForRosterCards,
  rosterScopeAssignedLocationIds,
  type LocationRosterSite,
} from "./roster-location-coverage";

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

describe("roster location cards", () => {
  const catalog: LocationRosterSite[] = [
    { id: "car", code: "CAR-AP", name: "Carousel" },
    { id: "inf", code: "INF-CC", name: "Inflatapark" },
    { id: "kds", code: "KDS-CC", name: "Kids Driving School" },
    { id: "ua", code: "UA-DM", name: "Urban Arena" },
  ];

  it("keeps a company roster on every site", () => {
    expect(locationsForRosterCards(catalog, null).map((site) => site.code)).toEqual([
      "CAR-AP",
      "INF-CC",
      "KDS-CC",
      "UA-DM",
    ]);
  });

  it("uses home and extra sites, and drops a site that only has punches or shift rows", () => {
    const assigned = rosterScopeAssignedLocationIds({
      homeLocationIds: ["kds", "inf", "car", null],
      extraLocationIds: ["inf", "kds", ""],
    });
    expect(assigned).toEqual(["car", "inf", "kds"]);

    const cards = locationRosterCoverage(
      locationsForRosterCards(catalog, assigned),
      [
        { locationId: "inf", staffId: "marissa" },
        { locationId: "kds", staffId: "ashfaq" },
        { locationId: "ua", staffId: "old-punch" },
      ],
      (site) => site.code ?? site.id,
    );

    expect(cards.map((item) => [item.id, item.uploaded, item.rowCount])).toEqual([
      ["car", false, 0],
      ["inf", true, 1],
      ["kds", true, 1],
    ]);
  });

  it("keeps an assigned site with no uploaded rows", () => {
    const assigned = rosterScopeAssignedLocationIds({
      homeLocationIds: ["car", "kds"],
      extraLocationIds: ["ua"],
    });
    const cards = locationsForRosterCards(catalog, assigned);
    expect(cards.map((site) => site.code)).toEqual(["CAR-AP", "KDS-CC", "UA-DM"]);
    expect(locationRosterCoverage(cards, [], (site) => site.code ?? site.id).every((item) => !item.uploaded)).toBe(
      true,
    );
  });
});

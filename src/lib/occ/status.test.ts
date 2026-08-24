import { describe, expect, it } from "vitest";

import type { LocationRollup } from "@/lib/queries/occ.core";
import { matchesVenueQuery, rollupDrivers, sharedCity } from "@/lib/occ/status";

const base: LocationRollup = {
  location_id: "1",
  code: "CAR-AP",
  name: "Carousel",
  city: "Doha",
  status: "active",
  surge_mode: false,
  open_tickets: 3,
  urgent_tickets: 1,
  high_tickets: 1,
  open_incidents: 0,
  incidents_24h: 0,
  overdue_work_orders: 2,
  open_complaints: 3,
  rag: "red",
};

describe("occ status helpers", () => {
  it("lists the drivers that explain a red venue", () => {
    expect(rollupDrivers(base).map((d) => d.key)).toEqual(["urgent", "overdue", "high", "complaints"]);
  });

  it("hides city when every venue is in the same city", () => {
    expect(sharedCity([base, { ...base, location_id: "2", name: "Inflatapark" }])).toBe("Doha");
    expect(sharedCity([base, { ...base, city: "Lusail" }])).toBeNull();
  });

  it("matches venue search on name or code", () => {
    expect(matchesVenueQuery(base, "car")).toBe(true);
    expect(matchesVenueQuery(base, "KDS")).toBe(false);
  });
});

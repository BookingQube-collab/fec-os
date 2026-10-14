import { describe, expect, it } from "vitest";

import { uniqueById, uniqueByKey } from "./unique-by-id";

describe("uniqueById", () => {
  it("collapses two rows with the same id into the first", () => {
    const rows = uniqueById([
      { id: "bb814f81-04f8-4849-8fbf-28f0f6bf0447", ticket: "WO-1" },
      { id: "bb814f81-04f8-4849-8fbf-28f0f6bf0447", ticket: "WO-1-again" },
      { id: "other", ticket: "WO-2" },
    ]);
    expect(rows).toEqual([
      { id: "bb814f81-04f8-4849-8fbf-28f0f6bf0447", ticket: "WO-1" },
      { id: "other", ticket: "WO-2" },
    ]);
  });
});

describe("uniqueByKey", () => {
  it("collapses rows that share a location id", () => {
    const rows = uniqueByKey(
      [
        { location_id: "site-a", active_machines: 4 },
        { location_id: "site-a", active_machines: 9 },
        { location_id: "site-b", active_machines: 2 },
      ],
      (row) => row.location_id,
    );
    expect(rows.map((row) => row.active_machines)).toEqual([4, 2]);
  });
});

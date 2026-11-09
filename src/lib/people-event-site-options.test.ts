import { describe, expect, it } from "vitest";

import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";
import {
  eventSiteOptionsFromEvents,
  filterPeopleEventsByLocation,
} from "@/lib/people-event-site-options";

function ev(
  partial: Pick<PeopleEventOption, "id" | "name" | "locationId" | "locationName">,
): PeopleEventOption {
  return {
    eventNumber: null,
    dateFrom: null,
    dateTo: null,
    status: null,
    ...partial,
  };
}

describe("eventSiteOptionsFromEvents", () => {
  const events = [
    ev({
      id: "e1",
      name: "Lego Shows",
      locationId: "loc-vendome",
      locationName: "PLACE-VEDOME-MALL · Place Vendome Mall",
    }),
    ev({
      id: "e2",
      name: "Other",
      locationId: "loc-vendome",
      locationName: "PLACE-VEDOME-MALL · Place Vendome Mall",
    }),
    ev({
      id: "e3",
      name: "Arena",
      locationId: "loc-arena",
      locationName: "UA-DM · Urban Arena",
    }),
    ev({ id: "e4", name: "No site", locationId: null, locationName: null }),
  ];

  it("returns unique locations from events only", () => {
    expect(eventSiteOptionsFromEvents(events)).toEqual([
      { id: "loc-vendome", label: "PLACE-VEDOME-MALL · Place Vendome Mall" },
      { id: "loc-arena", label: "UA-DM · Urban Arena" },
    ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })));
  });

  it("scopes to the selected event location", () => {
    expect(eventSiteOptionsFromEvents(events, "e1")).toEqual([
      { id: "loc-vendome", label: "PLACE-VEDOME-MALL · Place Vendome Mall" },
    ]);
  });

  it("falls back to all event sites while selected event is missing", () => {
    const opts = eventSiteOptionsFromEvents(events, "missing-id");
    expect(opts).toHaveLength(2);
  });
});

describe("filterPeopleEventsByLocation", () => {
  const events = [
    ev({ id: "e1", name: "A", locationId: "loc-a", locationName: "A" }),
    ev({ id: "e2", name: "B", locationId: "loc-b", locationName: "B" }),
  ];

  it("returns all events when location is empty", () => {
    expect(filterPeopleEventsByLocation(events, "")).toHaveLength(2);
    expect(filterPeopleEventsByLocation(events, null)).toHaveLength(2);
  });

  it("filters by location id", () => {
    expect(filterPeopleEventsByLocation(events, "loc-a").map((e) => e.id)).toEqual(["e1"]);
  });
});

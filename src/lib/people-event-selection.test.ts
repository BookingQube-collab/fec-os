import { describe, expect, it } from "vitest";

import { parsePeopleEventId, peopleEventHref } from "@/lib/people-event-selection";

describe("parsePeopleEventId", () => {
  it("accepts uuids and rejects junk", () => {
    expect(parsePeopleEventId("11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(parsePeopleEventId("not-a-uuid")).toBe("");
    expect(parsePeopleEventId(null)).toBe("");
  });
});

describe("peopleEventHref", () => {
  it("omits query when no event", () => {
    expect(peopleEventHref("/people/events", "")).toBe("/people/events");
    expect(peopleEventHref("/people/events", null)).toBe("/people/events");
  });

  it("appends eventId and optional extras", () => {
    expect(peopleEventHref("/people/event-attendance", "11111111-1111-1111-1111-111111111111")).toBe(
      "/people/event-attendance?eventId=11111111-1111-1111-1111-111111111111",
    );
    expect(
      peopleEventHref("/people/event-attendance", "11111111-1111-1111-1111-111111111111", {
        from: "2026-11-23",
        to: "",
      }),
    ).toBe(
      "/people/event-attendance?eventId=11111111-1111-1111-1111-111111111111&from=2026-11-23",
    );
  });
});

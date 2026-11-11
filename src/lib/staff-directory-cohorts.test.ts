import { describe, expect, it } from "vitest";

import {
  HEAD_OFFICE_COHORT_KEY,
  activeShowOnlyStaffCohorts,
  buildStaffDirectoryCohortOptions,
  eventCohortKey,
  parseShowStaffCohortsParam,
  shortEventFilterLabel,
  staffMatchesShowCohorts,
} from "./staff-directory-cohorts";

describe("shortEventFilterLabel", () => {
  it("uses the short event title without number or path", () => {
    expect(
      shortEventFilterLabel({
        event_number: "EVT-2026-0009",
        event_name: "Lego Shows 2026",
        name: "Events / FEC / Lego Shows 2026",
      }),
    ).toBe("Lego Shows 2026");
    expect(
      shortEventFilterLabel({
        event_name: null,
        name: "People / Events / Inflatacity",
      }),
    ).toBe("Inflatacity");
    expect(
      shortEventFilterLabel({
        event_name: "INF-CC — Winter Mirage",
        name: null,
      }),
    ).toBe("Winter Mirage");
    expect(
      shortEventFilterLabel({
        event_name: "FEC Ops / Activation Weekend",
        name: null,
      }),
    ).toBe("Activation Weekend");
  });

  it("falls back to event number when titles are empty", () => {
    expect(shortEventFilterLabel({ event_number: "EVT-1", event_name: "", name: null })).toBe("EVT-1");
  });
});

describe("staff directory cohort show-only", () => {
  const options = buildStaffDirectoryCohortOptions([
    { id: "e1", event_name: "Lego Shows 2026" },
    { id: "e2", name: "Sites / Inflatacity" },
  ]);

  it("lists Head Office then short event names", () => {
    expect(options).toEqual([
      { key: HEAD_OFFICE_COHORT_KEY, label: "Head Office" },
      { key: eventCohortKey("e1"), label: "Lego Shows 2026" },
      { key: eventCohortKey("e2"), label: "Inflatacity" },
    ]);
  });

  it("keeps everyone while all options stay checked", () => {
    expect(activeShowOnlyStaffCohorts({}, options)).toEqual([]);
    expect(activeShowOnlyStaffCohorts({ [HEAD_OFFICE_COHORT_KEY]: true }, options)).toEqual([]);
  });

  it("show-only uses unchecked cohorts", () => {
    expect(
      activeShowOnlyStaffCohorts(
        { [HEAD_OFFICE_COHORT_KEY]: false, [eventCohortKey("e1")]: true },
        options,
      ),
    ).toEqual([HEAD_OFFICE_COHORT_KEY]);
  });

  it("matches Head Office and event-linked staff", () => {
    const events = new Map<string, readonly string[]>([
      ["s-ho", []],
      ["s-lego", ["e1"]],
      ["s-venue", []],
    ]);
    expect(
      staffMatchesShowCohorts({ id: "s-ho", location_code: "HO" }, [HEAD_OFFICE_COHORT_KEY], events),
    ).toBe(true);
    expect(
      staffMatchesShowCohorts({ id: "s-lego", location_code: "INF-CC" }, [eventCohortKey("e1")], events),
    ).toBe(true);
    expect(
      staffMatchesShowCohorts({ id: "s-venue", location_code: "INF-CC" }, [HEAD_OFFICE_COHORT_KEY], events),
    ).toBe(false);
    expect(staffMatchesShowCohorts({ id: "s-venue", location_code: "INF-CC" }, [], events)).toBe(true);
  });

  it("parses showCohorts query values", () => {
    expect(parseShowStaffCohortsParam("head_office,event:e1,event:e1,nope")).toEqual([
      HEAD_OFFICE_COHORT_KEY,
      eventCohortKey("e1"),
    ]);
  });
});

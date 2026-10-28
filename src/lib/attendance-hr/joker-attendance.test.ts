import { describe, expect, it } from "vitest";

import {
  resolvePunchlessJokerListingStatus,
  shouldSuppressPunchlessJokerAbsent,
} from "./joker-attendance";

describe("shouldSuppressPunchlessJokerAbsent", () => {
  it("suppresses Absent for employment-type and status jokers with no punches and no roster", () => {
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        status: "active",
        hasPunches: false,
      }),
    ).toBe(true);
    expect(
      shouldSuppressPunchlessJokerAbsent({
        status: "joker",
        employment_type: "joker",
        hasPunches: false,
      }),
    ).toBe(true);
  });

  it("does not suppress rostered punchless jokers (Absent is correct)", () => {
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        status: "active",
        hasPunches: false,
        hasRosterAssignment: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressPunchlessJokerAbsent({
        status: "joker",
        employment_type: "joker",
        hasPunches: false,
        hasRosterAssignment: true,
      }),
    ).toBe(false);
  });

  it("does not suppress when punches exist, or on leave / week-off / holiday", () => {
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        hasPunches: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        hasPunches: false,
        weekOff: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        hasPunches: false,
        leaveType: "annual_leave",
      }),
    ).toBe(false);
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "joker",
        hasPunches: false,
        holidayName: "National Day",
      }),
    ).toBe(false);
  });

  it("does not suppress permanent staff", () => {
    expect(
      shouldSuppressPunchlessJokerAbsent({
        employmentType: "permanent",
        status: "active",
        hasPunches: false,
      }),
    ).toBe(false);
  });
});

describe("resolvePunchlessJokerListingStatus", () => {
  it("maps punchless Absent to unscheduled for jokers without a roster", () => {
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        employment_type: "joker",
        hasIn: false,
        hasOut: false,
      }),
    ).toBe("unscheduled");
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        staffStatus: "joker",
        employment_type: "permanent",
        hasIn: false,
        hasOut: false,
      }),
    ).toBe("unscheduled");
  });

  it("keeps Absent for rostered punchless jokers", () => {
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        employment_type: "joker",
        hasIn: false,
        hasOut: false,
        hasRosterAssignment: true,
      }),
    ).toBe("absent");
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        staffStatus: "joker",
        employment_type: "joker",
        hasIn: false,
        hasOut: false,
        hasRosterAssignment: true,
      }),
    ).toBe("absent");
  });

  it("keeps Absent for permanent staff and keeps punched joker status", () => {
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        employment_type: "permanent",
        hasIn: false,
        hasOut: false,
      }),
    ).toBe("absent");
    expect(
      resolvePunchlessJokerListingStatus({
        status: "absent",
        employment_type: "joker",
        hasIn: true,
        hasOut: false,
      }),
    ).toBe("absent");
  });
});

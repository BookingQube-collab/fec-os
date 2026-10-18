import { describe, expect, it } from "vitest";

import {
  FNB_MANAGER_VENUE_CODES,
  managedVenueCodesForPerson,
  SUPERVISOR_MANAGED_VENUES,
  unionViewerManagedLocationIds,
} from "./supervisor-managed-venues";

describe("supervisor managed venues (product matrix)", () => {
  it("maps Ashfaq to INF-CC, KDS-CC, CAR-AP", () => {
    expect(managedVenueCodesForPerson({ employeeCode: "KDS-CC-VS" })).toEqual([
      "INF-CC",
      "KDS-CC",
      "CAR-AP",
    ]);
    expect(managedVenueCodesForPerson({ fullName: "Ashfaq Noori" })).toEqual([
      "INF-CC",
      "KDS-CC",
      "CAR-AP",
    ]);
  });

  it("maps Romel to CB-DSM only", () => {
    expect(managedVenueCodesForPerson({ employeeCode: "CB-DSM-VS" })).toEqual(["CB-DSM"]);
    expect(managedVenueCodesForPerson({ fullName: "Romel Chavez Pusung" })).toEqual(["CB-DSM"]);
  });

  it("maps Rosebelt to CB-VM only", () => {
    expect(managedVenueCodesForPerson({ employeeCode: "CB-VM-BM2" })).toEqual(["CB-VM"]);
    expect(managedVenueCodesForPerson({ fullName: "Rosebelt Fatal" })).toEqual(["CB-VM"]);
  });

  it("maps Waqar to KDS-DM, UA-DM, and INF-CC", () => {
    expect(managedVenueCodesForPerson({ employeeCode: "UA-DM-VS" })).toEqual([
      "KDS-DM",
      "UA-DM",
      "INF-CC",
    ]);
    expect(managedVenueCodesForPerson({ fullName: "Waqar Asghar" })).toEqual([
      "KDS-DM",
      "UA-DM",
      "INF-CC",
    ]);
  });

  it("maps F&B Manager (Ruben) to INF-CC, KDS-CC, UA-DM", () => {
    expect(FNB_MANAGER_VENUE_CODES).toEqual(["INF-CC", "KDS-CC", "UA-DM"]);
    expect(managedVenueCodesForPerson({ employeeCode: "FB-1" })).toEqual([
      "INF-CC",
      "KDS-CC",
      "UA-DM",
    ]);
    expect(managedVenueCodesForPerson({ fullName: "Ruben Yaralyan" })).toEqual([
      "INF-CC",
      "KDS-CC",
      "UA-DM",
    ]);
  });

  it("returns null for unknown staff (no invented estate)", () => {
    expect(managedVenueCodesForPerson({ employeeCode: "INF-CC-STF01", fullName: "Crew Member" })).toBeNull();
  });

  it("lists every matrix supervisor with at least one venue code", () => {
    expect(SUPERVISOR_MANAGED_VENUES.length).toBe(4);
    for (const person of SUPERVISOR_MANAGED_VENUES) {
      expect(person.locationCodes.length).toBeGreaterThan(0);
    }
  });

  it("unions home, work sites, and mapped estate without inventing blanks", () => {
    expect(
      unionViewerManagedLocationIds({
        homeLocationId: "ua",
        workLocationIds: ["kdsMini", null],
        mappedLocationIds: ["inf", "ua"],
      }),
    ).toEqual(["inf", "kdsMini", "ua"]);
  });
});

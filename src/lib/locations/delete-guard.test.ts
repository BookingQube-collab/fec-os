import { describe, expect, it } from "vitest";

import {
  LOCATION_DELETE_LINK_PROBES,
  emptyLocationDeleteLinkCounts,
  foldLocationDeleteCounts,
  locationDeleteBlockedMessage,
  locationDeleteBlockers,
  parseLocationDeleteFailure,
} from "./delete-guard";

describe("location delete guard", () => {
  it("allows a delete only when every linked count is zero", () => {
    expect(locationDeleteBlockers(emptyLocationDeleteLinkCounts())).toEqual([]);
  });

  it("refuses a delete when staff, punches, shifts, departments, or other links exist", () => {
    const counts = foldLocationDeleteCounts([
      { kind: "staff", count: 2 },
      { kind: "staffSites", count: 0 },
      { kind: "punches", count: 4 },
      { kind: "shifts", count: 1 },
      { kind: "departments", count: 3 },
      { kind: "other", count: 1 },
    ]);

    expect(locationDeleteBlockers(counts)).toEqual([
      "staff",
      "punches",
      "shifts",
      "departments",
      "other",
    ]);
    expect(locationDeleteBlockedMessage(locationDeleteBlockers(counts))).toContain(
      "were not removed",
    );
  });

  it("ignores zero counts and keeps blocker order stable", () => {
    const counts = foldLocationDeleteCounts([
      { kind: "other", count: 1 },
      { kind: "staffSites", count: 1 },
      { kind: "punches", count: 0 },
    ]);
    expect(locationDeleteBlockers(counts)).toEqual(["staffSites", "other"]);
  });

  it("names staff sites, punches, shifts, and departments in the probe list", () => {
    const probe = (table: string) => LOCATION_DELETE_LINK_PROBES.find((row) => row.table === table);
    expect(probe("staff")?.kind).toBe("staff");
    expect(probe("staff_work_locations")?.kind).toBe("staffSites");
    expect(probe("attendance_logs")?.kind).toBe("punches");
    expect(probe("shifts")?.kind).toBe("shifts");
    expect(probe("attendance_roster_assignments")?.kind).toBe("shifts");
    expect(probe("location_areas")?.kind).toBe("departments");
  });

  it("does not treat optional location links as delete blockers", () => {
    const tables = LOCATION_DELETE_LINK_PROBES.map((row) => `${row.table}.${row.column}`);
    expect(tables).not.toContain("notifications.location_id");
    expect(tables).not.toContain("staff_transfers.from_location_id");
    expect(tables).toContain("staff_transfers.to_location_id");
  });

  it("parses a blocked delete into the linked kinds", () => {
    const message =
      "LOCATION_DELETE_BLOCKED:staff,punches: Cannot delete this location while it still has staff, punches. Staff, site assignments, punches, shifts, departments, and other linked records were not removed.";
    expect(parseLocationDeleteFailure(message)).toEqual({
      code: "blocked",
      kinds: ["staff", "punches"],
    });
    expect(parseLocationDeleteFailure("LOCATION_DELETE_FK:still referenced")).toEqual({
      code: "foreignKey",
    });
    expect(parseLocationDeleteFailure("LOCATION_DELETE_VERIFY_FAILED:could not check")).toEqual({
      code: "verify",
    });
    expect(parseLocationDeleteFailure("Location not found")).toBeNull();
  });
});

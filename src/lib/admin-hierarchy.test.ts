import { describe, expect, it } from "vitest";

import { classifyOperationsHierarchy, OPERATIONS_HEAD_STAFF_ID, type HierarchyStaffRow } from "./admin-hierarchy";

function row(partial: Partial<HierarchyStaffRow> & Pick<HierarchyStaffRow, "id" | "fullName">): HierarchyStaffRow {
  return {
    employeeCode: null,
    jobTitle: null,
    staffRole: null,
    userId: null,
    locationName: null,
    ...partial,
  };
}

describe("operations hierarchy", () => {
  it("puts Rajan Pathak above site supervisors and ignores Rajan Khadka", () => {
    const tree = classifyOperationsHierarchy([
      row({
        id: OPERATIONS_HEAD_STAFF_ID,
        fullName: "Rajan Pathak",
        employeeCode: "9",
        jobTitle: "Head of Operations / FEC-IT",
        staffRole: "other",
      }),
      row({
        id: "khadka",
        fullName: "Rajan Khadka",
        jobTitle: "Crew / Attendant",
        staffRole: "crew",
      }),
      row({
        id: "ashgar",
        fullName: "Ashgar Ali Bhatti NaimatAli",
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      }),
      row({
        id: "mary",
        fullName: "Mary Wangare Muiruri",
        jobTitle: "Sr. Site Supervisor",
        staffRole: "venue_supervisor",
      }),
      row({
        id: "tech",
        fullName: "Technician Supervisor",
        jobTitle: "Technician & Maintenance Supervisor",
        staffRole: "technician",
      }),
    ]);

    expect(tree.head?.fullName).toBe("Rajan Pathak");
    expect(tree.supervisors.map((person) => person.fullName)).toEqual([
      "Ashgar Ali Bhatti NaimatAli",
      "Mary Wangare Muiruri",
    ]);
  });
});

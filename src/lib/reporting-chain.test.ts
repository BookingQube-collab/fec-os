import { describe, expect, it } from "vitest";

import {
  CEO_STAFF_ID,
  GM_STAFF_ID,
  isOperationsFunction,
  locationDepartmentHeads,
  loginReportingTeam,
  operationalTeamIds,
  projectReportingChain,
  reportingTeamIds,
  type ChainStaff,
} from "./reporting-chain";

const HO = "11111111-1111-4111-8111-111111111111";
const INF = "22222222-2222-4222-8222-222222222222";
const UA = "33333333-3333-4333-8333-333333333333";

function row(partial: Partial<ChainStaff> & Pick<ChainStaff, "staffId" | "fullName">): ChainStaff {
  return {
    employeeCode: null,
    jobTitle: null,
    department: null,
    locationId: HO,
    staffRole: "other",
    status: "active",
    userId: null,
    reportingManagerStaffId: null,
    orgChartPlaced: false,
    ...partial,
  };
}

describe("reporting chain", () => {
  const people = [
    row({
      staffId: CEO_STAFF_ID,
      fullName: "Adil Bashir Ahmed",
      jobTitle: "Managing Director / Chief Executive Officer",
      department: "Management",
    }),
    row({
      staffId: GM_STAFF_ID,
      fullName: "Mohamad Ali Hassan Awada",
      jobTitle: "General Manager",
      department: "Management",
    }),
    row({
      staffId: "rajan",
      fullName: "Rajan Pathak",
      jobTitle: "Head of Operations",
      department: "Operations, IT, Management",
      userId: "user-rajan",
    }),
    row({
      staffId: "mary",
      fullName: "Mary Wangare Muiruri",
      jobTitle: "Sr. Site Supervisor",
      department: "Operations",
      locationId: INF,
      staffRole: "venue_supervisor",
      reportingManagerStaffId: "rajan",
      userId: "user-mary",
    }),
    row({
      staffId: "waqar",
      fullName: "Waqar Asghar",
      jobTitle: "Venue Supervisor",
      department: "Operations",
      locationId: UA,
      staffRole: "venue_supervisor",
      reportingManagerStaffId: "mary",
    }),
    row({
      staffId: "crew",
      fullName: "Ali Husnain",
      jobTitle: "Crew / Attendant",
      department: "Operations",
      locationId: UA,
      staffRole: "crew",
      reportingManagerStaffId: "waqar",
      userId: "user-crew",
    }),
    row({
      staffId: "cashier",
      fullName: "Jorene Tesoro Quixote",
      jobTitle: "Cashier / Attendant",
      department: "Operations",
      locationId: INF,
      staffRole: "cashier",
      reportingManagerStaffId: "mary",
    }),
    row({
      staffId: "chef",
      fullName: "Ruben Yaralyan",
      jobTitle: "F&B Manager",
      department: "F&B",
      orgChartPlaced: true,
    }),
  ];

  it("puts the CEO above the GM and one department head per location", () => {
    const projected = projectReportingChain(people, null);
    const byId = new Map(projected.rows.map((person) => [person.staffId, person]));

    expect(byId.get(CEO_STAFF_ID)?.reportingManagerStaffId).toBeNull();
    expect(byId.get(GM_STAFF_ID)?.reportingManagerStaffId).toBe(CEO_STAFF_ID);
    expect(projected.departmentHeads.map((head) => head.fullName)).toEqual([
      "Mary Wangare Muiruri",
      "Rajan Pathak",
      "Waqar Asghar",
    ]);
    expect(byId.get("mary")?.reportingManagerStaffId).toBe(GM_STAFF_ID);
    expect(byId.get("waqar")?.reportingManagerStaffId).toBe(GM_STAFF_ID);
    expect(byId.get("rajan")?.reportingManagerStaffId).toBe(GM_STAFF_ID);
    expect(byId.get("crew")?.reportingManagerStaffId).toBe("waqar");
    expect(byId.get("chef")?.reportingManagerStaffId).toBeNull();
  });

  it("places an operations user under their location department head without moving people already in that line", () => {
    const projected = projectReportingChain(people, {
      userId: "user-crew",
      employeeCode: null,
      displayName: "Ali Husnain",
    });
    const crew = projected.rows.find((person) => person.staffId === "crew");
    expect(crew?.reportingManagerStaffId).toBe("waqar");
    expect(crew?.fullName).toBe("Ali Husnain");
    expect(projected.viewerOperationsName).toBe("Ali Husnain");
    expect(operationalTeamIds(UA, projected.rows)).toEqual(new Set(["waqar", "crew"]));
  });

  it("moves an operations user who sits outside the location head under that head", () => {
    const stray = row({
      staffId: "stray",
      fullName: "Russell Bombita Pante",
      jobTitle: "FEC Technician",
      department: "Operations",
      locationId: INF,
      reportingManagerStaffId: "rajan",
      userId: "user-stray",
    });
    const projected = projectReportingChain([...people, stray], {
      userId: "user-stray",
      employeeCode: null,
      displayName: "Russell",
    });
    const person = projected.rows.find((row) => row.staffId === "stray");
    expect(person?.reportingManagerStaffId).toBe("mary");
    expect(person?.fullName).toBe("Russell");
    expect(reportingTeamIds("mary", projected.rows).has("stray")).toBe(true);
  });

  it("gives a login the same manager and reports as the operations hierarchy", () => {
    const team = loginReportingTeam("mary", people);
    expect(team.managerStaffId).toBe("rajan");
    expect(team.directReportStaffIds).toEqual(["cashier", "waqar"]);
    expect(team.reportStaffIds).toEqual(["cashier", "crew", "waqar"]);
    expect(loginReportingTeam("cashier", people)).toEqual({
      managerStaffId: "mary",
      directReportStaffIds: [],
      reportStaffIds: [],
    });
  });

  it("lists my reporting team as everyone below the signed-in person", () => {
    const projected = projectReportingChain(people, {
      userId: "user-mary",
      employeeCode: null,
      displayName: "Mary Wangare Muiruri",
    });
    expect([...reportingTeamIds("mary", projected.rows)].sort()).toEqual(["cashier"]);
    expect([...reportingTeamIds(GM_STAFF_ID, projected.rows)].sort()).toEqual(
      ["mary", "rajan", "waqar", "crew", "cashier"].sort(),
    );
  });

  it("lets an unmatched CEO login follow Adil's reporting line", () => {
    const projected = projectReportingChain(people, {
      userId: "user-admin",
      employeeCode: null,
      displayName: "Admin",
      seat: "ceo",
    });
    expect(projected.viewerStaffId).toBe(CEO_STAFF_ID);
    expect(projected.viewerOperationsName).toBeNull();
    expect(reportingTeamIds(projected.viewerStaffId, projected.rows).has(GM_STAFF_ID)).toBe(true);
    expect(projected.rows.find((person) => person.staffId === CEO_STAFF_ID)?.fullName).toBe("Adil Bashir Ahmed");
  });

  it("recognizes an Operations department", () => {
    expect(isOperationsFunction("Operations, IT, Management", null)).toBe(true);
    expect(isOperationsFunction("F&B", "F&B Manager")).toBe(false);
    expect(locationDepartmentHeads(people).map((head) => head.staffId).sort()).toEqual(["mary", "rajan", "waqar"]);
  });
});

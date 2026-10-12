import { describe, expect, it } from "vitest";

import {
  isManagerTeamSupervisor,
  managerSupervisorTeamIds,
  viewerRollsUpSupervisorTeam,
  type ManagerTeamPerson,
} from "./manager-supervisor-team";

function person(
  partial: Partial<ManagerTeamPerson> & Pick<ManagerTeamPerson, "staffId">,
): ManagerTeamPerson {
  return {
    jobTitle: null,
    staffRole: null,
    reportingManagerStaffId: null,
    ...partial,
  };
}

const people: ManagerTeamPerson[] = [
  person({ staffId: "manager", jobTitle: "Branch Manager", staffRole: "other" }),
  person({
    staffId: "sr",
    jobTitle: "Sr. Site Supervisor",
    staffRole: "venue_supervisor",
    reportingManagerStaffId: "manager",
  }),
  person({
    staffId: "site",
    jobTitle: "Site Supervisor",
    staffRole: "venue_supervisor",
    reportingManagerStaffId: "sr",
  }),
  person({
    staffId: "crew",
    jobTitle: "Cashier / Attendant",
    staffRole: "cashier",
    reportingManagerStaffId: "site",
  }),
  person({
    staffId: "floor",
    jobTitle: "Supervisor",
    staffRole: "other",
    reportingManagerStaffId: "manager",
  }),
  person({
    staffId: "floor-crew",
    jobTitle: "Host",
    staffRole: "cashier",
    reportingManagerStaffId: "floor",
  }),
  person({
    staffId: "cashier",
    jobTitle: "Cashier",
    staffRole: "cashier",
    reportingManagerStaffId: "manager",
  }),
  person({
    staffId: "cashier-helper",
    jobTitle: "Attendant",
    staffRole: "crew",
    reportingManagerStaffId: "cashier",
  }),
  person({ staffId: "other-manager", jobTitle: "Branch Manager", staffRole: "other" }),
  person({
    staffId: "other-supervisor",
    jobTitle: "Site Supervisor",
    staffRole: "venue_supervisor",
    reportingManagerStaffId: "other-manager",
  }),
  person({
    staffId: "other-crew",
    jobTitle: "Cashier",
    staffRole: "cashier",
    reportingManagerStaffId: "other-supervisor",
  }),
  person({ staffId: "fb-manager", jobTitle: "F&B Manager", staffRole: "other" }),
  person({
    staffId: "fb-supervisor",
    jobTitle: "Barista/Supervisor",
    staffRole: "other",
    reportingManagerStaffId: "fb-manager",
  }),
  person({
    staffId: "fb-team",
    jobTitle: "Barista",
    staffRole: "other",
    reportingManagerStaffId: "fb-supervisor",
  }),
  person({
    staffId: "fb-direct",
    jobTitle: "Chef",
    staffRole: "other",
    reportingManagerStaffId: "fb-manager",
  }),
  person({
    staffId: "fb-cashier",
    jobTitle: "Cashier",
    staffRole: "cashier",
    reportingManagerStaffId: "fb-supervisor",
  }),
  person({
    staffId: "fb-cashier-helper",
    jobTitle: "Attendant",
    staffRole: "crew",
    reportingManagerStaffId: "fb-cashier",
  }),
];

const nameById: Record<string, string> = {
  sr: "Sara Supervisor",
  site: "Site Lead",
  floor: "Pat Supervisor",
  cashier: "Loose Ops",
  crew: "Team Crew",
  "floor-crew": "Plain Team",
  "other-crew": "Other Team",
  "other-supervisor": "Other Supervisor",
  "fb-supervisor": "Amon Supervisor",
  "fb-team": "Agnes Team",
  "fb-direct": "Albert Direct",
  "fb-cashier": "Cafe Cashier",
  "fb-cashier-helper": "Cashier Helper",
};

function rosterNames(ids: readonly string[]) {
  return ids.map((id) => nameById[id] ?? id);
}

describe("manager supervisor team", () => {
  it("includes a supervisor and that supervisor's team, and not an unrelated branch", () => {
    const scope = managerSupervisorTeamIds({
      viewerStaffId: "manager",
      viewerJobTitle: "Branch Manager",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toEqual(["cashier", "crew", "floor", "floor-crew", "site", "sr"]);
    expect(rosterNames(scope)).toEqual(
      expect.arrayContaining(["Sara Supervisor", "Pat Supervisor", "Loose Ops", "Team Crew"]),
    );
    expect(rosterNames(scope)).not.toContain("Other Team");
    expect(rosterNames(scope)).not.toContain("Other Supervisor");
    expect(scope).not.toContain("cashier-helper");
    expect(scope).not.toContain("manager");
  });

  it("keeps the supervisor's own team", () => {
    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "site",
        viewerJobTitle: "Site Supervisor",
        viewerStaffRole: "venue_supervisor",
        people,
      }),
    ).toEqual(["crew", "site"]);
    const siteNames = rosterNames(
      managerSupervisorTeamIds({
        viewerStaffId: "site",
        viewerJobTitle: "Site Supervisor",
        viewerStaffRole: "venue_supervisor",
        people,
      }),
    );
    expect(siteNames).toEqual(expect.arrayContaining(["Site Lead", "Team Crew"]));
    expect(siteNames).not.toContain("Loose Ops");
    expect(siteNames).not.toContain("Other Team");
    expect(siteNames).not.toContain("Plain Team");
    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "sr",
        viewerJobTitle: "Sr. Site Supervisor",
        viewerStaffRole: "venue_supervisor",
        people,
      }),
    ).toEqual(["crew", "site", "sr"]);
  });

  it("gives an F&B manager the supervisor, that supervisor's team, and a direct report", () => {
    const scope = managerSupervisorTeamIds({
      viewerStaffId: "fb-manager",
      viewerJobTitle: "F&B Manager",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toEqual(["fb-cashier", "fb-direct", "fb-supervisor", "fb-team"]);
    expect(rosterNames(scope)).toEqual(
      expect.arrayContaining(["Amon Supervisor", "Agnes Team", "Albert Direct"]),
    );
    expect(scope).not.toContain("fb-manager");
    expect(scope).not.toContain("fb-cashier-helper");
    expect(scope).not.toContain("cashier");
    expect(scope).not.toContain("other-crew");
    expect(viewerRollsUpSupervisorTeam("F&B Manager", "other")).toBe(true);
  });

  it("includes a supervisor's own name and team, and not the manager's other staff", () => {
    const scope = managerSupervisorTeamIds({
      viewerStaffId: "fb-supervisor",
      viewerJobTitle: "F&B Supervisor",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toEqual(["fb-cashier", "fb-supervisor", "fb-team"]);
    expect(rosterNames(scope)).toEqual(expect.arrayContaining(["Amon Supervisor", "Agnes Team"]));
    expect(rosterNames(scope)).not.toContain("Albert Direct");
    expect(scope).not.toContain("fb-direct");
    expect(scope).not.toContain("fb-cashier-helper");
    expect(scope).not.toContain("cashier");
    expect(scope).not.toContain("fb-manager");
  });

  it("does not give a cashier the supervisor rollup", () => {
    expect(viewerRollsUpSupervisorTeam("Cashier", "cashier")).toBe(false);
    expect(viewerRollsUpSupervisorTeam("Cashier / Attendant", "cashier")).toBe(false);
    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "cashier",
        viewerJobTitle: "Cashier",
        viewerStaffRole: "cashier",
        people,
      }),
    ).toEqual(["cashier-helper"]);
    expect(isManagerTeamSupervisor("F&B Supervisor", "other")).toBe(true);
    expect(isManagerTeamSupervisor("Barista/Supervisor", "other")).toBe(true);
    expect(isManagerTeamSupervisor("Café Supervisor", "other")).toBe(true);
    expect(isManagerTeamSupervisor("Production Supervisor", "other")).toBe(true);
    expect(isManagerTeamSupervisor("F&B Manager", "other")).toBe(false);
    expect(isManagerTeamSupervisor("Cashier", "cashier")).toBe(false);
    expect(isManagerTeamSupervisor("Barista", "other")).toBe(false);
    expect(isManagerTeamSupervisor("Supervisor", "other")).toBe(true);
    expect(isManagerTeamSupervisor("Sr. Site Supervisor", null)).toBe(true);
    expect(isManagerTeamSupervisor("Senior Site Supervisor", null)).toBe(true);
    expect(isManagerTeamSupervisor("Site Supervisor", null)).toBe(true);
    expect(isManagerTeamSupervisor("Venue Supervisor", null)).toBe(true);
  });
});

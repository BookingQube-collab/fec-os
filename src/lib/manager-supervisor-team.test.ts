import { describe, expect, it } from "vitest";

import {
  isManagerTeamSupervisor,
  managerSupervisorTeamIds,
  teamOverviewMemberIds,
  viewerRollsUpSupervisorTeam,
  type TeamOverviewPerson,
} from "./manager-supervisor-team";

function person(
  partial: Partial<TeamOverviewPerson> & Pick<TeamOverviewPerson, "staffId">,
): TeamOverviewPerson {
  return {
    jobTitle: null,
    staffRole: null,
    reportingManagerStaffId: null,
    status: "active",
    ...partial,
  };
}

/** Shared Shift Lead → crew line used for Venue, Sr. Site, and F&B Manager cases. */
function shiftLeadLine(rootId: string) {
  return [
    person({
      staffId: "shift-lead",
      jobTitle: "Shift Lead",
      staffRole: "other",
      reportingManagerStaffId: rootId,
    }),
    person({
      staffId: "attendant",
      jobTitle: "Attendant",
      staffRole: "crew",
      reportingManagerStaffId: "shift-lead",
    }),
    person({
      staffId: "crew-two",
      jobTitle: "Crew / Attendant",
      staffRole: "crew",
      reportingManagerStaffId: "shift-lead",
    }),
    person({
      staffId: "other-branch",
      jobTitle: "Attendant",
      staffRole: "crew",
      reportingManagerStaffId: "other-supervisor",
    }),
  ];
}

const people: TeamOverviewPerson[] = [
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
  it("gives a Branch Manager the full subtree on their line, not an unrelated branch", () => {
    const scope = managerSupervisorTeamIds({
      viewerStaffId: "manager",
      viewerJobTitle: "Branch Manager",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toEqual([
      "cashier",
      "cashier-helper",
      "crew",
      "floor",
      "floor-crew",
      "manager",
      "site",
      "sr",
    ]);
    expect(rosterNames(scope)).toEqual(
      expect.arrayContaining(["Sara Supervisor", "Pat Supervisor", "Loose Ops", "Team Crew"]),
    );
    expect(rosterNames(scope)).not.toContain("Other Team");
    expect(rosterNames(scope)).not.toContain("Other Supervisor");
    expect(scope).toContain("cashier-helper");
    expect(scope).toContain("manager");
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

  it("lets a Venue Supervisor see Shift Lead and that lead's crew", () => {
    const venuePeople = [
      person({
        staffId: "venue",
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      }),
      person({
        staffId: "direct",
        jobTitle: "Host",
        staffRole: "cashier",
        reportingManagerStaffId: "venue",
      }),
      ...shiftLeadLine("venue"),
    ];

    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "venue",
        viewerJobTitle: "Venue Supervisor",
        viewerStaffRole: "venue_supervisor",
        people: venuePeople,
      }),
    ).toEqual(["attendant", "crew-two", "direct", "shift-lead", "venue"]);
  });

  it("lets a Sr. Site Supervisor see Shift Lead and that lead's crew", () => {
    const srPeople = [
      person({
        staffId: "sr-site",
        jobTitle: "Sr. Site Supervisor",
        staffRole: "venue_supervisor",
      }),
      ...shiftLeadLine("sr-site"),
    ];

    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "sr-site",
        viewerJobTitle: "Sr. Site Supervisor",
        viewerStaffRole: "venue_supervisor",
        people: srPeople,
      }),
    ).toEqual(["attendant", "crew-two", "shift-lead", "sr-site"]);

    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "sr-site",
        viewerJobTitle: "Senior Site Supervisor",
        viewerStaffRole: null,
        people: srPeople,
      }),
    ).toEqual(["attendant", "crew-two", "shift-lead", "sr-site"]);
  });

  it("lets an F&B Manager see Shift Lead and that lead's crew", () => {
    const fbPeople = [
      person({
        staffId: "fb-mgr",
        jobTitle: "F&B Manager",
        staffRole: "other",
      }),
      person({
        staffId: "chef",
        jobTitle: "Chef",
        staffRole: "other",
        reportingManagerStaffId: "fb-mgr",
      }),
      ...shiftLeadLine("fb-mgr"),
    ];

    expect(
      managerSupervisorTeamIds({
        viewerStaffId: "fb-mgr",
        viewerJobTitle: "F&B Manager",
        viewerStaffRole: "other",
        people: fbPeople,
      }),
    ).toEqual(["attendant", "chef", "crew-two", "fb-mgr", "shift-lead"]);
  });

  it("gives an F&B manager the full subtree including under a cashier lead", () => {
    const scope = managerSupervisorTeamIds({
      viewerStaffId: "fb-manager",
      viewerJobTitle: "F&B Manager",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toEqual([
      "fb-cashier",
      "fb-cashier-helper",
      "fb-direct",
      "fb-manager",
      "fb-supervisor",
      "fb-team",
    ]);
    expect(rosterNames(scope)).toEqual(
      expect.arrayContaining(["Amon Supervisor", "Agnes Team", "Albert Direct", "Cashier Helper"]),
    );
    expect(scope).toContain("fb-manager");
    expect(scope).toContain("fb-cashier-helper");
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

    expect(scope).toEqual(["fb-cashier", "fb-cashier-helper", "fb-supervisor", "fb-team"]);
    expect(rosterNames(scope)).toEqual(expect.arrayContaining(["Amon Supervisor", "Agnes Team"]));
    expect(rosterNames(scope)).not.toContain("Albert Direct");
    expect(scope).not.toContain("fb-direct");
    expect(scope).toContain("fb-cashier-helper");
    expect(scope).not.toContain("cashier");
    expect(scope).not.toContain("fb-manager");
  });

  it("lists an F&B manager team overview with the full subtree and serving notice", () => {
    const roster = people.map((row) =>
      row.staffId === "fb-direct" ? { ...row, status: "serving_notice" } : row,
    );
    const scope = teamOverviewMemberIds({
      viewerStaffId: "fb-manager",
      viewerJobTitle: "F&B Manager",
      viewerStaffRole: "other",
      people: [
        ...roster,
        person({
          staffId: "fb-resigned",
          jobTitle: "Barista",
          staffRole: "other",
          reportingManagerStaffId: "fb-supervisor",
          status: "resigned",
        }),
      ],
    });

    expect(scope).toEqual(
      expect.arrayContaining([
        "fb-manager",
        "fb-supervisor",
        "fb-team",
        "fb-direct",
        "fb-cashier",
        "fb-cashier-helper",
      ]),
    );
    expect(scope).not.toContain("fb-resigned");
    expect(scope).not.toContain("cashier");
    expect(scope).not.toContain("other-crew");
  });

  it("lists a supervisor team overview with their team member and not the manager's other branch", () => {
    const scope = teamOverviewMemberIds({
      viewerStaffId: "fb-supervisor",
      viewerJobTitle: "Barista/Supervisor",
      viewerStaffRole: "other",
      people,
    });

    expect(scope).toContain("fb-team");
    expect(scope).toContain("fb-supervisor");
    expect(scope).toContain("fb-cashier-helper");
    expect(scope).not.toContain("fb-direct");
    expect(scope).not.toContain("fb-manager");
    expect(scope).not.toContain("cashier");
    expect(scope).not.toContain("other-crew");
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
    expect(isManagerTeamSupervisor("Operations Supervisor", null)).toBe(true);
  });
});

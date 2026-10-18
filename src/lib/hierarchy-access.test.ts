import { describe, expect, it } from "vitest";

import {
  canOfferCreateLogin,
  canOpenStaffProfile,
  hierarchyAccessMode,
  reportingAncestorIds,
  staffProfileOpenIds,
  teamHierarchyVisibleIds,
  teamScopedOrgChartPeople,
} from "./hierarchy-access";
import { groupOrgChart } from "./org-hierarchy";

describe("hierarchyAccessMode", () => {
  it("lets the CEO and COO edit the company chart", () => {
    expect(hierarchyAccessMode({ maxRoleLevel: 100, directReportCount: 0 })).toBe("edit");
    expect(hierarchyAccessMode({ maxRoleLevel: 95, directReportCount: 4 })).toBe("edit");
  });

  it("lets a manager or supervisor with direct reports view their team", () => {
    expect(hierarchyAccessMode({ maxRoleLevel: 20, directReportCount: 3 })).toBe("team");
    expect(hierarchyAccessMode({ maxRoleLevel: 60, directReportCount: 1 })).toBe("team");
    expect(hierarchyAccessMode({ maxRoleLevel: 80, directReportCount: 2 })).toBe("team");
  });

  it("turns away everyone else", () => {
    expect(hierarchyAccessMode({ maxRoleLevel: 80, directReportCount: 0 })).toBe("none");
    expect(hierarchyAccessMode({ maxRoleLevel: 20, directReportCount: 0 })).toBe("none");
    expect(hierarchyAccessMode({ maxRoleLevel: 0, directReportCount: 0 })).toBe("none");
  });
});

describe("canOfferCreateLogin", () => {
  it("offers create-login to an editor for anyone who has no login", () => {
    expect(
      canOfferCreateLogin({
        mode: "edit",
        staffId: "cashier",
        directReportStaffIds: [],
        loginLinked: false,
      }),
    ).toBe(true);
    expect(
      canOfferCreateLogin({
        mode: "edit",
        staffId: "cashier",
        directReportStaffIds: [],
        loginLinked: true,
      }),
    ).toBe(false);
  });

  it("offers create-login on a team view only for a direct report who has no login", () => {
    const directReportStaffIds = ["cashier"];
    expect(
      canOfferCreateLogin({ mode: "team", staffId: "cashier", directReportStaffIds, loginLinked: false }),
    ).toBe(true);
    expect(
      canOfferCreateLogin({ mode: "team", staffId: "cashier", directReportStaffIds, loginLinked: true }),
    ).toBe(false);
    expect(
      canOfferCreateLogin({ mode: "team", staffId: "crew", directReportStaffIds, loginLinked: false }),
    ).toBe(false);
    expect(
      canOfferCreateLogin({ mode: "team", staffId: "boss", directReportStaffIds, loginLinked: false }),
    ).toBe(false);
    expect(
      canOfferCreateLogin({ mode: "none", staffId: "cashier", directReportStaffIds, loginLinked: false }),
    ).toBe(false);
  });
});

const REPORTING_LINE = [
  { staffId: "ceo", reportingManagerStaffId: null },
  { staffId: "gm", reportingManagerStaffId: "ceo" },
  { staffId: "ruben", reportingManagerStaffId: "gm" },
  { staffId: "cashier", reportingManagerStaffId: "ruben" },
  { staffId: "lead", reportingManagerStaffId: "ruben" },
  { staffId: "crew", reportingManagerStaffId: "lead" },
  { staffId: "other", reportingManagerStaffId: "gm" },
];

describe("canOpenStaffProfile", () => {
  const rubenOpen = staffProfileOpenIds(REPORTING_LINE, "ruben", ["cashier"]);
  const rubenAncestors = reportingAncestorIds(REPORTING_LINE, "ruben");

  function rubenCanOpen(targetStaffId: string, rosterAccess = false) {
    return canOpenStaffProfile({
      companyWide: false,
      rosterAccess,
      teamLimited: true,
      viewerStaffId: "ruben",
      targetStaffId,
      openIds: rubenOpen,
    });
  }

  it("lets the CEO and COO open any profile", () => {
    expect(
      canOpenStaffProfile({
        companyWide: true,
        rosterAccess: true,
        teamLimited: false,
        viewerStaffId: null,
        targetStaffId: "cashier",
        openIds: new Set(),
      }),
    ).toBe(true);
    expect(
      canOpenStaffProfile({
        companyWide: true,
        rosterAccess: true,
        teamLimited: true,
        viewerStaffId: "ceo",
        targetStaffId: "crew",
        openIds: staffProfileOpenIds(REPORTING_LINE, "ceo"),
      }),
    ).toBe(true);
  });

  it("lets a manager open their own profile and people who report through them", () => {
    expect([...rubenAncestors].sort()).toEqual(["ceo", "gm"]);
    expect([...rubenOpen].sort()).toEqual(["cashier", "crew", "lead", "ruben"]);
    for (const targetStaffId of ["ruben", "cashier", "lead", "crew"]) {
      expect(rubenCanOpen(targetStaffId)).toBe(true);
    }
  });

  it("keeps profiles above a manager closed, including a direct URL", () => {
    for (const targetStaffId of ["ceo", "gm"]) {
      expect(rubenCanOpen(targetStaffId)).toBe(false);
      expect(rubenCanOpen(targetStaffId, true)).toBe(false);
    }
  });

  it("does not let a manager open someone outside the team", () => {
    expect(rubenCanOpen("other")).toBe(false);
    expect(rubenCanOpen("other", true)).toBe(false);
    expect(
      canOpenStaffProfile({
        companyWide: false,
        rosterAccess: true,
        teamLimited: false,
        viewerStaffId: "hr",
        targetStaffId: "ceo",
        openIds: new Set(["hr"]),
      }),
    ).toBe(true);
    expect(
      canOpenStaffProfile({
        companyWide: false,
        rosterAccess: true,
        teamLimited: false,
        viewerStaffId: null,
        targetStaffId: "cashier",
        openIds: new Set(),
      }),
    ).toBe(true);
    expect(
      canOpenStaffProfile({
        companyWide: false,
        rosterAccess: false,
        teamLimited: false,
        viewerStaffId: null,
        targetStaffId: "cashier",
        openIds: staffProfileOpenIds(REPORTING_LINE, null),
      }),
    ).toBe(false);
  });
});

describe("teamHierarchyVisibleIds", () => {
  it("keeps the manager, their team, and the line above them", () => {
    const visible = teamHierarchyVisibleIds(
      [
        { staffId: "ceo", reportingManagerStaffId: null },
        { staffId: "gm", reportingManagerStaffId: "ceo" },
        { staffId: "ruben", reportingManagerStaffId: "gm" },
        { staffId: "cashier", reportingManagerStaffId: "ruben" },
        { staffId: "lead", reportingManagerStaffId: "ruben" },
        { staffId: "crew", reportingManagerStaffId: "lead" },
        { staffId: "other", reportingManagerStaffId: "gm" },
      ],
      "ruben",
    );

    expect([...visible].sort()).toEqual(["cashier", "ceo", "crew", "gm", "lead", "ruben"]);
  });
});

describe("teamScopedOrgChartPeople", () => {
  const companyChart = [
    { staffId: "mary", fullName: "Mary", reportingManagerStaffId: null as string | null, orgChartPlaced: true },
    { staffId: "waqar", fullName: "Waqar", reportingManagerStaffId: "mary", orgChartPlaced: true },
    { staffId: "sachin", fullName: "Sachin", reportingManagerStaffId: "waqar", orgChartPlaced: true },
    { staffId: "sarah", fullName: "Sarah", reportingManagerStaffId: "sachin", orgChartPlaced: true },
    { staffId: "crew", fullName: "Crew", reportingManagerStaffId: "sachin", orgChartPlaced: true },
    { staffId: "other-branch", fullName: "Other", reportingManagerStaffId: "mary", orgChartPlaced: true },
  ];

  it("keeps company-chart parents for a supervisor (Sarah under Sachin, not Waqar)", () => {
    const scoped = teamScopedOrgChartPeople(companyChart, "waqar");
    expect(scoped.map((row) => row.staffId).sort()).toEqual(["crew", "mary", "sachin", "sarah", "waqar"]);
    expect(scoped.find((row) => row.staffId === "sarah")?.reportingManagerStaffId).toBe("sachin");

    const chart = groupOrgChart(scoped);
    expect(chart.childrenOf.get("waqar")?.map((row) => row.staffId)).toEqual(["sachin"]);
    expect(chart.childrenOf.get("sachin")?.map((row) => row.staffId).sort()).toEqual(["crew", "sarah"]);
  });

  it("does not invent a Waqar→Sarah edge for someone missing from the company chart", () => {
    const withoutSarah = companyChart.filter((row) => row.staffId !== "sarah");
    // Simulates the old bug: force-adding a directReportStaffId that the HoO chart never listed.
    const invented = [
      ...withoutSarah,
      { staffId: "sarah", fullName: "Sarah", reportingManagerStaffId: "waqar", orgChartPlaced: true },
    ];
    const inventedChart = groupOrgChart(teamScopedOrgChartPeople(invented, "waqar"));
    expect(inventedChart.childrenOf.get("waqar")?.map((row) => row.staffId).sort()).toEqual(["sachin", "sarah"]);

    // Scoped company chart alone must match HoO: only Sachin under Waqar.
    const scoped = teamScopedOrgChartPeople(withoutSarah, "waqar");
    expect(scoped.some((row) => row.staffId === "sarah")).toBe(false);
    const chart = groupOrgChart(scoped);
    expect(chart.childrenOf.get("waqar")?.map((row) => row.staffId)).toEqual(["sachin"]);
  });
});

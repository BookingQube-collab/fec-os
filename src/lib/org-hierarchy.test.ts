import { describe, expect, it } from "vitest";

import {
  departmentColor,
  groupOrgChart,
  layoutOrgChart,
  ORG_LEVEL_GAP,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  orgPanelGroups,
  parseOrgDragToken,
  planRemoveFromOrgChart,
  wouldCreateReportingCycle,
  type OrgChartPerson,
} from "./org-hierarchy";

const STAFF_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function person(partial: Partial<OrgChartPerson> & Pick<OrgChartPerson, "staffId" | "fullName">): OrgChartPerson {
  return {
    employeeCode: null,
    jobTitle: null,
    departmentIds: [],
    departmentId: null,
    departmentName: null,
    hasPhoto: false,
    photoUpdatedAt: null,
    reportingManagerStaffId: null,
    orgChartPlaced: false,
    ...partial,
  };
}

describe("org hierarchy", () => {
  it("rejects a reporting loop and allows a root", () => {
    const managers = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(wouldCreateReportingCycle(managers, "a", "c")).toBe(true);
    expect(wouldCreateReportingCycle(managers, "a", "a")).toBe(true);
    expect(wouldCreateReportingCycle(managers, "c", "a")).toBe(false);
    expect(wouldCreateReportingCycle(managers, "c", null)).toBe(false);
  });

  it("shows managers and their reports, and hides people who were never placed", () => {
    const chart = groupOrgChart([
      person({ staffId: "boss", fullName: "Boss" }),
      person({ staffId: "rep", fullName: "Rep", reportingManagerStaffId: "boss" }),
      person({ staffId: "free", fullName: "Free" }),
      person({ staffId: "ceo", fullName: "Ada Ceo", orgChartPlaced: true }),
    ]);

    expect([...chart.onChart].sort()).toEqual(["boss", "ceo", "rep"]);
    expect(chart.roots.map((row) => row.staffId)).toEqual(["ceo", "boss"]);
    expect(chart.childrenOf.get("boss")?.map((row) => row.staffId)).toEqual(["rep"]);
  });

  it("centers a parent over two children", () => {
    const layout = layoutOrgChart(["a"], new Map([["a", ["b", "c"]]]));
    const a = layout.nodes.find((node) => node.staffId === "a");
    const b = layout.nodes.find((node) => node.staffId === "b");
    const c = layout.nodes.find((node) => node.staffId === "c");
    expect(a && b && c).toBeTruthy();
    expect(b?.y).toBe(ORG_NODE_HEIGHT + ORG_LEVEL_GAP);
    expect(c?.y).toBe(b?.y);
    const parentCenter = (a?.x ?? 0) + ORG_NODE_WIDTH / 2;
    const childrenMid = ((b?.x ?? 0) + (c?.x ?? 0)) / 2 + ORG_NODE_WIDTH / 2;
    expect(parentCenter).toBeCloseTo(childrenMid);
    expect(layout.connectors).toHaveLength(1);
  });

  it("moves direct reports up when someone leaves the chart", () => {
    const plan = planRemoveFromOrgChart(
      [
        person({ staffId: "a", fullName: "A" }),
        person({ staffId: "b", fullName: "B", reportingManagerStaffId: "a" }),
        person({ staffId: "c", fullName: "C", reportingManagerStaffId: "b" }),
      ],
      "b",
    );
    expect(plan.childIds).toEqual(["c"]);
    expect(plan.childManagerId).toBe("a");
  });

  it("lists every department and groups people under each membership", () => {
    const groups = orgPanelGroups(
      [
        { id: "ops", name: "Operations", parentId: null, sortOrder: 1 },
        { id: "hr", name: "People", parentId: null, sortOrder: 2 },
      ],
      [
        person({
          staffId: "1",
          fullName: "Rajan Pathak",
          departmentIds: ["ops"],
          departmentId: "ops",
          departmentName: "Operations",
        }),
        person({ staffId: "2", fullName: "No Desk" }),
      ],
    );
    expect(groups.map((group) => group.name)).toEqual(["Operations", "People", "No department"]);
    expect(groups[0]?.people.map((row) => row.fullName)).toEqual(["Rajan Pathak"]);
    expect(groups[1]?.people).toEqual([]);
    expect(groups[2]?.people.map((row) => row.fullName)).toEqual(["No Desk"]);
  });

  it("keeps a department color stable and parses drag tokens", () => {
    expect(departmentColor("ops")).toBe(departmentColor("ops"));
    expect(departmentColor(null)).not.toBe(departmentColor("ops"));
    expect(parseOrgDragToken(`fec-staff:${STAFF_A}`)).toBe(STAFF_A);
    expect(parseOrgDragToken(`fec-staff:${STAFF_B}`)).toBe(STAFF_B);
    expect(parseOrgDragToken("fec-staff:not-a-uuid")).toBeNull();
    expect(parseOrgDragToken("hello")).toBeNull();
  });
});

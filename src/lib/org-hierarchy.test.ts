import { describe, expect, it } from "vitest";

import {
  departmentColor,
  expandedChildIds,
  groupOrgChart,
  initialCollapsedIds,
  layoutOrgChart,
  ORG_LEVEL_GAP,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  orgCurvePath,
  orgPanelGroups,
  parseOrgDragToken,
  staffDepartmentPlacement,
  planOrgChartMove,
  reportCandidateIds,
  reportLikeOthersPlacement,
  suggestedOrgMoveMode,
  planRemoveFromOrgChart,
  reportingDrop,
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

  it("sets the drop target as line manager and refuses a drop onto a descendant", () => {
    const managers = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
      ["d", "c"],
    ]);
    expect(reportingDrop(managers, "d", "a")).toEqual({ ok: true, managerStaffId: "a" });
    expect(reportingDrop(managers, "c", null)).toEqual({ ok: true, managerStaffId: null });
    expect(reportingDrop(managers, "b", "d")).toEqual({ ok: false, reason: "cycle" });
    expect(reportingDrop(managers, "b", "b")).toEqual({ ok: false, reason: "self" });
    expect(managers.get("d")).toBe("c");
  });

  it("plans a report-to drop, a reverse team move, and an insert between a manager and their team", () => {
    const managers = new Map<string, string | null>([
      ["mary", "rajan"],
      ["jorene", "mary"],
      ["cashier", "mary"],
      ["lead", "mary"],
    ]);

    expect(planOrgChartMove(managers, { staffId: "jorene", targetStaffId: "mary", mode: "reports-to" })).toEqual({
      ok: true,
      updates: [],
    });
    expect(planOrgChartMove(managers, { staffId: "jorene", targetStaffId: "lead", mode: "reports-to" })).toEqual({
      ok: true,
      updates: [{ staffId: "jorene", managerStaffId: "lead" }],
    });
    expect(planOrgChartMove(managers, { staffId: "mary", targetStaffId: "jorene", mode: "reports-to" })).toEqual({
      ok: false,
      reason: "cycle",
    });

    const reverse = planOrgChartMove(managers, {
      staffId: "jorene",
      targetStaffId: "mary",
      mode: "takes-reports",
      reportStaffIds: ["cashier"],
    });
    expect(reverse).toEqual({ ok: true, updates: [{ staffId: "cashier", managerStaffId: "jorene" }] });
    expect(managers.get("mary")).toBe("rajan");
    expect(managers.get("jorene")).toBe("mary");
    expect(managers.get("lead")).toBe("mary");

    expect(
      planOrgChartMove(managers, {
        staffId: "jorene",
        targetStaffId: "mary",
        mode: "takes-reports",
        reportStaffIds: [],
      }),
    ).toEqual({ ok: false, reason: "none" });

    expect(
      planOrgChartMove(
        new Map([
          ["boss", null],
          ["leader", "boss"],
          ["rep", "mary"],
          ["other", "mary"],
          ["mary", "boss"],
        ]),
        { staffId: "leader", targetStaffId: "mary", mode: "insert-between" },
      ),
    ).toEqual({
      ok: true,
      updates: [
        { staffId: "leader", managerStaffId: "mary" },
        { staffId: "other", managerStaffId: "leader" },
        { staffId: "rep", managerStaffId: "leader" },
      ],
    });

    const inserted = planOrgChartMove(managers, {
      staffId: "jorene",
      targetStaffId: "mary",
      mode: "insert-between",
    });
    expect(inserted).toEqual({
      ok: true,
      updates: [
        { staffId: "cashier", managerStaffId: "jorene" },
        { staffId: "lead", managerStaffId: "jorene" },
      ],
    });

    const afterInsert = new Map(managers);
    if (inserted.ok) {
      for (const update of inserted.updates) afterInsert.set(update.staffId, update.managerStaffId);
    }
    const stacked = planOrgChartMove(afterInsert, {
      staffId: "lead",
      targetStaffId: "jorene",
      mode: "insert-between",
    });
    expect(stacked).toEqual({
      ok: true,
      updates: [
        { staffId: "cashier", managerStaffId: "lead" },
      ],
    });

    const ancestor = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(
      planOrgChartMove(ancestor, {
        staffId: "c",
        targetStaffId: "a",
        mode: "takes-reports",
        reportStaffIds: ["b"],
      }),
    ).toEqual({ ok: false, reason: "cycle" });
    expect(planOrgChartMove(managers, { staffId: "jorene", targetStaffId: "jorene", mode: "insert-between" })).toEqual({
      ok: false,
      reason: "self",
    });
  });

  it("inserts a person above a leaf and offers that leaf with their peers", () => {
    const managers = new Map<string, string | null>([
      ["mary", "rajan"],
      ["jorene", "rajan"],
      ["angie", "mary"],
      ["cashier", "mary"],
    ]);

    expect(reportCandidateIds(managers, "jorene", "angie")).toEqual(["angie", "cashier"]);
    expect(planOrgChartMove(managers, { staffId: "jorene", targetStaffId: "angie", mode: "insert-between" })).toEqual({
      ok: true,
      updates: [
        { staffId: "jorene", managerStaffId: "mary" },
        { staffId: "angie", managerStaffId: "jorene" },
      ],
    });
    expect(managers.get("jorene")).toBe("rajan");
    expect(managers.get("angie")).toBe("mary");

    const alreadyUnderMary = new Map(managers);
    alreadyUnderMary.set("jorene", "mary");
    expect(planOrgChartMove(alreadyUnderMary, { staffId: "jorene", targetStaffId: "angie", mode: "insert-between" })).toEqual({
      ok: true,
      updates: [{ staffId: "angie", managerStaffId: "jorene" }],
    });

    expect(
      planOrgChartMove(managers, {
        staffId: "jorene",
        targetStaffId: "angie",
        mode: "takes-reports",
        reportStaffIds: ["angie", "cashier"],
      }),
    ).toEqual({
      ok: true,
      updates: [
        { staffId: "angie", managerStaffId: "jorene" },
        { staffId: "cashier", managerStaffId: "jorene" },
      ],
    });
    expect(
      planOrgChartMove(managers, {
        staffId: "jorene",
        targetStaffId: "angie",
        mode: "takes-reports",
        reportStaffIds: ["mary"],
      }),
    ).toEqual({ ok: false, reason: "none" });

    expect(
      planOrgChartMove(new Map([["adil", null], ["jorene", "mary"]]), {
        staffId: "jorene",
        targetStaffId: "adil",
        mode: "insert-between",
      }),
    ).toEqual({ ok: false, reason: "none" });

    expect(
      planOrgChartMove(new Map([["jorene", "mary"], ["angie", "jorene"]]), {
        staffId: "jorene",
        targetStaffId: "angie",
        mode: "insert-between",
      }),
    ).toEqual({ ok: false, reason: "self" });
  });

  it("puts any middle person back on the same line as the other staff", () => {
    const managers = new Map<string, string | null>([
      ["boss", null],
      ["middle", "boss"],
      ["rep", "middle"],
      ["other", "middle"],
      ["peer", "boss"],
    ]);
    const lifted = {
      ok: true as const,
      updates: [
        { staffId: "other", managerStaffId: "boss" },
        { staffId: "rep", managerStaffId: "boss" },
      ],
    };

    expect(reportLikeOthersPlacement(managers, "middle", "rep")).toEqual({ managerStaffId: "boss" });
    expect(reportLikeOthersPlacement(managers, "middle", "boss")).toEqual({ managerStaffId: "boss" });
    expect(reportLikeOthersPlacement(managers, "middle", "peer")).toEqual({ managerStaffId: "boss" });
    expect(planOrgChartMove(managers, { staffId: "middle", targetStaffId: "rep", mode: "same-manager" })).toEqual(lifted);
    expect(planOrgChartMove(managers, { staffId: "middle", targetStaffId: "boss", mode: "same-manager" })).toEqual(lifted);
    expect(planOrgChartMove(managers, { staffId: "middle", targetStaffId: "peer", mode: "same-manager" })).toEqual(lifted);
    expect(managers.get("middle")).toBe("boss");
    expect(managers.get("rep")).toBe("middle");
    expect(managers.get("other")).toBe("middle");

    expect(suggestedOrgMoveMode(managers, "middle", "rep")).toBe("same-manager");
    expect(suggestedOrgMoveMode(managers, "middle", "boss")).toBe("same-manager");
    expect(suggestedOrgMoveMode(managers, "middle", "peer")).toBe("reports-to");
    expect(planOrgChartMove(managers, { staffId: "middle", targetStaffId: "rep", mode: "reports-to" })).toEqual({
      ok: false,
      reason: "cycle",
    });
    expect(planOrgChartMove(managers, { staffId: "middle", targetStaffId: "rep", mode: "insert-between" })).toEqual({
      ok: false,
      reason: "self",
    });
    expect(planOrgChartMove(managers, { staffId: "peer", targetStaffId: "boss", mode: "reports-to" })).toEqual({
      ok: true,
      updates: [],
    });
    expect(suggestedOrgMoveMode(managers, "peer", "boss")).toBe("reports-to");
    expect(reportLikeOthersPlacement(managers, "peer", "boss")).toBeNull();
    expect(reportLikeOthersPlacement(managers, "middle", "outsider")).toBeNull();

    expect(
      planOrgChartMove(new Map([["middle", null], ["rep", "middle"]]), {
        staffId: "middle",
        targetStaffId: "rep",
        mode: "same-manager",
      }),
    ).toEqual({ ok: false, reason: "none" });
    expect(
      planOrgChartMove(managers, { staffId: "middle", targetStaffId: "middle", mode: "same-manager" }),
    ).toEqual({ ok: false, reason: "self" });
    expect(reportingDrop(managers, "middle", "middle")).toEqual({ ok: false, reason: "self" });

    const loop = new Map<string, string | null>([
      ["boss", "rep"],
      ["middle", "boss"],
      ["rep", "middle"],
    ]);
    expect(planOrgChartMove(loop, { staffId: "middle", targetStaffId: "rep", mode: "same-manager" })).toEqual({
      ok: false,
      reason: "cycle",
    });
    expect(reportLikeOthersPlacement(loop, "middle", "rep")).toBeNull();
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

  it("centers a parent between two children", () => {
    const layout = layoutOrgChart(["a"], new Map([["a", ["b", "c"]]]));
    const a = layout.nodes.find((node) => node.staffId === "a");
    const b = layout.nodes.find((node) => node.staffId === "b");
    const c = layout.nodes.find((node) => node.staffId === "c");
    expect(a && b && c).toBeTruthy();
    expect(b?.x).toBe(ORG_NODE_WIDTH + ORG_LEVEL_GAP);
    expect(c?.x).toBe(b?.x);
    const parentCenter = (a?.y ?? 0) + ORG_NODE_HEIGHT / 2;
    const childrenMid = ((b?.y ?? 0) + (c?.y ?? 0)) / 2 + ORG_NODE_HEIGHT / 2;
    expect(parentCenter).toBeCloseTo(childrenMid);
    expect(layout.connectors).toHaveLength(2);
    expect(layout.connectors[0]).toContain("C ");
  });

  it("hides a collapsed branch and curves toward the child", () => {
    const childIds = new Map<string, string[]>([
      ["a", ["b", "c"]],
      ["b", ["d"]],
    ]);
    expect([...initialCollapsedIds(["a"], childIds)]).toEqual(["b"]);
    const hidden = layoutOrgChart(["a"], expandedChildIds(["a"], childIds, new Set(["b"])));
    expect(hidden.nodes.map((node) => node.staffId).sort()).toEqual(["a", "b", "c"]);
    const open = layoutOrgChart(["a"], expandedChildIds(["a"], childIds, new Set(["a"])));
    expect(open.nodes.map((node) => node.staffId)).toEqual(["a"]);

    const parent = { x: 0, y: 0 };
    const child = { x: ORG_NODE_WIDTH + ORG_LEVEL_GAP, y: 40 };
    const ltr = orgCurvePath(parent, child);
    expect(ltr.startsWith(`M ${ORG_NODE_WIDTH} ${ORG_NODE_HEIGHT / 2}`)).toBe(true);
    expect(ltr.endsWith(`${child.x} ${40 + ORG_NODE_HEIGHT / 2}`)).toBe(true);
    const rtl = orgCurvePath(parent, child, true);
    expect(rtl.startsWith(`M 0 ${ORG_NODE_HEIGHT / 2}`)).toBe(true);
    expect(rtl).toContain(`${child.x + ORG_NODE_WIDTH}`);
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

  it("places staff on the same department as the org chart", () => {
    const departments = [
      { id: "ops", name: "Operations", parentId: null, sortOrder: 1 },
      { id: "hr", name: "People", parentId: null, sortOrder: 2 },
    ];
    expect(
      staffDepartmentPlacement(departments, [{ id: "ops", name: "Operations", sortOrder: 1 }], "Ignored"),
    ).toEqual({
      departmentIds: ["ops"],
      departmentId: "ops",
      departmentName: "Operations",
    });
    expect(staffDepartmentPlacement(departments, [], "people")).toEqual({
      departmentIds: ["hr"],
      departmentId: "hr",
      departmentName: "People",
    });
    expect(staffDepartmentPlacement(departments, [], "Night crew")).toEqual({
      departmentIds: [],
      departmentId: null,
      departmentName: "Night crew",
    });
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

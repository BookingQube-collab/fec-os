import { describe, expect, it } from "vitest";

import {
  approvedHistoryHasActiveFilters,
  buildApprovedHistoryByDepartment,
  buildApprovedHistoryByLocation,
  buildApprovedHistoryByStatus,
  buildApprovedHistoryVolumeByDay,
  EMPTY_APPROVED_HISTORY_FILTERS,
  filterApprovedHistoryRows,
  uniqueApprovedHistoryDepartments,
  type ApprovedHistoryRowLike,
} from "@/lib/attendance-hr/missed-punch-approved-history";

function row(
  partial: Partial<ApprovedHistoryRowLike> & Pick<ApprovedHistoryRowLike, "locationId" | "status">,
): ApprovedHistoryRowLike {
  return {
    workDate: partial.workDate ?? "2026-10-01",
    locationId: partial.locationId,
    department: partial.department ?? null,
    staffName: partial.staffName ?? "Alex",
    employeeCode: partial.employeeCode ?? "E1",
    status: partial.status,
    steps: partial.steps ?? [{ stepRole: "ops", status: "approved", actedByName: "Ops" }],
  };
}

describe("filterApprovedHistoryRows", () => {
  const rows = [
    row({
      locationId: "loc-a",
      workDate: "2026-10-01",
      department: "Ops",
      staffName: "Alex Kim",
      employeeCode: "AK1",
      status: "approved",
      steps: [{ stepRole: "ops", status: "approved" }],
    }),
    row({
      locationId: "loc-b",
      workDate: "2026-10-15",
      department: "F&B",
      staffName: "Sam Lee",
      employeeCode: "SL2",
      status: "pending",
      steps: [
        { stepRole: "manager", status: "approved" },
        { stepRole: "ops", status: "pending" },
      ],
    }),
  ];

  it("filters by date range, location, department, and staff search", () => {
    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        dateFrom: "2026-10-10",
        dateTo: "2026-10-31",
      }).map((r) => r.employeeCode),
    ).toEqual(["SL2"]);

    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        locationId: "loc-a",
      }).map((r) => r.employeeCode),
    ).toEqual(["AK1"]);

    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        department: "F&B",
      }).map((r) => r.employeeCode),
    ).toEqual(["SL2"]);

    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        staffQuery: "ak1",
      }).map((r) => r.employeeCode),
    ).toEqual(["AK1"]);
  });

  it("filters by status and approver seat", () => {
    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        status: "in_progress",
      }).map((r) => r.employeeCode),
    ).toEqual(["SL2"]);

    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        status: "approved",
      }).map((r) => r.employeeCode),
    ).toEqual(["AK1"]);

    expect(
      filterApprovedHistoryRows(rows, {
        ...EMPTY_APPROVED_HISTORY_FILTERS,
        stepRole: "manager",
      }).map((r) => r.employeeCode),
    ).toEqual(["SL2"]);
  });
});

describe("approved history chart builders", () => {
  const rows = [
    row({ locationId: "loc-a", workDate: "2026-10-01", department: "Ops", status: "approved" }),
    row({ locationId: "loc-a", workDate: "2026-10-01", department: "Ops", status: "approved" }),
    row({ locationId: "loc-b", workDate: "2026-10-02", department: null, status: "pending" }),
  ];

  it("aggregates volume, department, location, and status", () => {
    expect(buildApprovedHistoryVolumeByDay(rows)).toEqual([
      { date: "2026-10-01", count: 2 },
      { date: "2026-10-02", count: 1 },
    ]);
    expect(buildApprovedHistoryByDepartment(rows, "Unassigned")).toEqual([
      { key: "Ops", name: "Ops", count: 2 },
      { key: "Unassigned", name: "Unassigned", count: 1 },
    ]);
    expect(buildApprovedHistoryByLocation(rows, (id) => id.toUpperCase())).toEqual([
      { key: "loc-a", name: "LOC-A", count: 2 },
      { key: "loc-b", name: "LOC-B", count: 1 },
    ]);
    expect(
      buildApprovedHistoryByStatus(rows, { approved: "Approved", inProgress: "In progress" }),
    ).toEqual([
      { key: "approved", name: "Approved", count: 2 },
      { key: "in_progress", name: "In progress", count: 1 },
    ]);
  });

  it("lists unique departments and detects active filters", () => {
    expect(uniqueApprovedHistoryDepartments(rows)).toEqual(["Ops"]);
    expect(approvedHistoryHasActiveFilters(EMPTY_APPROVED_HISTORY_FILTERS)).toBe(false);
    expect(
      approvedHistoryHasActiveFilters({ ...EMPTY_APPROVED_HISTORY_FILTERS, staffQuery: "a" }),
    ).toBe(true);
  });
});

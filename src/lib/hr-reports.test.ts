import { describe, expect, it } from "vitest";

import {
  columnsForReport,
  filterReportColumns,
  isHrReportVisible,
  projectReportRows,
  stubRowsForReport,
  visibleHrReportIds,
  type HrReportCaps,
} from "./hr-reports";

const fullCaps: HrReportCaps = {
  canIdentity: true,
  canSalary: true,
  canPayroll: true,
  canRecruitment: true,
  canWarnings: true,
  canLeave: true,
  canOt: true,
  canQuota: true,
  canAirTicket: true,
  canExit: true,
  canDocs: true,
  canTimeline: true,
};

describe("hr report permission filtering", () => {
  it("hides salary and QID columns without caps", () => {
    const cols = columnsForReport("employee_master");
    const filtered = filterReportColumns(cols, { canIdentity: false, canSalary: false });
    expect(filtered.map((c) => c.key)).not.toContain("qid");
    expect(filtered.map((c) => c.key)).not.toContain("basicSalary");
    expect(filtered.map((c) => c.key)).toContain("fullName");

    const rows = projectReportRows(
      [{ employeeCode: "E1", fullName: "Ada", qid: "secret", basicSalary: 5000, status: "active" }],
      filtered,
    );
    expect(Object.keys(rows[0]!)).not.toContain("qid");
    expect(Object.keys(rows[0]!)).not.toContain("basicSalary");
    expect(rows[0]!.fullName).toBe("Ada");
  });

  it("keeps identity columns when allowed", () => {
    const cols = filterReportColumns(columnsForReport("payroll"), {
      canIdentity: true,
      canSalary: false,
    });
    expect(cols.map((c) => c.key)).toContain("qid");
    expect(cols.map((c) => c.key)).not.toContain("netQar");
  });

  it("gates reports by capability", () => {
    const limited: HrReportCaps = {
      ...fullCaps,
      canPayroll: false,
      canRecruitment: false,
      canSalary: false,
      canIdentity: false,
    };
    expect(isHrReportVisible("payroll", limited)).toBe(false);
    expect(isHrReportVisible("recruitment_funnel", limited)).toBe(false);
    expect(isHrReportVisible("employee_master", limited)).toBe(true);
    expect(visibleHrReportIds(limited)).not.toContain("payroll");
    expect(visibleHrReportIds(fullCaps)).toContain("payroll");
  });

  it("returns stub rows for loan and bonus packs", () => {
    expect(stubRowsForReport("loan_deduction")[0]?.status).toBe("stub");
    expect(stubRowsForReport("bonus_commission")[0]?.note).toMatch(/stub/i);
    expect(stubRowsForReport("employee_master")).toEqual([]);
  });
});

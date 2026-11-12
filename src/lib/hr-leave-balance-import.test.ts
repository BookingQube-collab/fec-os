import { describe, expect, it } from "vitest";

import {
  dryRunLeaveBalanceCsv,
  leaveBalanceImportTemplateCsv,
} from "@/lib/hr-leave-balance-import";

describe("leave balance CSV dry-run (Phase 4 skeleton)", () => {
  it("returns a header-only template with no invented balances", () => {
    const csv = leaveBalanceImportTemplateCsv();
    expect(csv).toMatch(/^employee_code,/);
    expect(csv.trim().split("\n")).toHaveLength(1);
  });

  it("parses valid rows and flags missing identity", () => {
    const csv = [
      "employee_code,qid,year,leave_type,allotted_days,carried_forward,used_days,pending_days,expired_days,notes",
      "E001,,2026,annual,21,0,5,0,0,opening",
      ",,2026,sick,15,0,0,0,0,",
      "E002,,2026,annual,-1,0,0,0,0,",
    ].join("\n");
    const result = dryRunLeaveBalanceCsv(csv);
    expect(result.okCount).toBe(1);
    expect(result.rows[0]?.employeeCode).toBe("E001");
    expect(result.rows[0]?.notes).toContain("external_verified");
    expect(result.issues.some((i) => i.code === "missing_identity")).toBe(true);
    expect(result.issues.some((i) => i.code === "bad_number")).toBe(true);
  });
});

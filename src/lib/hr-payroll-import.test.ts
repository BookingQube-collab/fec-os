import { describe, expect, it } from "vitest";

import {
  computeExcelStyleNet,
  computeProjectStaffNet,
  inferPaymentMethod,
  parsePayrollMoney,
  parsePayrollWorkbookSheets,
} from "./hr-payroll-import";
import { matchPayrollImportRow, matchAllPayrollImportRows } from "./hr-payroll-match";
import { buildReconciliationReport, systemNetFromImportRow } from "./hr-payroll-reconcile";

describe("parsePayrollMoney", () => {
  it("parses formatted QAR cells", () => {
    expect(parsePayrollMoney(" 3,239.00 ")).toBe(3239);
    expect(parsePayrollMoney("-")).toBe(0);
    expect(parsePayrollMoney(2500)).toBe(2500);
    expect(parsePayrollMoney(null)).toBe(0);
  });
});

describe("Excel-style net", () => {
  it("matches August earned + adds − deducts", () => {
    expect(
      computeExcelStyleNet({
        earnedGross: 3866.67,
        bonus: 0,
        otPayReg: 0,
        otPayPh: 0,
        extraPay: 0,
        advancePay: 0,
        deduction: 0,
      }),
    ).toBe(3866.67);
    expect(
      computeExcelStyleNet({
        earnedGross: 2100,
        extraPay: 16,
        deduction: 0,
      }),
    ).toBe(2116);
  });

  it("computes project staff days × rate", () => {
    expect(computeProjectStaffNet({ perDayRate: 100, workingDays: 21, extraPay: 16 })).toBe(2116);
  });
});

describe("inferPaymentMethod", () => {
  it("picks sole positive bucket", () => {
    expect(inferPaymentMethod({ wps: 0, cash: 0, bankTransfer: 0, cheque: 2500 })).toBe("cheque");
    expect(inferPaymentMethod({ wps: 3000, cash: 0, bankTransfer: 0, cheque: 0 })).toBe("wps");
  });
});

describe("August workbook parse shape", () => {
  it("parses main + project staff sheets from AOA", () => {
    const parsed = parsePayrollWorkbookSheets({
      sheetNames: ["August 2026", "Project Staff August 2026", "WPS", "Pending Eid Holiday Overtime"],
      sheets: {
        "August 2026": [
          ["Sr No.", null, "Name Of Staff", "Position", "Workplace", "Basic", "Allowances", "Gross", "Days", "Hours", "Earned", "Bonus", "OT H", "OT P", "PH H", "PH P", "Extra", "Advance", "Deduction", "Net", "WPS", "Cash", "Bank", "Cheq", "NOTES"],
          [28, "31", "Albert Tahum Go", "Café Supervisor", "Kids Drive Thru Café-City Centre", 1500, 1000, 2500, 30, 9, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 2500, null],
          [30, "32", "Joshua Kiyimba", "Commis Chef", null, 1200, 1800, 3000, 30, 9, 3000, 0, 0, 0, 0, 0, 0, 0, 0, 3000, 3000, 0, 0, 0, null],
        ],
        "Project Staff August 2026": [
          [],
          [],
          [],
          [],
          [],
          [],
          ["Sr No.", "Name Of Staff", "Position", "Workplace/Project", "Per Day", "Gross Salary", "Working Days", "Working Hours ", "Gross Salary-July 26", "Deductions", "Extra Pay", "Net Payable", "WPS", "Cash", "Bank Transfer", "Cheq", "Remarks"],
          [1, "Mohamed Islem Bettein", "Attendant", "Winter Mirage", 100, 3000, 21, null, 2100, 0, 16, 2116, 0, 0, 0, 2116, "18 August LWD"],
        ],
        WPS: [
          ["No", null, "QID No.", "Name", "Nationality", "Gender", "RP Exp date", "Remarks", "N. Address", null, "WPS"],
          [1, null, "27658603057", "Adil Bashir Ahmed", "Pakistan", "Male", "2029-05-15", null, "YES", null, 150000],
          [3, null, "28060829780", "Albert Tahum Go", "Philippines", "Male", "2026-12-24", null, "YES", null, null],
        ],
        "Pending Eid Holiday Overtime": [
          ["Name", "Position", "Location ", "No of Pending Offset", "Remaks", "Gross Salary ", " per day ", "Total "],
          ["Asghar Ali Bhatti Naimat Ali", "Sr. Site Supervisor", "Inflata Park/City Centre", 9, "6 EID", 5000, 166.67, 1500],
        ],
      },
    });
    expect(parsed.month).toBe("2026-08");
    expect(parsed.main).toHaveLength(2);
    expect(parsed.main[0]!.paymentMethod).toBe("cheque");
    expect(parsed.main[0]!.qid).toBe("28060829780");
    expect(parsed.projectStaff).toHaveLength(1);
    expect(parsed.projectStaff[0]!.netPayable).toBe(2116);
    expect(parsed.pendingEidOt).toHaveLength(1);
    expect(parsed.wpsRegister).toHaveLength(2);
  });
});

describe("payroll staff match (no dupes)", () => {
  const staff = [
    { id: "s1", employee_code: "INF-CC-BM", full_name: "Albert Tahum Go", qid: "28060829780" },
    { id: "s2", employee_code: "KDS-CC-CHEF", full_name: "Joshua Kiyimba", qid: null },
    { id: "s3", employee_code: "UA-DM-STF01", full_name: "Mohamed Islem Bettein", qid: null },
  ];

  it("matches by QID then name", () => {
    const byQid = matchPayrollImportRow(
      { employeeCode: "31", employeeName: "Albert Tahum Go", qid: "28060829780" },
      staff,
    );
    // code "31" won't match INF-CC-BM — falls through to QID
    expect(byQid.matchRule).toBe("qid");
    expect(byQid.staffId).toBe("s1");

    const byName = matchPayrollImportRow(
      { employeeCode: null, employeeName: "Joshua Kiyimba", qid: null },
      staff,
    );
    expect(byName.matchRule).toBe("name_exact");
    expect(byName.staffId).toBe("s2");
  });

  it("does not invent staff for unmatched", () => {
    const m = matchPayrollImportRow(
      { employeeCode: null, employeeName: "Totally Unknown Person", qid: null },
      staff,
    );
    expect(m.staffId).toBeNull();
    expect(m.matchRule).toBe("unmatched");
  });
});

describe("reconciliation report", () => {
  it("marks successfully reconciled only when no variance/unmatched", () => {
    const staff = [
      { id: "s1", employee_code: "A", full_name: "Albert Tahum Go", qid: null },
    ];
    const rows = matchAllPayrollImportRows(
      [
        {
          sheet: "August 2026",
          category: "monthly",
          srNo: 1,
          employeeCode: null,
          employeeName: "Albert Tahum Go",
          position: null,
          workplace: null,
          basicSalary: 1500,
          allowances: 1000,
          grossSalary: 2500,
          workingDays: 30,
          workingHours: 9,
          earnedGross: 2500,
          bonus: 0,
          otHoursReg: 0,
          otPayReg: 0,
          otHoursPh: 0,
          otPayPh: 0,
          extraPay: 0,
          advancePay: 0,
          deduction: 0,
          netPayable: 2500,
          wps: 0,
          cash: 0,
          bankTransfer: 0,
          cheque: 2500,
          paymentMethod: "cheque",
          notes: null,
        },
      ],
      staff,
    );
    const report = buildReconciliationReport(rows);
    expect(report.summary.matched).toBe(1);
    expect(report.summary.successfullyReconciled).toBe(true);
    expect(systemNetFromImportRow(rows[0]!)).toBe(2500);
  });
});

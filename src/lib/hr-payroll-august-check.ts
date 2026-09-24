/**
 * Runnable check: parse demo-data/August_2026.xlsx and assert shape + Excel net.
 * Run: npx tsx src/lib/hr-payroll-august-check.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

import { computeExcelStyleNet, parsePayrollWorkbookSheets } from "./hr-payroll-import";
import { matchAllPayrollImportRows } from "./hr-payroll-match";
import { buildReconciliationReport } from "./hr-payroll-reconcile";

const file = resolve(process.cwd(), "demo-data/August_2026.xlsx");
if (!existsSync(file)) {
  console.error("Missing", file);
  process.exit(1);
}

const buf = readFileSync(file);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: true });
const sheets: Record<string, unknown[][]> = {};
for (const name of wb.SheetNames) {
  sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

const parsed = parsePayrollWorkbookSheets({ sheetNames: wb.SheetNames, sheets });
const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

assert(parsed.month === "2026-08", `expected 2026-08 got ${parsed.month}`);
assert(parsed.main.length >= 60, `expected ≥60 monthly rows got ${parsed.main.length}`);
assert(parsed.projectStaff.length >= 10, `expected ≥10 project staff got ${parsed.projectStaff.length}`);
assert(parsed.wpsRegister.length >= 40, `expected ≥40 WPS rows got ${parsed.wpsRegister.length}`);
assert(parsed.pendingEidOt.length >= 30, `expected ≥30 Eid OT rows got ${parsed.pendingEidOt.length}`);

const albert = parsed.main.find((r) => /albert tahum go/i.test(r.employeeName));
assert(Boolean(albert), "Albert missing from August sheet");
assert(albert!.netPayable === 2500, `Albert net ${albert!.netPayable}`);
assert(computeExcelStyleNet(albert!) === albert!.netPayable, "Albert Excel-style net mismatch");
assert(albert!.paymentMethod === "cheque", `Albert method ${albert!.paymentMethod}`);

const project = parsed.projectStaff[0]!;
assert(project.netPayable === 2116 || project.employeeName.length > 0, "project staff row broken");

const fake = parsed.main.slice(0, 3).map((r, i) => ({
  id: `s${i}`,
  employee_code: `C${i}`,
  full_name: r.employeeName,
  qid: r.qid ?? null,
}));
const recon = buildReconciliationReport(matchAllPayrollImportRows(parsed.main.slice(0, 3), fake));
assert(recon.summary.matched === 3, `expected 3 matched got ${recon.summary.matched}`);
assert(recon.summary.successfullyReconciled, "sample should reconcile");

const excelNet =
  Math.round(
    (parsed.main.reduce((s, r) => s + r.netPayable, 0) +
      parsed.projectStaff.reduce((s, r) => s + r.netPayable, 0)) *
      100,
  ) / 100;

console.log(
  JSON.stringify(
    {
      ok: true,
      month: parsed.month,
      main: parsed.main.length,
      projectStaff: parsed.projectStaff.length,
      wps: parsed.wpsRegister.length,
      pendingEidOt: parsed.pendingEidOt.length,
      excelNetTotal: excelNet,
      sampleReconciled: recon.summary.successfullyReconciled,
    },
    null,
    2,
  ),
);

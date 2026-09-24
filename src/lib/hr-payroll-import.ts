/**
 * August-style payroll workbook parse + Excel-formula net (pure).
 * SheetJS buffer in → typed rows out. No Supabase.
 */

export type PayrollEmploymentCategory =
  | "permanent"
  | "secondment"
  | "project_staff"
  | "temporary"
  | "remote";

export type PayrollImportPaymentMethod = "wps" | "cheque" | "bank_transfer" | "cash";

export type ParsedPayrollImportRow = {
  sheet: string;
  category: "monthly" | "project_staff" | "pending_eid_ot";
  srNo: number | null;
  employeeCode: string | null;
  employeeName: string;
  position: string | null;
  workplace: string | null;
  basicSalary: number;
  allowances: number;
  grossSalary: number;
  workingDays: number;
  workingHours: number;
  earnedGross: number;
  bonus: number;
  otHoursReg: number;
  otPayReg: number;
  otHoursPh: number;
  otPayPh: number;
  extraPay: number;
  advancePay: number;
  deduction: number;
  netPayable: number;
  wps: number;
  cash: number;
  bankTransfer: number;
  cheque: number;
  paymentMethod: PayrollImportPaymentMethod;
  notes: string | null;
  perDayRate?: number;
  qid?: string | null;
};

export type ParsedWpsRegisterRow = {
  qid: string | null;
  employeeName: string;
  nationality: string | null;
  gender: string | null;
  rpExpDate: string | null;
  remarks: string | null;
  wpsAmount: number;
  wpsRemarks: string | null;
};

export type ParsedEidOtRow = {
  employeeName: string;
  position: string | null;
  location: string | null;
  pendingOffsetDays: number;
  remarks: string | null;
  grossSalary: number;
  perDay: number;
  total: number;
};

export type ParsedPayrollWorkbook = {
  periodName: string;
  month: string;
  sheets: string[];
  main: ParsedPayrollImportRow[];
  projectStaff: ParsedPayrollImportRow[];
  wpsRegister: ParsedWpsRegisterRow[];
  pendingEidOt: ParsedEidOtRow[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse Excel money cells: " 3,239.00 ", "-", blanks → 0. */
export function parsePayrollMoney(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : 0;
  const s = String(v)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/^-+$/, "")
    .replace(/^—$/, "")
    .trim();
  if (!s || s === "-" || s === "—") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : 0;
}

function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function inferPaymentMethod(amounts: {
  wps: number;
  cash: number;
  bankTransfer: number;
  cheque: number;
}): PayrollImportPaymentMethod {
  const { wps, cash, bankTransfer, cheque } = amounts;
  const positive = [
    { m: "wps" as const, v: wps },
    { m: "cash" as const, v: cash },
    { m: "bank_transfer" as const, v: bankTransfer },
    { m: "cheque" as const, v: cheque },
  ].filter((x) => x.v > 0);
  if (positive.length === 1) return positive[0]!.m;
  if (wps > 0) return "wps";
  if (cheque > 0) return "cheque";
  if (bankTransfer > 0) return "bank_transfer";
  if (cash > 0) return "cash";
  return "wps";
}

/**
 * Excel-style net from workbook columns (historical import truth).
 * Net ≈ earnedGross + bonus + otReg + otPh + extra − advance − deduction
 */
export function computeExcelStyleNet(input: {
  earnedGross: number;
  bonus?: number;
  otPayReg?: number;
  otPayPh?: number;
  extraPay?: number;
  advancePay?: number;
  deduction?: number;
}): number {
  const earned = Number(input.earnedGross) || 0;
  const add =
    (Number(input.bonus) || 0) +
    (Number(input.otPayReg) || 0) +
    (Number(input.otPayPh) || 0) +
    (Number(input.extraPay) || 0);
  const ded = (Number(input.advancePay) || 0) + (Number(input.deduction) || 0);
  return round2(Math.max(0, earned + add - ded));
}

/** Project staff: days × per-day + extra − deduction. */
export function computeProjectStaffNet(input: {
  perDayRate: number;
  workingDays: number;
  extraPay?: number;
  deduction?: number;
}): number {
  const gross = round2((Number(input.perDayRate) || 0) * (Number(input.workingDays) || 0));
  return round2(Math.max(0, gross + (Number(input.extraPay) || 0) - (Number(input.deduction) || 0)));
}

function mapMonthlyRow(sheet: string, r: unknown[]): ParsedPayrollImportRow | null {
  const name = cellStr(r[2]);
  if (!name) return null;
  const wps = parsePayrollMoney(r[20]);
  const cash = parsePayrollMoney(r[21]);
  const bankTransfer = parsePayrollMoney(r[22]);
  const cheque = parsePayrollMoney(r[23]);
  const earnedGross = parsePayrollMoney(r[10]);
  const bonus = parsePayrollMoney(r[11]);
  const otPayReg = parsePayrollMoney(r[13]);
  const otPayPh = parsePayrollMoney(r[15]);
  const extraPay = parsePayrollMoney(r[16]);
  const advancePay = parsePayrollMoney(r[17]);
  const deduction = parsePayrollMoney(r[18]);
  const netPayable = parsePayrollMoney(r[19]);
  return {
    sheet,
    category: "monthly",
    srNo: parsePayrollMoney(r[0]) || null,
    employeeCode: cellStr(r[1]),
    employeeName: name,
    position: cellStr(r[3]),
    workplace: cellStr(r[4]),
    basicSalary: parsePayrollMoney(r[5]),
    allowances: parsePayrollMoney(r[6]),
    grossSalary: parsePayrollMoney(r[7]),
    workingDays: parsePayrollMoney(r[8]),
    workingHours: parsePayrollMoney(r[9]),
    earnedGross,
    bonus,
    otHoursReg: parsePayrollMoney(r[12]),
    otPayReg,
    otHoursPh: parsePayrollMoney(r[14]),
    otPayPh,
    extraPay,
    advancePay,
    deduction,
    netPayable,
    wps,
    cash,
    bankTransfer,
    cheque,
    paymentMethod: inferPaymentMethod({ wps, cash, bankTransfer, cheque }),
    notes: cellStr(r[24]),
  };
}

function mapProjectRow(sheet: string, r: unknown[]): ParsedPayrollImportRow | null {
  const name = cellStr(r[1]);
  if (!name) return null;
  const wps = parsePayrollMoney(r[12]);
  const cash = parsePayrollMoney(r[13]);
  const bankTransfer = parsePayrollMoney(r[14]);
  const cheque = parsePayrollMoney(r[15]);
  const perDayRate = parsePayrollMoney(r[4]);
  const workingDays = parsePayrollMoney(r[6]);
  const deduction = parsePayrollMoney(r[9]);
  const extraPay = parsePayrollMoney(r[10]);
  const earnedGross = parsePayrollMoney(r[8]) || round2(perDayRate * workingDays);
  return {
    sheet,
    category: "project_staff",
    srNo: parsePayrollMoney(r[0]) || null,
    employeeCode: null,
    employeeName: name,
    position: cellStr(r[2]),
    workplace: cellStr(r[3]),
    basicSalary: 0,
    allowances: 0,
    grossSalary: parsePayrollMoney(r[5]),
    workingDays,
    workingHours: parsePayrollMoney(r[7]),
    earnedGross,
    bonus: 0,
    otHoursReg: 0,
    otPayReg: 0,
    otHoursPh: 0,
    otPayPh: 0,
    extraPay,
    advancePay: 0,
    deduction,
    netPayable: parsePayrollMoney(r[11]),
    wps,
    cash,
    bankTransfer,
    cheque,
    paymentMethod: inferPaymentMethod({ wps, cash, bankTransfer, cheque }),
    notes: cellStr(r[16]),
    perDayRate,
  };
}

function findSheet(names: string[], ...needles: string[]): string | null {
  for (const n of names) {
    const lower = n.toLowerCase();
    if (needles.every((nd) => lower.includes(nd.toLowerCase()))) return n;
  }
  return null;
}

function monthFromPeriodName(name: string): string {
  const m = name.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (!m) return "2026-08";
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  return `${m[2]}-${months[m[1]!.toLowerCase()] ?? "08"}`;
}

/**
 * Parse AOA sheets from a workbook (caller loads XLSX).
 * Targets August 2026 layout; also works for similarly structured months.
 */
export function parsePayrollWorkbookSheets(input: {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
  preferredMonthSheet?: string;
}): ParsedPayrollWorkbook {
  const names = input.sheetNames;
  const mainName =
    input.preferredMonthSheet ??
    findSheet(names, "august", "2026") ??
    names.find((n) => /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(n.trim())) ??
    names[0] ??
    "Payroll";
  const projectName = findSheet(names, "project", "staff") ?? findSheet(names, "project");
  const wpsName = names.find((n) => n.trim().toLowerCase() === "wps") ?? findSheet(names, "wps");
  const eidName = findSheet(names, "eid") ?? findSheet(names, "pending", "holiday");

  const mainAoA = input.sheets[mainName] ?? [];
  const main: ParsedPayrollImportRow[] = [];
  for (let i = 1; i < mainAoA.length; i++) {
    const row = mapMonthlyRow(mainName, mainAoA[i] ?? []);
    if (row) main.push(row);
  }

  const projectStaff: ParsedPayrollImportRow[] = [];
  if (projectName) {
    const aoa = input.sheets[projectName] ?? [];
    // Header may sit a few rows down
    let headerIdx = 0;
    for (let i = 0; i < Math.min(12, aoa.length); i++) {
      const c0 = cellStr(aoa[i]?.[0]);
      if (c0 && /sr\s*no/i.test(c0)) {
        headerIdx = i;
        break;
      }
    }
    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = mapProjectRow(projectName, aoa[i] ?? []);
      if (row) projectStaff.push(row);
    }
  }

  const wpsRegister: ParsedWpsRegisterRow[] = [];
  if (wpsName) {
    const aoa = input.sheets[wpsName] ?? [];
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] ?? [];
      const employeeName = cellStr(r[3]);
      if (!employeeName) continue;
      const qidRaw = cellStr(r[2]);
      wpsRegister.push({
        qid: qidRaw ? qidRaw.replace(/\D/g, "") || qidRaw : null,
        employeeName,
        nationality: cellStr(r[4]),
        gender: cellStr(r[5]),
        rpExpDate:
          r[6] instanceof Date
            ? r[6].toISOString().slice(0, 10)
            : cellStr(r[6]),
        remarks: cellStr(r[7]),
        wpsAmount: parsePayrollMoney(r[10]),
        wpsRemarks: cellStr(r[11]),
      });
    }
  }

  const pendingEidOt: ParsedEidOtRow[] = [];
  if (eidName) {
    const aoa = input.sheets[eidName] ?? [];
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] ?? [];
      const employeeName = cellStr(r[0]);
      if (!employeeName || /total/i.test(employeeName)) continue;
      pendingEidOt.push({
        employeeName,
        position: cellStr(r[1]),
        location: cellStr(r[2]),
        pendingOffsetDays: parsePayrollMoney(r[3]),
        remarks: cellStr(r[4]),
        grossSalary: parsePayrollMoney(r[5]),
        perDay: parsePayrollMoney(r[6]),
        total: parsePayrollMoney(r[7]),
      });
    }
  }

  // Attach QID from WPS register by normalized name when available
  const qidByName = new Map<string, string>();
  for (const w of wpsRegister) {
    if (w.qid) qidByName.set(normalizePayrollName(w.employeeName), w.qid);
  }
  for (const row of [...main, ...projectStaff]) {
    const q = qidByName.get(normalizePayrollName(row.employeeName));
    if (q) row.qid = q;
  }

  return {
    periodName: mainName,
    month: monthFromPeriodName(mainName),
    sheets: names,
    main,
    projectStaff,
    wpsRegister,
    pendingEidOt,
  };
}

export function normalizePayrollName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build snapshot JSON stored on payroll lines (history-safe). */
export function buildPayrollSnapshot(row: ParsedPayrollImportRow): Record<string, unknown> {
  return {
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    position: row.position,
    workplace: row.workplace,
    basicSalary: row.basicSalary,
    allowances: row.allowances,
    grossSalary: row.grossSalary,
    workingDays: row.workingDays,
    workingHours: row.workingHours,
    earnedGross: row.earnedGross,
    bonus: row.bonus,
    otHoursReg: row.otHoursReg,
    otPayReg: row.otPayReg,
    otHoursPh: row.otHoursPh,
    otPayPh: row.otPayPh,
    extraPay: row.extraPay,
    advancePay: row.advancePay,
    deduction: row.deduction,
    netPayable: row.netPayable,
    wps: row.wps,
    cash: row.cash,
    bankTransfer: row.bankTransfer,
    cheque: row.cheque,
    paymentMethod: row.paymentMethod,
    perDayRate: row.perDayRate ?? null,
    notes: row.notes,
    category: row.category,
    qid: row.qid ?? null,
  };
}

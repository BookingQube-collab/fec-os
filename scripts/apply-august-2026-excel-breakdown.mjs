/**
 * Copy the August 2026 workbook breakdown onto matched payroll lines.
 * Working days, hours, earned gross, OT, extra, advance, deduction, net,
 * and WPS/Cash/Bank/Cheque come from the workbook cells — not attendance proration.
 *
 * Does not change a payroll line whose person is not in the workbook.
 * Does not create staff. Idempotent.
 *
 *   node --env-file=.env.local scripts/apply-august-2026-excel-breakdown.mjs
 *   node --env-file=.env.local scripts/apply-august-2026-excel-breakdown.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const APPLY = process.argv.includes("--apply");
const AUGUST_XLSX = process.env.AUGUST_PAYROLL_XLSX || "A:/August 2026.xlsx";
const PERIOD_MONTH = "2026-08";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function cellStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
/** Blank stays null. "-" is zero. Numbers are rounded to cents. */
function cellMoney(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : null;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (s === "-" || s === "—") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}
function normName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(name) {
  return normName(name).split(" ").filter(Boolean);
}
function isJunkName(name) {
  const n = normName(name);
  return (
    !n ||
    n === "signature" ||
    n === "ceo" ||
    n === "general manager" ||
    n === "finance admin manager" ||
    n === "total" ||
    n.startsWith("total ")
  );
}
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
function fuzzy(a, b) {
  const left = normName(a);
  const right = normName(b);
  if (!left || !right || left === right) return false;
  const aTokens = left.split(" ").filter(Boolean);
  const bTokens = right.split(" ").filter(Boolean);
  if (!aTokens.length || !bTokens.length || aTokens[0] !== bTokens[0]) return false;
  if (
    aTokens[aTokens.length - 1] === bTokens[bTokens.length - 1] &&
    aTokens.length > 1 &&
    bTokens.length > 1
  ) {
    return true;
  }
  return left.startsWith(right) || right.startsWith(left);
}
function pickUnique(candidates, lineByStaff) {
  if (candidates.length === 1) return { staff: candidates[0], narrowed: "single" };
  const onLine = candidates.filter((s) => lineByStaff.has(s.id));
  if (onLine.length === 1) return { staff: onLine[0], narrowed: "payroll_line" };
  const active = (onLine.length > 1 ? onLine : candidates).filter((s) =>
    ["active", "on_leave", "serving_notice"].includes(s.status),
  );
  if (active.length === 1) return { staff: active[0], narrowed: "active" };
  return { staff: null, narrowed: "ambiguous", candidates };
}
function matchRow(row, staff, lineByStaff) {
  const exact = staff.filter((s) => normName(s.full_name) === normName(row.employeeName));
  if (exact.length) {
    const picked = pickUnique(exact, lineByStaff);
    if (picked.staff) return { ...picked, rule: picked.narrowed === "single" ? "name_exact" : `name_exact_${picked.narrowed}` };
    return { staff: null, rule: "ambiguous_name", candidates: exact };
  }
  const fz = staff.filter((s) => fuzzy(row.employeeName, s.full_name));
  if (fz.length) {
    const picked = pickUnique(fz, lineByStaff);
    if (picked.staff) return { ...picked, rule: "name_fuzzy" };
    return { staff: null, rule: "ambiguous_fuzzy", candidates: fz };
  }
  const a = tokens(row.employeeName);
  const edited =
    a.length >= 2
      ? staff.filter((s) => {
          const b = tokens(s.full_name);
          if (b.length !== a.length) return false;
          let edits = 0;
          for (let i = 0; i < a.length; i++) {
            const d = editDistance(a[i], b[i]);
            if (d === 0) continue;
            if (d > 1) return false;
            edits += 1;
            if (edits > 1) return false;
          }
          return edits === 1;
        })
      : [];
  if (edited.length) {
    const picked = pickUnique(edited, lineByStaff);
    if (picked.staff) return { ...picked, rule: "name_spelling" };
    return { staff: null, rule: "ambiguous_spelling", candidates: edited };
  }
  const subset =
    a.length >= 2
      ? staff.filter((s) => {
          const b = tokens(s.full_name);
          if (b.length < 2 || a.length === b.length) return false;
          if (Math.abs(a.length - b.length) > 3) return false;
          const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
          const used = new Set();
          let edits = 0;
          for (const tok of shorter) {
            let found = -1;
            for (let i = 0; i < longer.length; i++) {
              if (used.has(i)) continue;
              const d = editDistance(tok, longer[i]);
              if (d === 0 || (d === 1 && edits === 0)) {
                found = i;
                if (d === 1) edits += 1;
                break;
              }
            }
            if (found < 0) return false;
            used.add(found);
          }
          return true;
        })
      : [];
  if (subset.length) {
    const picked = pickUnique(subset, lineByStaff);
    if (picked.staff) return { ...picked, rule: "name_tokens" };
    return { staff: null, rule: "ambiguous_tokens", candidates: subset };
  }
  const qid = (row.qid ?? "").replace(/\D/g, "");
  if (qid) {
    const hits = staff.filter((s) => (s.qid ?? "").replace(/\D/g, "") === qid);
    const compatible = hits.filter(
      (s) =>
        normName(s.full_name) === normName(row.employeeName) ||
        fuzzy(row.employeeName, s.full_name) ||
        tokens(row.employeeName)[0] === tokens(s.full_name)[0],
    );
    if (compatible.length === 1) return { staff: compatible[0], rule: "qid" };
    if (
      hits.length === 1 &&
      tokens(row.employeeName)[0] &&
      tokens(hits[0].full_name)[0] === tokens(row.employeeName)[0]
    ) {
      return { staff: hits[0], rule: "qid" };
    }
  }
  return { staff: null, rule: "unmatched", candidates: [] };
}

function paymentMethodOf(row, fallback) {
  const buckets = [
    ["wps", row.wps],
    ["cash", row.cash],
    ["bank_transfer", row.bankTransfer],
    ["cheque", row.cheque],
  ].filter(([, v]) => v != null && Number(v) > 0);
  if (buckets.length === 1) return buckets[0][0];
  if (buckets.length > 1) {
    buckets.sort((a, b) => Number(b[1]) - Number(a[1]));
    return buckets[0][0];
  }
  const fb = String(fallback || "wps");
  return ["wps", "cash", "bank_transfer", "cheque"].includes(fb) ? fb : "wps";
}

function formulaNet(row) {
  if (row.category === "project_staff") {
    const earned =
      row.earnedGross != null
        ? row.earnedGross
        : round2((Number(row.perDayRate) || 0) * (Number(row.workingDays) || 0));
    return round2(Math.max(0, earned + (Number(row.extraPay) || 0) - (Number(row.deduction) || 0)));
  }
  const earned = Number(row.earnedGross) || 0;
  const add =
    (Number(row.bonus) || 0) +
    (Number(row.otPayReg) || 0) +
    (Number(row.otPayPh) || 0) +
    (Number(row.extraPay) || 0);
  const ded = (Number(row.advancePay) || 0) + (Number(row.deduction) || 0);
  return round2(Math.max(0, earned + add - ded));
}

function parseAugust(path) {
  const wb = XLSX.readFile(path, { cellDates: false });
  const aoa = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  const main = [];
  for (const r of aoa("August 2026").slice(1)) {
    const employeeName = cellStr(r[2]);
    if (!employeeName || isJunkName(employeeName)) continue;
    const netCell = cellMoney(r[19]);
    const row = {
      category: "monthly",
      sheet: "August 2026",
      srNo: cellMoney(r[0]),
      employeeCode: cellStr(r[1]),
      employeeName,
      position: cellStr(r[3]),
      workplace: cellStr(r[4]),
      basicSalary: cellMoney(r[5]),
      allowances: cellMoney(r[6]),
      grossSalary: cellMoney(r[7]),
      workingDays: cellMoney(r[8]),
      workingHours: cellMoney(r[9]),
      earnedGross: cellMoney(r[10]),
      bonus: cellMoney(r[11]),
      otHoursReg: cellMoney(r[12]),
      otPayReg: cellMoney(r[13]),
      otHoursPh: cellMoney(r[14]),
      otPayPh: cellMoney(r[15]),
      extraPay: cellMoney(r[16]),
      advancePay: cellMoney(r[17]),
      deduction: cellMoney(r[18]),
      netPayable: netCell,
      wps: cellMoney(r[20]),
      cash: cellMoney(r[21]),
      bankTransfer: cellMoney(r[22]),
      cheque: cellMoney(r[23]),
      notes: cellStr(r[24]),
      perDayRate: null,
      qid: null,
    };
    if (row.netPayable == null) row.netPayable = formulaNet(row);
    main.push(row);
  }
  const project = [];
  const prows = aoa("Project Staff August 2026");
  let headerIdx = 0;
  for (let i = 0; i < Math.min(12, prows.length); i++) {
    if (cellStr(prows[i]?.[0]) && /sr\s*no/i.test(cellStr(prows[i][0]))) headerIdx = i;
  }
  for (const r of prows.slice(headerIdx + 1)) {
    const employeeName = cellStr(r[1]);
    if (!employeeName || isJunkName(employeeName)) continue;
    const perDayRate = cellMoney(r[4]);
    const workingDays = cellMoney(r[6]);
    const earnedCell = cellMoney(r[8]);
    const row = {
      category: "project_staff",
      sheet: "Project Staff August 2026",
      srNo: cellMoney(r[0]),
      employeeCode: null,
      employeeName,
      position: cellStr(r[2]),
      workplace: cellStr(r[3]),
      basicSalary: null,
      allowances: null,
      grossSalary: cellMoney(r[5]),
      workingDays,
      workingHours: cellMoney(r[7]),
      earnedGross:
        earnedCell != null
          ? earnedCell
          : round2((Number(perDayRate) || 0) * (Number(workingDays) || 0)),
      bonus: null,
      otHoursReg: null,
      otPayReg: null,
      otHoursPh: null,
      otPayPh: null,
      extraPay: cellMoney(r[10]),
      advancePay: null,
      deduction: cellMoney(r[9]),
      netPayable: cellMoney(r[11]),
      wps: cellMoney(r[12]),
      cash: cellMoney(r[13]),
      bankTransfer: cellMoney(r[14]),
      cheque: cellMoney(r[15]),
      notes: cellStr(r[16]),
      perDayRate,
      qid: null,
    };
    if (row.netPayable == null) row.netPayable = formulaNet(row);
    project.push(row);
  }
  const qidByName = new Map();
  for (const r of aoa("WPS").slice(1)) {
    const employeeName = cellStr(r[3]);
    const qid = cellStr(r[2])?.replace(/\D/g, "") || null;
    if (employeeName && qid) qidByName.set(normName(employeeName), qid);
  }
  return { rows: [...main, ...project], qidByName, sheetNames: wb.SheetNames };
}

function snapshotOf(row, line) {
  const prev = line?.snapshot ?? {};
  const previousNetQar = prev.excelBreakdown === true ? (prev.previousNetQar ?? null) : line ? Number(line.net_qar) || 0 : null;
  const previousWorkingDays =
    prev.excelBreakdown === true ? (prev.previousWorkingDays ?? null) : line ? line.working_days : null;
  return {
    excelBreakdown: true,
    excelSheet: row.sheet,
    category: row.category,
    srNo: row.srNo,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    position: row.position,
    workplace: row.workplace,
    basicSalary: row.basicSalary,
    allowances: row.allowances,
    grossSalary: row.grossSalary,
    contractBasicQar: row.category === "project_staff" ? null : row.basicSalary,
    contractAllowancesQar: row.category === "project_staff" ? null : row.allowances,
    contractGrossQar: row.grossSalary,
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
    perDayRate: row.perDayRate,
    notes: row.notes,
    qid: row.qid,
    paymentMethod: paymentMethodOf(row, line?.payment_method),
    missingCompensation: false,
    previousNetQar,
    previousWorkingDays,
  };
}

function earningsOf(row) {
  const items = [];
  if (row.earnedGross) {
    items.push({
      code: "basic",
      label: row.category === "project_staff" ? "Project earned gross" : "Gross Salary (month)",
      amountQar: row.earnedGross,
    });
  }
  if (row.bonus) items.push({ code: "bonus", label: "Bonus", amountQar: row.bonus });
  if (row.otPayReg) items.push({ code: "ot", label: "OT Pay (REG)", amountQar: row.otPayReg, meta: { hours: row.otHoursReg } });
  if (row.otPayPh) items.push({ code: "ot_ph", label: "OT Pay (PUB.HOL)", amountQar: row.otPayPh, meta: { hours: row.otHoursPh } });
  if (row.extraPay) items.push({ code: "extra", label: "Extra Pay", amountQar: row.extraPay });
  return items;
}
function deductionsOf(row) {
  const items = [];
  if (row.advancePay) items.push({ code: "loan_advance", label: "Advance Pay", amountQar: row.advancePay });
  if (row.deduction) items.push({ code: "other", label: "Deduction", amountQar: row.deduction });
  return items;
}

function linePayload(row, line) {
  const snap = snapshotOf(row, line);
  const method = snap.paymentMethod;
  const net = round2(Math.max(0, Number(row.netPayable) || 0));
  const gross = round2(Math.max(0, Number(row.earnedGross) || 0));
  return {
    payment_method: method,
    earnings: earningsOf(row),
    deductions: deductionsOf(row),
    gross_qar: gross,
    net_qar: net,
    wps_eligible: method === "wps",
    proration_factor: 1,
    notes: row.notes,
    employment_category: row.category === "project_staff" ? "project_staff" : line?.employment_category ?? null,
    position_snapshot: row.position,
    workplace_snapshot: row.workplace,
    working_days: row.workingDays,
    working_hours: row.workingHours,
    snapshot: snap,
    imported_amounts: snap,
    imported_net_qar: net,
    system_net_qar: net,
    variance_import_qar: 0,
    review_status: "matched",
    line_source: row.category === "project_staff" ? "project_staff" : "excel_import",
  };
}

function sameValue(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") return round2(Number(a)) === round2(Number(b));
  return a === b;
}

function samePayload(line, payload) {
  if (!line) return false;
  const keys = [
    "payment_method",
    "gross_qar",
    "net_qar",
    "notes",
    "working_days",
    "working_hours",
    "line_source",
    "review_status",
    "imported_net_qar",
  ];
  for (const k of keys) {
    if (!sameValue(line[k] ?? null, payload[k] ?? null)) return false;
  }
  const snap = line.snapshot ?? {};
  const next = payload.snapshot;
  const snapKeys = [
    "excelBreakdown",
    "category",
    "srNo",
    "employeeCode",
    "employeeName",
    "basicSalary",
    "allowances",
    "grossSalary",
    "workingDays",
    "workingHours",
    "earnedGross",
    "bonus",
    "otHoursReg",
    "otPayReg",
    "otHoursPh",
    "otPayPh",
    "extraPay",
    "advancePay",
    "deduction",
    "netPayable",
    "wps",
    "cash",
    "bankTransfer",
    "cheque",
    "perDayRate",
    "notes",
  ];
  for (const k of snapKeys) {
    if (!sameValue(snap[k] ?? null, next[k] ?? null)) return false;
  }
  return true;
}

async function pageAll(table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const august = parseAugust(AUGUST_XLSX);
const staff = (await pageAll("staff", "id, full_name, employee_code, qid, status, deleted_at")).filter((s) => !s.deleted_at);
const periods = await pageAll("hr_payroll_periods", "id, month, status");
const period = periods.find((p) => String(p.month) === PERIOD_MONTH);
if (!period) throw new Error(`No payroll period ${PERIOD_MONTH}`);
const lines = await pageAll(
  "hr_payroll_lines",
  "id, staff_id, net_qar, gross_qar, working_days, working_hours, notes, snapshot, payment_method, earnings, deductions, position_snapshot, workplace_snapshot, employment_category, line_source, review_status, imported_net_qar",
  (q) => q.eq("period_id", period.id),
);
const lineByStaff = new Map(lines.map((l) => [l.staff_id, l]));
for (const row of august.rows) {
  row.qid = august.qidByName.get(normName(row.employeeName)) || null;
}

const used = new Set();
const plans = [];
const unmatched = [];
for (const row of august.rows) {
  const match = matchRow(row, staff, lineByStaff);
  if (!match.staff) {
    unmatched.push({
      excel: row.employeeName,
      sheet: row.sheet,
      rule: match.rule,
      net: row.netPayable,
      candidates: (match.candidates ?? []).slice(0, 5).map((s) => `${s.full_name} [${s.employee_code}]`),
    });
    continue;
  }
  if (used.has(match.staff.id)) {
    unmatched.push({
      excel: row.employeeName,
      sheet: row.sheet,
      rule: "duplicate_staff",
      staff: match.staff.full_name,
      net: row.netPayable,
    });
    continue;
  }
  used.add(match.staff.id);
  const line = lineByStaff.get(match.staff.id) ?? null;
  const payload = linePayload(row, line);
  plans.push({
    row,
    staff: match.staff,
    rule: match.rule,
    line,
    payload,
    unchanged: samePayload(line, payload),
    action: line ? (samePayload(line, payload) ? "unchanged" : "update") : "insert",
  });
}

const focusNeedles = ["flora chepchumba", "philis", "phillis", "wasanthi", "hannah wakio", "wahaj"];
function sample(p) {
  return {
    excel: p.row.employeeName,
    staff: p.staff.full_name,
    code: p.staff.employee_code,
    rule: p.rule,
    sheet: p.row.sheet,
    action: p.action,
    before: p.line
      ? {
          net: Number(p.line.net_qar) || 0,
          gross: Number(p.line.gross_qar) || 0,
          days: p.line.working_days,
          hours: p.line.working_hours,
          earned: p.line.snapshot?.earnedGross ?? null,
          otPayReg: p.line.snapshot?.otPayReg ?? null,
          extra: p.line.snapshot?.extraPay ?? null,
          deduction: p.line.snapshot?.deduction ?? null,
          cheque: p.line.snapshot?.cheque ?? null,
          notes: p.line.notes,
        }
      : null,
    after: {
      net: p.payload.net_qar,
      earned: p.payload.snapshot.earnedGross,
      days: p.payload.snapshot.workingDays,
      hours: p.payload.snapshot.workingHours,
      otHoursReg: p.payload.snapshot.otHoursReg,
      otPayReg: p.payload.snapshot.otPayReg,
      extra: p.payload.snapshot.extraPay,
      advance: p.payload.snapshot.advancePay,
      deduction: p.payload.snapshot.deduction,
      wps: p.payload.snapshot.wps,
      cash: p.payload.snapshot.cash,
      bank: p.payload.snapshot.bankTransfer,
      cheque: p.payload.snapshot.cheque,
      notes: p.payload.notes,
    },
  };
}

const touchedStaff = new Set(plans.map((p) => p.staff.id));
const leftUntouched = lines.filter((l) => !touchedStaff.has(l.staff_id)).length;
const multiBucket = plans.filter((p) => {
  const s = p.row;
  return [s.wps, s.cash, s.bankTransfer, s.cheque].filter((v) => v != null && Number(v) > 0).length > 1;
});

console.log(
  JSON.stringify(
    {
      mode: APPLY ? "apply" : "dry-run",
      period: { month: period.month, status: period.status, id: period.id },
      sheets: august.sheetNames,
      excelRows: august.rows.length,
      monthlyRows: august.rows.filter((r) => r.category === "monthly").length,
      projectRows: august.rows.filter((r) => r.category === "project_staff").length,
      updates: plans.filter((p) => p.action === "update").length,
      inserts: plans.filter((p) => p.action === "insert").map((p) => ({
        excel: p.row.employeeName,
        staff: p.staff.full_name,
        code: p.staff.employee_code,
        rule: p.rule,
        sheet: p.row.sheet,
        net: p.payload.net_qar,
      })),
      unchanged: plans.filter((p) => p.action === "unchanged").length,
      unmatched,
      linesLeftUntouched: leftUntouched,
      multiPaymentBuckets: multiBucket.map((p) => p.row.employeeName),
      focus: plans
        .filter((p) =>
          focusNeedles.some(
            (n) => normName(p.row.employeeName).includes(n) || normName(p.staff.full_name).includes(n),
          ),
        )
        .map(sample),
    },
    null,
    2,
  ),
);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write August payroll line snapshots.");
  process.exit(0);
}

let updated = 0;
let inserted = 0;
const errors = [];
for (const p of plans) {
  if (p.action === "unchanged") continue;
  if (p.action === "update") {
    const { error } = await admin.from("hr_payroll_lines").update(p.payload).eq("id", p.line.id);
    if (error) errors.push({ staff: p.staff.full_name, step: "update", message: error.message });
    else updated += 1;
    continue;
  }
  const { error } = await admin.from("hr_payroll_lines").insert({ ...p.payload, period_id: period.id, staff_id: p.staff.id });
  if (error) errors.push({ staff: p.staff.full_name, step: "insert", message: error.message });
  else inserted += 1;
}

console.log(JSON.stringify({ applied: true, updated, inserted, unchanged: plans.filter((p) => p.action === "unchanged").length, errors }, null, 2));
if (errors.length) process.exit(1);

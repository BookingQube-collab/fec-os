/**
 * Fill missing staff salaries from the August 2026 payroll workbook, then
 * recalculate August 2026 payroll lines with the same day-rate formula as
 * generatePayrollLines (attendance worked days already stored on the line).
 *
 * Does not overwrite a salary that is already set. Does not match on the
 * workbook's numeric code when that code belongs to a different person.
 *
 *   node --env-file=.env.local scripts/apply-august-2026-salaries.mjs
 *   node --env-file=.env.local scripts/apply-august-2026-salaries.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const APPLY = process.argv.includes("--apply");
const AUGUST_XLSX = process.env.AUGUST_PAYROLL_XLSX || "A:/August 2026.xlsx";
const MASTER_XLSX = process.env.E3_MASTERFILE_XLSX || "A:/E3_Employee Masterfile 2026.xlsx";
const PERIOD_MONTH = "2026-08";
const PERIOD_EFFECTIVE = "2026-07-28";

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
function money(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : 0;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!s || s === "-" || s === "—") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : 0;
}
function cellStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
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
function daysBetweenInclusive(from, to) {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

function parseAugust(path) {
  const wb = XLSX.readFile(path, { cellDates: false });
  const aoa = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  const main = [];
  for (const r of aoa("August 2026").slice(1)) {
    const name = cellStr(r[2]);
    if (!name || isJunkName(name)) continue;
    main.push({
      category: "monthly",
      employeeName: name,
      position: cellStr(r[3]),
      workplace: cellStr(r[4]),
      basicSalary: money(r[5]),
      allowances: money(r[6]),
      grossSalary: money(r[7]),
      workingDays: money(r[8]),
      workingHours: money(r[9]),
      perDayRate: 0,
    });
  }
  const project = [];
  const prows = aoa("Project Staff August 2026");
  let headerIdx = 0;
  for (let i = 0; i < Math.min(12, prows.length); i++) {
    if (cellStr(prows[i]?.[0]) && /sr\s*no/i.test(cellStr(prows[i][0]))) headerIdx = i;
  }
  for (const r of prows.slice(headerIdx + 1)) {
    const name = cellStr(r[1]);
    if (!name || isJunkName(name)) continue;
    project.push({
      category: "project_staff",
      employeeName: name,
      position: cellStr(r[2]),
      workplace: cellStr(r[3]),
      basicSalary: 0,
      allowances: 0,
      grossSalary: money(r[5]),
      workingDays: money(r[6]),
      workingHours: money(r[7]),
      perDayRate: money(r[4]),
    });
  }
  const qidByName = new Map();
  for (const r of aoa("WPS").slice(1)) {
    const employeeName = cellStr(r[3]);
    const qid = cellStr(r[2])?.replace(/\D/g, "") || null;
    if (employeeName && qid) qidByName.set(normName(employeeName), qid);
  }
  return { rows: [...main, ...project], qidByName };
}

function parseMasterQid(path) {
  const wb = XLSX.readFile(path, { cellDates: false });
  const qidByName = new Map();
  const sheets = [
    ["E3 -Active Employee", 1, 2, 6],
    ["Secondment_contract", 3, 2, 7],
    ["Resigned-Terminated", 2, 2, 6],
    ["Remote staff", 0, 2, 6],
  ];
  for (const [sheet, header, nameCol, qidCol] of sheets) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, raw: true });
    for (const r of aoa.slice(header + 1)) {
      const name = cellStr(r[nameCol]);
      const qid = cellStr(r[qidCol])?.replace(/\D/g, "") || null;
      if (!name || !qid) continue;
      const key = normName(name);
      const prev = qidByName.get(key);
      if (prev && prev !== qid) qidByName.set(key, null);
      else if (!prev) qidByName.set(key, qid);
    }
  }
  return qidByName;
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

function excelHasPay(row) {
  return row.category === "project_staff"
    ? positive(row.perDayRate) > 0
    : positive(row.basicSalary) > 0 || positive(row.grossSalary) > 0;
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
      (s) => normName(s.full_name) === normName(row.employeeName) || fuzzy(row.employeeName, s.full_name) || tokens(row.employeeName)[0] === tokens(s.full_name)[0],
    );
    if (compatible.length === 1) return { staff: compatible[0], rule: "qid" };
    if (hits.length === 1 && tokens(row.employeeName)[0] && tokens(hits[0].full_name)[0] === tokens(row.employeeName)[0]) {
      return { staff: hits[0], rule: "qid" };
    }
  }
  return { staff: null, rule: "unmatched", candidates: [] };
}

function lineIsMissing(line) {
  if (!line) return false;
  const snap = line.snapshot ?? {};
  const configured =
    positive(snap.contractBasicQar) > 0 ||
    positive(snap.basicSalary) > 0 ||
    positive(snap.dayRateQar) > 0 ||
    positive(snap.perDayRate) > 0;
  const missingComp = snap.missingCompensation === true;
  return !configured && (missingComp || positive(line.net_qar) <= 0);
}

function sumCode(rows, code) {
  return round2((rows ?? []).filter((e) => e && e.code === code).reduce((s, e) => s + (Number(e.amountQar) || 0), 0));
}

const august = parseAugust(AUGUST_XLSX);
const masterQid = parseMasterQid(MASTER_XLSX);
for (const row of august.rows) {
  row.qid = august.qidByName.get(normName(row.employeeName)) || masterQid.get(normName(row.employeeName)) || null;
}

const staff = (await pageAll("staff", "id, full_name, employee_code, qid, status, employment_type, deleted_at")).filter(
  (s) => !s.deleted_at,
);
const comps = await pageAll("staff_compensation", "staff_id, monthly_salary_qar, daily_rate_qar");
const hist = await pageAll(
  "staff_salary_history",
  "staff_id, basic_qar, monthly_total_qar, daily_rate_qar, allowances, effective_on, reason, created_at",
);
const periods = await pageAll("hr_payroll_periods", "id, month, status, date_from, date_to");
const period = periods.find((p) => String(p.month) === PERIOD_MONTH);
if (!period) throw new Error(`No payroll period ${PERIOD_MONTH}`);
const lines = await pageAll(
  "hr_payroll_lines",
  "id, staff_id, net_qar, gross_qar, working_days, working_hours, notes, snapshot, payment_method, earnings, deductions, position_snapshot, workplace_snapshot",
  (q) => q.eq("period_id", period.id),
);

const compBy = new Map(comps.map((c) => [c.staff_id, c]));
const histBy = new Map();
for (const h of hist) {
  const prev = histBy.get(h.staff_id);
  const newer =
    !prev ||
    String(h.effective_on) > String(prev.effective_on) ||
    (String(h.effective_on) === String(prev.effective_on) && String(h.created_at) > String(prev.created_at ?? ""));
  if (newer) histBy.set(h.staff_id, h);
}
const lineByStaff = new Map(lines.map((l) => [l.staff_id, l]));
const periodDays = daysBetweenInclusive(String(period.date_from).slice(0, 10), String(period.date_to).slice(0, 10));

const used = new Set();
const plans = [];
const unmatched = [];
for (const row of august.rows) {
  if (!excelHasPay(row)) continue;
  const match = matchRow(row, staff, lineByStaff);
  if (!match.staff) {
    unmatched.push({
      name: row.employeeName,
      category: row.category,
      rule: match.rule,
      basic: row.basicSalary,
      gross: row.grossSalary,
      perDay: row.perDayRate,
      candidates: (match.candidates ?? []).map((s) => `${s.full_name} [${s.employee_code}]`),
    });
    continue;
  }
  if (used.has(match.staff.id)) {
    unmatched.push({
      name: row.employeeName,
      category: row.category,
      rule: "duplicate_staff",
      staff: match.staff.full_name,
      basic: row.basicSalary,
      perDay: row.perDayRate,
    });
    continue;
  }
  used.add(match.staff.id);
  const comp = compBy.get(match.staff.id);
  const existingMonthly = positive(comp?.monthly_salary_qar);
  const existingDaily = positive(comp?.daily_rate_qar);
  const line = lineByStaff.get(match.staff.id) ?? null;
  const isJoker = match.staff.employment_type === "joker";
  const basic = positive(row.basicSalary);
  const allow = positive(row.allowances);
  const gross = positive(row.grossSalary) || round2(basic + allow);
  let setMonthly = null;
  let setDaily = null;
  if (row.category === "project_staff") {
    if (!existingDaily && !existingMonthly && positive(row.perDayRate)) setDaily = positive(row.perDayRate);
  } else if (!existingMonthly && gross > 0) {
    setMonthly = gross;
    if (isJoker && !existingDaily) setDaily = round2((basic + allow > 0 ? basic + allow : gross) / 30);
  } else if (isJoker && !existingDaily && (basic + allow > 0 || gross > 0)) {
    setDaily = round2((basic + allow > 0 ? basic + allow : gross) / 30);
  }
  const monthly = setMonthly ?? existingMonthly;
  const daily = setDaily ?? existingDaily;
  const dailyPay = row.category === "project_staff" || isJoker || (daily > 0 && !(monthly > 0));
  const componentSum = round2(basic + allow);
  // When Basic + Allowances is not the Gross column, the workbook pays the Gross figure
  // (Allowances is sometimes the per-day of that gross, e.g. 96.15).
  const grossPackage = !dailyPay && gross > 0 && Math.abs(componentSum - gross) > 1;
  const payBasic = dailyPay ? 0 : grossPackage ? gross : basic || monthly;
  const payAllow = dailyPay || grossPackage ? 0 : allow;
  const contractBasic = payBasic;
  const contractAllow = payAllow;
  const contractGross = dailyPay ? positive(row.grossSalary) || round2(daily * 30) : gross;
  const workedDays = Number(line?.working_days) || 0;
  const rateBasic = dailyPay ? daily : contractBasic;
  const basicForLine = dailyPay ? round2(daily * workedDays) : round2((rateBasic / periodDays) * workedDays);
  const allowancesForLine = dailyPay || !(rateBasic > 0) ? 0 : round2(contractAllow * (basicForLine / rateBasic));
  const earnings = Array.isArray(line?.earnings) ? line.earnings : [];
  const deductions = Array.isArray(line?.deductions) ? line.deductions : [];
  const otQar = sumCode(earnings, "ot");
  const airQar = sumCode(earnings, "air_ticket");
  const bonusQar = sumCode(earnings, "bonus");
  const otherQar = sumCode(earnings, "other");
  const ded = round2(deductions.reduce((s, d) => s + (Number(d.amountQar) || 0), 0));
  const earnedGross = round2(basicForLine + allowancesForLine);
  const grossQar = round2(earnedGross + otQar + airQar + bonusQar + otherQar);
  const netQar = round2(Math.max(0, grossQar - ded));
  const hasPay = monthly > 0 || daily > 0;
  plans.push({
    row,
    staff: match.staff,
    rule: match.rule,
    line,
    existingMonthly,
    existingDaily,
    setMonthly,
    setDaily,
    monthly,
    daily,
    dailyPay,
    contractBasic,
    contractAllow,
    displayBasic: basic,
    displayAllow: allow,
    grossPackage,
    contractGross,
    workedDays,
    excelDays: row.workingDays,
    earnedGross,
    netQar,
    beforeNet: line ? Number(line.net_qar) || 0 : null,
    missingBefore: lineIsMissing(line),
    willWriteComp: setMonthly != null || setDaily != null,
    willRecalc:
      Boolean(line) &&
      hasPay &&
      (lineIsMissing(line) ||
        (positive(line.snapshot?.grossSalary) > 0 &&
          Math.abs(positive(line.snapshot.grossSalary) - gross) < 0.05 &&
          Math.abs(netQar - (Number(line.net_qar) || 0)) > 0.05) ||
        (dailyPay && basic > 0 && !(positive(line.snapshot?.basicSalary) > 0))),
    otQar,
    airQar,
    bonusQar,
    otherQar,
    ded,
    basicForLine,
    allowancesForLine,
  });
}

const compWrites = plans.filter((p) => p.willWriteComp);
const recals = plans.filter((p) => p.willRecalc);
const stillMissingNoPay = plans.filter((p) => p.missingBefore && !p.willRecalc && !(p.monthly > 0 || p.daily > 0));

function brief(p) {
  return {
    excel: p.row.employeeName,
    staff: p.staff.full_name,
    code: p.staff.employee_code,
    type: p.staff.employment_type,
    rule: p.rule,
    category: p.row.category,
    excelBasic: p.row.basicSalary,
    excelAllow: p.row.allowances,
    excelGross: p.row.grossSalary,
    excelPerDay: p.row.perDayRate,
    excelDays: p.excelDays,
    hadMonthly: p.existingMonthly || null,
    hadDaily: p.existingDaily || null,
    writeMonthly: p.setMonthly,
    writeDaily: p.setDaily,
    systemDays: p.workedDays,
    beforeNet: p.beforeNet,
    afterNet: p.willRecalc ? p.netQar : p.beforeNet,
    recalc: p.willRecalc,
  };
}

const focusNeedles = ["abdalmutalab", "hannah wakio", "flora chepchumba", "lilam"];
console.log(
  JSON.stringify(
    {
      mode: APPLY ? "apply" : "dry-run",
      period: { month: period.month, status: period.status, from: period.date_from, to: period.date_to, periodDays },
      excelPayRows: august.rows.filter(excelHasPay).length,
      matchedPlans: plans.length,
      compensationWrites: compWrites.length,
      lineRecalcs: recals.length,
      monthlyWrites: compWrites.filter((p) => p.setMonthly != null).length,
      dailyWrites: compWrites.filter((p) => p.setDaily != null).length,
      recalcNetPositive: recals.filter((p) => p.netQar > 0).length,
      recalcNetStillZero: recals.filter((p) => p.netQar <= 0).map((p) => ({
        name: p.staff.full_name,
        reason: p.workedDays <= 0 ? "attendance worked days are 0" : "rate produced zero",
        systemDays: p.workedDays,
        excelDays: p.excelDays,
        daily: p.daily || null,
        monthly: p.monthly || null,
      })),
      unmatched,
      stillMissingNoPay: stillMissingNoPay.map((p) => p.staff.full_name),
      focus: plans.filter((p) => focusNeedles.some((n) => normName(p.row.employeeName).includes(n) || normName(p.staff.full_name).includes(n))).map(brief),
      sampleWrites: compWrites.slice(0, 8).map(brief),
    },
    null,
    2,
  ),
);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write compensation, salary history, and August lines.");
  process.exit(0);
}

let compOk = 0;
let histOk = 0;
let lineOk = 0;
const errors = [];

for (const p of compWrites) {
  const patch = { staff_id: p.staff.id, currency: "QAR" };
  if (p.setMonthly != null) patch.monthly_salary_qar = p.setMonthly;
  if (p.setDaily != null) patch.daily_rate_qar = p.setDaily;
  const { error } = await admin.from("staff_compensation").upsert(patch, { onConflict: "staff_id" });
  if (error) {
    errors.push({ staff: p.staff.full_name, step: "compensation", message: error.message });
    continue;
  }
  compOk += 1;
}

const histPlans = plans.filter((p) => {
  if (p.willWriteComp) return true;
  if (p.row.category === "project_staff" || p.dailyPay) return false;
  const prev = histBy.get(p.staff.id);
  if (!prev || !String(prev.reason ?? "").includes("August 2026 payroll workbook")) return false;
  return Math.abs(positive(prev.basic_qar) - p.contractBasic) > 0.05;
});

for (const p of histPlans) {
  const prev = histBy.get(p.staff.id);
  const effective = prev && String(prev.effective_on) >= "2026-09-27" ? "2026-09-28" : prev && String(prev.effective_on) > PERIOD_EFFECTIVE ? "2026-09-27" : PERIOD_EFFECTIVE;
  const { error: hErr } = await admin.from("staff_salary_history").insert({
    staff_id: p.staff.id,
    effective_on: effective,
    basic_qar: p.row.category === "project_staff" ? null : p.contractBasic || null,
    allowances: p.contractAllow > 0 ? { allowance: p.contractAllow } : {},
    monthly_total_qar: p.row.category === "project_staff" ? null : p.contractGross || p.setMonthly,
    daily_rate_qar: p.daily > 0 ? p.daily : null,
    currency: "QAR",
    reason: p.grossPackage
      ? "August 2026 payroll workbook — gross salary is the pay basis"
      : "August 2026 payroll workbook — fill missing salary",
  });
  if (hErr) errors.push({ staff: p.staff.full_name, step: "history", message: hErr.message });
  else histOk += 1;
}

for (const p of recals) {
  const note = String(p.line.notes ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && s !== "missing_compensation")
    .join("; ");
  const pm = String(p.line.payment_method || "wps");
  const snapshot = {
    ...(p.line.snapshot ?? {}),
    employeeName: p.staff.full_name,
    position: p.row.position,
    workplace: p.row.workplace,
    contractBasicQar: p.displayBasic || (p.dailyPay ? null : p.contractBasic),
    contractAllowancesQar: p.displayAllow,
    contractGrossQar: p.contractGross,
    perDayRate: p.dailyPay ? p.daily : null,
    dayRateQar: p.dailyPay ? p.daily : p.contractBasic > 0 ? round2(p.contractBasic / periodDays) : null,
    basicSalary: p.displayBasic || (p.dailyPay ? 0 : p.contractBasic),
    allowances: p.displayAllow,
    grossSalary: p.contractGross,
    earnedGross: p.earnedGross,
    workingDays: p.workedDays,
    workingHours: positive(p.row.workingHours) || p.line.working_hours || null,
    bonus: p.bonusQar,
    otPayReg: p.otQar,
    extraPay: p.airQar,
    deduction: p.ded,
    missingCompensation: false,
    wps: pm === "wps" ? p.netQar : 0,
    cash: pm === "cash" ? p.netQar : 0,
    bankTransfer: pm === "bank_transfer" ? p.netQar : 0,
    cheque: pm === "cheque" ? p.netQar : 0,
    excelWorkingDays: p.excelDays,
  };
  const earnings = [
    {
      code: "basic",
      label: "Daily rate × worked days",
      amountQar: p.basicForLine,
      meta: { dayRateQar: snapshot.dayRateQar, workedDays: p.workedDays, dailyPay: p.dailyPay },
    },
    { code: "allowances", label: "Allowances", amountQar: p.allowancesForLine },
  ];
  if (p.otQar) earnings.push({ code: "ot", label: "Approved OT", amountQar: p.otQar });
  if (p.airQar) earnings.push({ code: "air_ticket", label: "Air-ticket allowance", amountQar: p.airQar });
  if (p.bonusQar) earnings.push({ code: "bonus", label: "Bonus", amountQar: p.bonusQar });
  if (p.otherQar) earnings.push({ code: "other", label: "Other earnings", amountQar: p.otherQar });
  const { error } = await admin
    .from("hr_payroll_lines")
    .update({
      gross_qar: round2(p.earnedGross + p.otQar + p.airQar + p.bonusQar + p.otherQar),
      net_qar: p.netQar,
      system_net_qar: p.netQar,
      earnings,
      notes: note || null,
      position_snapshot: p.line.position_snapshot || p.row.position,
      workplace_snapshot: p.line.workplace_snapshot || p.row.workplace,
      working_hours: positive(p.row.workingHours) || p.line.working_hours,
      snapshot,
    })
    .eq("id", p.line.id);
  if (error) errors.push({ staff: p.staff.full_name, step: "line", message: error.message });
  else lineOk += 1;
}

console.log(JSON.stringify({ applied: true, compOk, histOk, lineOk, errors }, null, 2));
if (errors.length) process.exit(1);

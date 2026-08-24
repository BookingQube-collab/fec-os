/**
 * Sync public.staff to the E3 Employee Roster HTML (names + locations).
 * Usage:
 *   node --env-file=.env.local scripts/sync-staff-from-employee-roster.mjs
 *   node --env-file=.env.local scripts/sync-staff-from-employee-roster.mjs --file "C:\\path\\Employee Roster.html"
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_HTML = String.raw`c:\Users\patha\Downloads\E3- FEC_Daily_Ops_Consolidate\Employee Roster.html`;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const htmlPath = argValue("--file") ?? DEFAULT_HTML;
const dryRun = process.argv.includes("--dry-run");

const ROSTER_LABELS = {
  "inflatapark city center": "INF-CC",
  "kids driving school city center": "KDS-CC",
  "urban arena doha mall": "UA-DM",
  "kids driving school mini doha mall": "KDS-DM",
  "kids mini driving school doha mall": "KDS-DM",
  "crayons bricks vendome mall": "CB-VM",
  "crayons bricks dar al salam mall": "CB-DSM",
  "carousel aspire park": "CAR-AP",
  "winter mirage vendome mall": "WM-VM",
};

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function decode(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(s) {
  return decode(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

function locCode(label) {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ROSTER_LABELS[key] ?? null;
}

function normalizeQid(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\s+/g, "").trim();
  return digits || null;
}

function normalizeName(value) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+974${digits}`;
  if (digits.startsWith("974") && digits.length >= 11) return `+974${digits.slice(-8)}`;
  return `+${digits}`;
}

function isQidShapedCode(value) {
  return /^\d{8,11}$/.test(String(value ?? "").replace(/\s+/g, "").trim());
}

function parseHireDate(raw) {
  if (!raw?.trim()) return { iso: null, warning: null };
  const trimmed = String(raw).trim();
  let day = null;
  let month = null;
  let year = null;
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    const mon = trimmed.match(/^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2,4})$/);
    if (mon) {
      day = Number(mon[1]);
      month = MONTHS[mon[2].toLowerCase()] ?? null;
      year = Number(mon[3]);
    }
  }
  if (year != null && year < 100) year += 2000;
  if (day == null || month == null || year == null || month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, warning: `Unrecognised joining date "${trimmed}"` };
  }
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year < 1990 || year > 2100) {
    return { iso: null, warning: `Joining date year ${year} is outside 1990–2100 (${trimmed})` };
  }
  return { iso, warning: null };
}

function parseE3(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "yes" || s === "y" || s === "true" || s === "1") return true;
  if (s === "no" || s === "n" || s === "false" || s === "0") return false;
  return null;
}

function parseType(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "permanent") return "permanent";
  if (s === "temporary" || s === "temp") return "temporary";
  return null;
}

function parseStatus(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return { status: "active", blank: true };
  if (s === "active") return { status: "active", blank: false };
  if (s === "on_leave" || s === "leave" || s === "vacation") return { status: "on_leave", blank: false };
  if (s === "inactive" || s === "terminated") return { status: "terminated", blank: false };
  return { status: "active", blank: false, warning: `Unknown status "${raw}"` };
}

function parseSalary(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function staffRole(position) {
  const s = (position ?? "").toLowerCase();
  if (s.includes("venue supervisor") || s === "supervisor") return "venue_supervisor";
  if (s.includes("shift lead")) return "shift_lead";
  if (s.includes("technician")) return "technician";
  if (s.includes("cleaner")) return "cleaner";
  if (s.includes("security")) return "security";
  if (s.includes("cashier")) return "cashier";
  if (s.includes("artist")) return "other";
  if (s.includes("crew") || s.includes("attendant")) return "crew";
  return "other";
}

function roleKind(position) {
  const s = (position ?? "").toLowerCase();
  if (s.includes("venue supervisor") || s.includes("branch manager")) return "BM";
  if (s.includes("cashier")) return "CSH";
  if (s.includes("technician")) return "TEC";
  return "STF";
}

function generateEmployeeCode(locationCode, usedCodes, position) {
  const loc = (locationCode || "UNK").toUpperCase();
  const kind = roleKind(position);
  const tokens = [];
  if (kind === "BM") {
    tokens.push("BM", "VS");
    for (let n = 2; n < 200; n += 1) tokens.push(`BM${n}`);
  } else if (kind === "CSH" || kind === "TEC") {
    tokens.push(kind);
    for (let n = 1; n < 200; n += 1) tokens.push(`${kind}${String(n).padStart(2, "0")}`);
  } else {
    for (let n = 1; n < 200; n += 1) tokens.push(`STF${String(n).padStart(2, "0")}`);
  }
  for (const token of tokens) {
    const code = `${loc}-${token}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error(`Could not allocate employee code for ${loc}`);
}

function parseHtmlRoster(html) {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  let matrix = [];
  for (const table of tables) {
    const trs = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    const rows = trs.map((tr) =>
      [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripHtml(m[1])),
    );
    if (/employee roster/i.test(rows.flat().join(" "))) {
      matrix = rows;
      break;
    }
  }
  const headerIdx = matrix.findIndex((r) => {
    const cells = r.map((c) => normHeader(c));
    return cells.includes("location") && cells.some((c) => c.includes("employee name") || c === "name");
  });
  if (headerIdx < 0) throw new Error("Could not find Employee Roster header row");
  let headers = matrix[headerIdx] ?? [];
  if (headers[0] && /^\d+$/.test(headers[0]) && headers.some((h) => normHeader(h) === "location")) {
    headers = headers.slice(1);
  }
  const parsed = [];
  let skippedEmpty = 0;
  const skipped = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    let cells = matrix[i] ?? [];
    if (cells[0] && /^\d+$/.test(cells[0]) && cells.length === headers.length + 1) {
      cells = cells.slice(1);
    }
    const raw = {};
    headers.forEach((h, col) => {
      raw[h] = cells[col] ?? "";
    });
    const get = (aliases) => {
      const hit = headers.find((h) => aliases.includes(normHeader(h)));
      return hit ? String(raw[hit] ?? "").trim() : "";
    };
    const fullName = get(["employee name", "name", "full name"]);
    const location = get(["location", "branch", "venue"]);
    const qidRaw = get(["qid", "qatar id"]);
    const contact = get(["contact number", "contact", "phone"]);
    if (!fullName) {
      skippedEmpty += 1;
      continue;
    }
    const hire = parseHireDate(get(["joining date", "hire date"]));
    const status = parseStatus(get(["status"]));
    const row = {
      rowNumber: i + 1,
      sourceNo: get(["#", "no"]),
      locationLabel: location,
      locationCode: locCode(location),
      fullName,
      e3: parseE3(get(["e3", "e3 enrolled"])),
      employmentType: parseType(get(["employee type", "employment type", "type"])),
      salary: parseSalary(get(["salary", "monthly salary"])),
      qid: normalizeQid(qidRaw),
      activity: get(["activity", "department"]) || null,
      position: get(["position", "job title"]) || null,
      phone: normalizePhone(contact),
      hireDate: hire.iso,
      status: status.status,
      warnings: [],
    };
    if (!row.locationCode) row.warnings.push(`Unmapped location "${location}"`);
    if (hire.warning) row.warnings.push(hire.warning);
    if (status.blank) row.warnings.push("Status is blank — defaulting to active");
    if (status.warning) row.warnings.push(status.warning);
    if (!row.qid) row.warnings.push("Missing QID");
    parsed.push(row);
  }
  return { parsed, skippedEmpty, skipped, headers };
}

const REF_CHECKS = [
  ["shifts", "staff_id"],
  ["attendance_logs", "staff_id"],
  ["attendance_daily_summary", "staff_id"],
  ["attendance_exceptions", "staff_id"],
  ["training_enrollments", "staff_id"],
  ["kpi_scores", "staff_id"],
  ["kpi_assignments", "staff_id"],
  ["sop_assignments", "staff_id"],
  ["employee_kras", "staff_id"],
  ["employee_kpis", "staff_id"],
  ["employee_evaluations", "staff_id"],
  ["employee_achievements", "staff_id"],
  ["events", "pm_staff_id"],
  ["events", "director_staff_id"],
  ["event_team_members", "staff_id"],
  ["event_tasks", "owner_staff_id"],
  ["event_tasks", "assignee_staff_id"],
  ["purchase_requisitions", "requester_staff_id"],
];

async function referencedIds(sb, ids) {
  const hit = new Set();
  if (!ids.length) return hit;
  for (const [table, col] of REF_CHECKS) {
    const { data, error } = await sb.from(table).select(col).in(col, ids);
    if (error) continue;
    for (const row of data ?? []) {
      if (row[col]) hit.add(row[col]);
    }
  }
  return hit;
}

async function audit(sb, action, rowId, after, locationId) {
  await sb.rpc("log_audit", {
    _action: action,
    _table_name: "staff",
    _row_id: rowId,
    _after: after,
    _metadata: { source: "employee-roster-html-sync" },
    _location_id: locationId ?? undefined,
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const { parsed, skippedEmpty } = parseHtmlRoster(html);
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: locations, error: locErr } = await sb.from("locations").select("id, code, name");
if (locErr) throw locErr;
const locByCode = new Map((locations ?? []).map((l) => [l.code, l]));
const locById = new Map((locations ?? []).map((l) => [l.id, l]));

const { data: staffRows, error: stErr } = await sb
  .from("staff")
  .select("id, employee_code, full_name, qid, phone, job_title, department, status, deleted_at, location_id, hire_date, e3_enrolled, employment_type, staff_role, is_roaming")
  .limit(2000);
if (stErr) throw stErr;

const allStaff = staffRows ?? [];
const live = allStaff.filter((s) => !s.deleted_at);
const usedCodes = new Set(allStaff.map((s) => s.employee_code).filter(Boolean));

const matchedIds = new Set();
const creates = [];
const updates = [];
const reviews = [];

for (const row of parsed) {
  const loc = row.locationCode ? locByCode.get(row.locationCode) : null;
  if (!row.locationCode || !loc) {
    reviews.push({ row, reason: "unknown_location" });
    continue;
  }

  let hit = null;
  let rule = null;
  if (row.qid) {
    const hits = live.filter((s) => {
      if (normalizeQid(s.qid) === row.qid) return true;
      return isQidShapedCode(s.employee_code) && normalizeQid(s.employee_code) === row.qid;
    });
    if (hits.length === 1) {
      hit = hits[0];
      rule = "qid";
    } else if (hits.length > 1) {
      reviews.push({ row, reason: "qid_ambiguous", candidates: hits });
      continue;
    }
  }
  if (!hit && row.phone && row.fullName) {
    const hits = live.filter(
      (s) => normalizePhone(s.phone) === row.phone && normalizeName(s.full_name) === normalizeName(row.fullName),
    );
    if (hits.length === 1) {
      hit = hits[0];
      rule = "phone_name";
    } else if (hits.length > 1) {
      reviews.push({ row, reason: "phone_ambiguous", candidates: hits });
      continue;
    }
  }
  if (!hit && !row.qid && !row.phone) {
    const hits = live.filter(
      (s) => normalizeName(s.full_name) === normalizeName(row.fullName) && s.location_id === loc.id,
    );
    if (hits.length === 1) {
      hit = hits[0];
      rule = "name_location";
    } else if (hits.length > 1) {
      reviews.push({ row, reason: "name_ambiguous", candidates: hits });
      continue;
    }
  }

  if (!hit) {
    creates.push({ row, loc, rule: rule ?? "unmatched" });
    continue;
  }

  matchedIds.add(hit.id);
  const keepCode = !isQidShapedCode(hit.employee_code) && hit.employee_code !== hit.qid;
  const employee_code = keepCode
    ? hit.employee_code
    : generateEmployeeCode(row.locationCode, usedCodes, row.position);
  updates.push({
    row,
    loc,
    hit,
    rule,
    employee_code,
    nameChanged: normalizeName(hit.full_name) !== normalizeName(row.fullName),
    locChanged: locById.get(hit.location_id)?.code !== row.locationCode,
  });
}

const extras = live.filter((s) => !matchedIds.has(s.id) && !s.is_roaming);
const roamingKept = live.filter((s) => !matchedIds.has(s.id) && s.is_roaming);

console.log(`Sheet people: ${parsed.length} (skipped empty ${skippedEmpty})`);
console.log(`People before (live): ${live.length}`);
console.log(`Locations on sheet:`);
for (const label of [...new Set(parsed.map((r) => r.locationLabel))]) {
  console.log(`  ${label} → ${locCode(label)}`);
}
console.log(`DB locations: ${(locations ?? []).map((l) => l.code).sort().join(", ")}`);
console.log(`Match: update=${updates.length} create=${creates.length} extras=${extras.length} review=${reviews.length}`);

if (dryRun) {
  for (const u of updates.filter((x) => x.nameChanged || x.locChanged)) {
    console.log(`UPDATE ${u.rule} | ${u.hit.full_name} → ${u.row.fullName} | ${locById.get(u.hit.location_id)?.code} → ${u.row.locationCode}`);
  }
  for (const c of creates) console.log(`CREATE | ${c.row.fullName} | ${c.row.locationCode} | qid=${c.row.qid ?? ""}`);
  for (const e of extras) console.log(`EXTRA | ${e.employee_code} | ${e.full_name}`);
  for (const r of roamingKept) console.log(`ROAMING KEEP | ${r.employee_code} | ${r.full_name}`);
  for (const r of reviews) console.log(`REVIEW | ${r.row.fullName} | ${r.reason}`);
  process.exit(0);
}

const archived = [];
const deleted = [];
const extraIds = extras.map((s) => s.id);
const referencedSet = await referencedIds(sb, extraIds);
for (const s of extras) {
  const referenced = referencedSet.has(s.id);
  if (referenced) {
    const { error } = await sb
      .from("staff")
      .update({ status: "terminated", deleted_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) throw new Error(`Archive ${s.full_name}: ${error.message}`);
    await audit(sb, "staff.archived", s.id, { status: "terminated", reason: "not on Employee Roster" }, s.location_id);
    archived.push({ ...s, reason: "referenced leftover / not on sheet" });
  } else {
    const { error } = await sb.from("staff").delete().eq("id", s.id);
    if (error) throw new Error(`Delete ${s.full_name}: ${error.message}`);
    await audit(sb, "staff.deleted", s.id, { deleted: true, reason: "not on Employee Roster" }, s.location_id);
    deleted.push({ ...s, reason: "unreferenced leftover / not on sheet" });
  }
}

const created = [];
for (const c of creates) {
  const employee_code = generateEmployeeCode(c.row.locationCode, usedCodes, c.row.position);
  const id = randomUUID();
  const payload = {
    id,
    location_id: c.loc.id,
    employee_code,
    full_name: c.row.fullName,
    qid: c.row.qid,
    phone: c.row.phone,
    job_title: c.row.position,
    department: c.row.activity,
    hire_date: c.row.hireDate,
    status: c.row.status,
    e3_enrolled: c.row.e3,
    employment_type: c.row.employmentType,
    staff_role: staffRole(c.row.position),
  };
  const { error } = await sb.from("staff").insert(payload);
  if (error) throw new Error(`Create ${c.row.fullName}: ${error.message}`);
  if (c.row.salary != null) {
    await sb.from("staff_compensation").upsert({
      staff_id: id,
      monthly_salary_qar: c.row.salary,
    });
  }
  await audit(sb, "staff.created", id, { ...payload, source: "employee-roster-html" }, c.loc.id);
  created.push({ ...c.row, id, employee_code });
}

const nameFixed = [];
const locFixed = [];
for (const u of updates) {
  const patch = {
    full_name: u.row.fullName,
    qid: u.row.qid ?? u.hit.qid,
    phone: u.row.phone ?? u.hit.phone,
    job_title: u.row.position ?? u.hit.job_title,
    department: u.row.activity ?? u.hit.department,
    hire_date: u.row.hireDate ?? u.hit.hire_date,
    status: u.row.status,
    e3_enrolled: u.row.e3,
    employment_type: u.row.employmentType,
    staff_role: staffRole(u.row.position) ?? u.hit.staff_role,
    location_id: u.loc.id,
    employee_code: u.employee_code,
    deleted_at: null,
  };
  const { error } = await sb.from("staff").update(patch).eq("id", u.hit.id);
  if (error) throw new Error(`Update ${u.row.fullName}: ${error.message}`);
  if (u.row.salary != null) {
    await sb.from("staff_compensation").upsert({
      staff_id: u.hit.id,
      monthly_salary_qar: u.row.salary,
    });
  }
  await audit(sb, "staff.updated", u.hit.id, patch, u.loc.id);
  if (u.nameChanged) nameFixed.push({ from: u.hit.full_name, to: u.row.fullName, id: u.hit.id });
  if (u.locChanged) {
    locFixed.push({
      name: u.row.fullName,
      from: locById.get(u.hit.location_id)?.code,
      to: u.row.locationCode,
      id: u.hit.id,
    });
  }
}

const { data: afterRows, error: afterErr } = await sb
  .from("staff")
  .select("id, status, deleted_at, location_id, full_name")
  .is("deleted_at", null);
if (afterErr) throw afterErr;
const afterLive = afterRows ?? [];
const afterActive = afterLive.filter((s) => s.status === "active").length;
const afterLeave = afterLive.filter((s) => s.status === "on_leave").length;
const afterByLoc = {};
for (const s of afterLive.filter((x) => x.status !== "terminated")) {
  const code = locById.get(s.location_id)?.code ?? "?";
  afterByLoc[code] = (afterByLoc[code] ?? 0) + 1;
}

console.log("\nCREATED");
for (const c of created) console.log(`  ${c.employee_code} | ${c.fullName} | ${c.locationCode} | qid=${c.qid ?? ""} | ${c.warnings.join("; ")}`);
console.log("\nNAME CORRECTIONS");
for (const n of nameFixed) console.log(`  ${n.from} → ${n.to}`);
console.log("\nLOCATION CORRECTIONS");
for (const n of locFixed) console.log(`  ${n.name}: ${n.from} → ${n.to}`);
console.log("\nROAMING KEPT (not on sheet)");
for (const s of roamingKept) console.log(`  ${s.employee_code} | ${s.full_name}`);
console.log("\nARCHIVED");
for (const s of archived) console.log(`  ${s.employee_code} | ${s.full_name} | ${s.reason}`);
console.log("\nDELETED");
for (const s of deleted) console.log(`  ${s.employee_code} | ${s.full_name} | ${s.reason}`);
console.log("\nCOULD NOT IMPORT");
for (const r of reviews) console.log(`  ${r.row.fullName} | ${r.reason} | ${r.row.warnings.join("; ")}`);
const warnRows = parsed.filter((r) => r.warnings.length);
console.log("\nSHEET WARNINGS");
for (const r of warnRows) console.log(`  ${r.fullName}: ${r.warnings.join("; ")}`);

console.log(
  JSON.stringify(
    {
      sheet: parsed.length,
      before_live: live.length,
      after_live: afterLive.length,
      after_active: afterActive,
      after_on_leave: afterLeave,
      after_by_location: afterByLoc,
      created: created.length,
      updated: updates.length,
      archived: archived.length,
      deleted: deleted.length,
      roaming_kept: roamingKept.length,
      review: reviews.length,
    },
    null,
    2,
  ),
);

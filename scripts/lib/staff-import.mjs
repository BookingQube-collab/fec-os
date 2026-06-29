import { createHash } from "node:crypto";

export const BRANCH_CODES = ["KDS-CC", "INF-CC", "UA-DM", "CB-VM", "CB-DSM", "CAR-AP"];

export const APP_ROLES = new Set([
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "tech_supervisor",
  "technician",
  "cashier_host",
  "auditor",
]);

export const ROLE_LEVELS = {
  ceo: 100,
  coo: 85,
  cfo: 80,
  regional_ops: 80,
  branch_gm: 55,
  duty_manager: 45,
  tech_supervisor: 50,
  technician: 35,
  cashier_host: 25,
  auditor: 65,
};

const WEEKDAYS = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function staffUuid(employeeCode) {
  const h = createHash("sha256").update(`fec-staff-v1:${employeeCode}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function shiftUuid(employeeCode, startsAt) {
  const h = createHash("sha256").update(`fec-shift-v1:${employeeCode}:${startsAt}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function parseStaffRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const full_name = r.full_name;
    if (!location_code || !employee_code || !full_name) {
      throw new Error(`Staff row ${i + 2}: location_code, employee_code, and full_name are required`);
    }
    if (!BRANCH_CODES.includes(location_code)) {
      throw new Error(`Staff row ${i + 2}: unknown location_code "${location_code}"`);
    }
    const app_role = (r.app_role || "").toLowerCase() || null;
    if (app_role && !APP_ROLES.has(app_role)) {
      throw new Error(`Staff row ${i + 2}: invalid app_role "${app_role}"`);
    }
    const create_login = ["true", "1", "yes", "y"].includes((r.create_login || "").toLowerCase());
    out.push({
      location_code,
      employee_code,
      full_name,
      job_title: r.job_title || null,
      department: r.department || "Operations",
      hire_date: r.hire_date || null,
      status: r.status || "active",
      phone: r.phone || null,
      email: r.email || null,
      app_role,
      create_login: create_login && !!app_role && !!r.email,
    });
  }
  return out;
}

/** Expand weekly template rows into dated shift records for a calendar month. */
export function expandWeeklyRoster(rows, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const out = [];
  for (const r of rows) {
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const weekday = WEEKDAYS[(r.weekday || "").toLowerCase()];
    if (!location_code || !employee_code || weekday === undefined) {
      throw new Error("Weekly roster rows need location_code, employee_code, and weekday");
    }
    if (!BRANCH_CODES.includes(location_code)) {
      throw new Error(`Unknown location_code "${location_code}" in roster`);
    }
    const start_time = r.start_time || "09:00";
    const end_time = r.end_time || "17:00";
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+03:00`);
      if (d.getUTCDay() !== weekday) continue;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({
        location_code,
        employee_code,
        date,
        start_time,
        end_time,
        role_label: r.role_label || null,
        status: "scheduled",
      });
    }
  }
  return out;
}

export function parseDatedRosterRows(rows) {
  return rows.map((r, i) => {
    const location_code = r.location_code?.toUpperCase();
    const employee_code = r.employee_code?.toUpperCase();
    const date = r.date || r.shift_date;
    if (!location_code || !employee_code || !date) {
      throw new Error(`Roster row ${i + 2}: location_code, employee_code, and date are required`);
    }
    if (!BRANCH_CODES.includes(location_code)) {
      throw new Error(`Roster row ${i + 2}: unknown location_code "${location_code}"`);
    }
    return {
      location_code,
      employee_code,
      date,
      start_time: r.start_time || "09:00",
      end_time: r.end_time || "17:00",
      role_label: r.role_label || null,
      status: r.status || "scheduled",
    };
  });
}

export function toQatarIso(date, time) {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  return `${date}T${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}:00+03:00`;
}

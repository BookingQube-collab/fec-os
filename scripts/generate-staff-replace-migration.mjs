/**
 * Generates staff replace migration + demo-data/staff_import.csv from spreadsheet rows.
 * Usage: node scripts/generate-staff-replace-migration.mjs
 */
import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function staffUuid(employeeCode) {
  const h = createHash("sha256").update(`fec-staff-v1:${employeeCode}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const LOCATION_MAP = {
  "Urban Arena - Doha Mall": "UA-DM",
  "Crayons & Bricks - Dar Al Salam Mall": "CB-DSM",
  "Carousel - Aspire Park": "CAR-AP",
  "Kids Driving School Mini - Doha Mall": "KDS-DM",
  "Kids Driving School - City Center": "KDS-CC",
  "Crayons & Bricks - Vendome Mall": "CB-VM",
  "Winter Mirage - Vendome Mall": "WM-VM",
  "Inflatapark - City Center": "INF-CC",
};

const POSITION_ROLE = {
  "Venue Supervisor": "venue_supervisor",
  "Shift Lead": "shift_lead",
  "Crew / Attendant": "crew",
  Cashier: "cashier",
  Technician: "technician",
  Cleaner: "cleaner",
  Artist: "other",
};

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseJoinDate(raw) {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const slashShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slashShort) {
    const [, d, m, y2] = slashShort;
    const y = Number(y2) >= 50 ? `19${y2}` : `20${y2}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const dmy = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
  if (dmy) {
    const [, d, mon, yRaw] = dmy;
    const m = MONTHS[mon.toLowerCase()];
    if (!m) throw new Error(`Unknown month in date: ${s}`);
    const y = yRaw.length === 2 ? (Number(yRaw) >= 50 ? `19${yRaw}` : `20${yRaw}`) : yRaw;
    return `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  throw new Error(`Unparsed date: ${s}`);
}

function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("974")) return `+${digits}`;
  return `+974${digits}`;
}

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Spreadsheet rows: location, name, qid, activity, position, phone, joiningDate */
const ROWS = [
  ["Urban Arena - Doha Mall", "Waqar Asghar", "29658611062", "OverAll", "Venue Supervisor", "51234705", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Abdallah Osman", "30173602895", "Ticketing Counter", "Cashier", "31203338", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Margaret Njeri", "28940402764", "Ticketing Counter", "Cashier", "70180508", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Ali Husnain", "30258606237", "Main Hub", "Shift Lead", "72116976", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Sachin Shetty", "28935629722", "Battle Arena", "Shift Lead", "33495903", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Khalid Sami", "29573604200", "Battle Arena", "Crew / Attendant", "66208780", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Olubummo Tope", "29758600074", "Floor is Lava", "Crew / Attendant", "71032078", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Lillian Kerubo", "28740403764", "Mini Golf", "Crew / Attendant", "31562882", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Goretty Mania", "28140401069", "Mini Golf", "Crew / Attendant", "33044002", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Yebach Ruth", "28528801171", "Trampoline", "Crew / Attendant", "77969403", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Rosie Bartocillo", "28360812913", "Kids Tribe", "Crew / Attendant", "31166270", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Katrina Piscoco", "28460829086", "Kids Tribe", "Crew / Attendant", "55188491", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Saraswati Chhetri", "29052451113", "Kids Tribe", "Crew / Attendant", "71431918", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Wahaj Asghar", "29858612703", "Go kart+Acade Games", "Crew / Attendant", "77599149", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Waseem Qayyum", "29358613060", "Go kart+Acade Games", "Crew / Attendant", "52041997", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Rajan Khadka", "30052418835", "Go kart+Acade Games", "Crew / Attendant", "74763754", "19/03/2026"],
  ["Urban Arena - Doha Mall", "MD Juber Hussain", "30035005493", "Archery", "Crew / Attendant", "77800738", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Mokarm khursaid", "29852419561", "Hoopshots+Billiards", "Crew / Attendant", "77057028", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Abdi Shakur Omar", "30460800753", "Ar Racing+SpinCity+Ping Pong", "Crew / Attendant", "30467113", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Hussain omar", "30260800711", "Dartxxx+Ax+Herox+PSS", "Crew / Attendant", "51060223", "19/03/2026"],
  ["Urban Arena - Doha Mall", "Hannan Abid", "28405028554", "Maintenance", "Technician", "50857821", "19/03/2026"],
  ["Crayons & Bricks - Dar Al Salam Mall", "Romel Chavez Pusung", "28360804725", "", "Venue Supervisor", "55683711", "3/9/2022"],
  ["Crayons & Bricks - Dar Al Salam Mall", "Mary rose Bustamante", "27460807049", "", "Artist", "33900174", "1/12/2024"],
  ["Crayons & Bricks - Dar Al Salam Mall", "Abdul Qadir Sayed Khan", "29058615118", "", "Crew / Attendant", "66003460", "28/06/2026"],
  ["Carousel - Aspire Park", "Zaryab Javaid", "28858608039", "", "Venue Supervisor", "70603084", "1-Mar-24"],
  ["Carousel - Aspire Park", "Flora Mae", "28460807725", "", "Crew / Attendant", "30613987", "1-Jul-24"],
  ["Kids Driving School Mini - Doha Mall", "Mazin Abdelazeem", "30173602675", "", "Cashier", "71858412", "18/06/2026"],
  ["Kids Driving School Mini - Doha Mall", "Rizwan Hassan", "29558611657", "", "Crew / Attendant", "70212910", "18/06/2026"],
  ["Kids Driving School Mini - Doha Mall", "Hannah Wakio", "29640401505", "", "Crew / Attendant", "66166052", "18/06/2026"],
  ["Kids Driving School - City Center", "Abiola Moses Ogunniyi", "28656600858", "Driving Lane/ Yalla Toys", "Crew / Attendant", "71047512", "6-Jun-25"],
  ["Kids Driving School - City Center", "Mary Nyambura", "29040406440", "Soft Play", "Crew / Attendant", "55381246", "6-Jun-25"],
  ["Kids Driving School - City Center", "Nemeta Sablo Cabrera", "27260808749", "Ballpit", "Crew / Attendant", "31531672", "6-Jun-25"],
  ["Kids Driving School - City Center", "Pabitra Acharya", "30052413225", "Ticket Checking", "Crew / Attendant", "71273620", "6-Jun-25"],
  ["Kids Driving School - City Center", "Noah Cini", "29656600197", "Driving Lane", "Crew / Attendant", "33998621", "6-Jun-25"],
  ["Kids Driving School - City Center", "Abigail Danso kumi", "29328801301", "Ticket Checking", "Crew / Attendant", "71844636", "6-Jun-25"],
  ["Kids Driving School - City Center", "Uzzal Mia Alkas mia", "29405011077", "Driving lane", "Cleaner", "30295614", "6-Jun-25"],
  ["Kids Driving School - City Center", "Sahadatu Bawa", "29628801124", "Ballpit", "Crew / Attendant", "31349462", "5-Oct-25"],
  ["Kids Driving School - City Center", "Sujata Sigdel", "29852424131", "Soft Play", "Crew / Attendant", "31338038", "6-Jun-25"],
  ["Kids Driving School - City Center", "Mohammed Abdelazeem M", "29973602805", "Cashier", "Cashier", "30425191", "6-Jun-25"],
  ["Kids Driving School - City Center", "Rodelyn Loria Marbida", "28460812356", "Vacation", "Cashier", "50909843", "6-Jun-25"],
  ["Kids Driving School - City Center", "Atif Ali Munir Ahmed", "30358609483", "Cashier", "Cashier", "74461584", "6-Jun-25"],
  ["Kids Driving School - City Center", "Ashfaq Noori", "29735603636", "", "Venue Supervisor", "30214432", "6-Jun-25"],
  ["Crayons & Bricks - Vendome Mall", "Rosebelt Fatal", "29660800835", "", "Venue Supervisor", "66720880", "22-Nov-23"],
  ["Crayons & Bricks - Vendome Mall", "Irene Pabello", "28460818555", "", "Artist", "77837120", "22-Nov-23"],
  ["Crayons & Bricks - Vendome Mall", "Charlene Jeanne Agapito", "29560801403", "", "Artist", "31824899", "22-Nov-23"],
  ["Crayons & Bricks - Vendome Mall", "Avishek Pandit", "29852425598", "", "Artist", "30399891", "10/3/2024"],
  ["Winter Mirage - Vendome Mall", "Rabah Aberrraouf Belhadj", "29701201238", "", "Technician", "51247628", "22-Apr-26"],
  ["Winter Mirage - Vendome Mall", "Mohamed Islem Bettin", "29501201428", "", "Technician", "30224214", ""],
  ["Inflatapark - City Center", "Mary Muiruri", "29440401419", "", "Venue Supervisor", "66269506", "15-May-22"],
  ["Inflatapark - City Center", "Mercy Galang Garcia", "28760810436", "Cashier", "Cashier", "33927495", "15-May-22"],
  ["Inflatapark - City Center", "Jorene Tesoro Quixote", "28460819794", "Cashier", "Cashier", "50541839", "25/Feb/2022"],
  ["Inflatapark - City Center", "Angie Urania santos", "29160813855", "INFLATA park", "Crew / Attendant", "50217980", "25-May-22"],
  ["Inflatapark - City Center", "Marissa Domingo Reyes", "29360802506", "Cashier", "Cashier", "31559302", "25-May-22"],
  ["Inflatapark - City Center", "Wasanthi Hemamali", "28214407767", "INFLATA park", "Crew / Attendant", "55395068", "12-Feb-24"],
  ["Inflatapark - City Center", "Maanaliza Quijote", "28860814283", "Grab and win", "Crew / Attendant", "52061452", "20-May-22"],
  ["Inflatapark - City Center", "Ma luz Jesus Romeo", "28760825747", "Space tribe", "Crew / Attendant", "30151347", "20-May-22"],
  ["Inflatapark - City Center", "Mani raj pariyar", "28352414399", "Battle arena", "Crew / Attendant", "70847131", "11-Feb-23"],
  ["Inflatapark - City Center", "Philis Mumbi kamau", "28940403887", "Inflate kids", "Crew / Attendant", "72086076", "15-May-22"],
  ["Inflatapark - City Center", "Judith appiah", "28328800915", "Space tribe", "Crew / Attendant", "31066825", "4-Jun-25"],
  ["Inflatapark - City Center", "Flora chepchumba", "29240405361", "Battle arena", "Crew / Attendant", "72055373", "20-May-22"],
  ["Inflatapark - City Center", "Florjana kamentodang", "29060817662", "Inflata park", "Crew / Attendant", "39912136", "20-May-22"],
];

const staff = ROWS.map(([location, name, qid, activity, position, phone, joinDate], i) => {
  const location_code = LOCATION_MAP[location];
  if (!location_code) throw new Error(`Row ${i + 1}: unmapped location "${location}"`);

  const staff_role = POSITION_ROLE[position];
  if (!staff_role) throw new Error(`Row ${i + 1}: unmapped position "${position}"`);

  const employee_code = qid;
  const activityTrim = activity.trim();
  let status = "active";
  let department = activityTrim || null;
  if (activityTrim.toLowerCase() === "vacation") {
    status = "on_leave";
    department = "Vacation";
  }

  return {
    id: staffUuid(employee_code),
    location_code,
    employee_code,
    full_name: name,
    job_title: position,
    department,
    hire_date: parseJoinDate(joinDate),
    status,
    phone: formatPhone(phone),
    staff_role,
    qid,
  };
});

const csvHeader =
  "location_code,employee_code,full_name,job_title,department,hire_date,status,phone,qid,staff_role";
const csvLines = staff.map((s) =>
  [
    s.location_code,
    s.employee_code,
    s.full_name,
    s.job_title,
    s.department ?? "",
    s.hire_date ?? "",
    s.status,
    s.phone ?? "",
    s.qid,
    s.staff_role,
  ]
    .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v))
    .join(","),
);

const csvPath = path.join(root, "demo-data", "staff_import.csv");
fs.writeFileSync(csvPath, `${csvHeader}\n${csvLines.join("\n")}\n`, "utf8");

const valueRows = staff
  .map(
    (s) =>
      `  (${sqlStr(s.id)}, ${sqlStr(s.location_code)}, ${sqlStr(s.employee_code)}, ${sqlStr(s.full_name)}, ${sqlStr(s.job_title)}, ${sqlStr(s.department)}, ${s.hire_date ? sqlStr(s.hire_date) : "NULL"}, ${sqlStr(s.status)}, ${sqlStr(s.phone)}, ${sqlStr(s.staff_role)}::public.staff_role, ${sqlStr(s.qid)})`,
  )
  .join(",\n");

const migration = `-- Replace staff directory with spreadsheet import (${staff.length} records)
-- Generated by scripts/generate-staff-replace-migration.mjs

-- Ensure Kids Mini (Doha Mall) and Winter Mirage (Vendome) locations exist
INSERT INTO public.locations (code, name, city, region, country, timezone, status, launched_on) VALUES
  ('KDS-DM', 'Kids Mini Driving School', 'Doha', 'Doha Mall', 'QA', 'Asia/Qatar', 'active', '2022-04-01'),
  ('WM-VM', 'Winter Mirage', 'Doha', 'Vendome Mall', 'QA', 'Asia/Qatar', 'active', '2026-04-22')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  city = EXCLUDED.city,
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS qid text;

-- Clear staff-linked records before full directory replace
DELETE FROM public.training_enrollments;
DELETE FROM public.attendance_exceptions;
DELETE FROM public.attendance_daily_summary;
DELETE FROM public.attendance_logs;
DELETE FROM public.sop_assignments WHERE staff_id IS NOT NULL;
DELETE FROM public.kpi_scores WHERE staff_id IS NOT NULL;
DELETE FROM public.kpi_assignments WHERE staff_id IS NOT NULL;
UPDATE public.shifts SET staff_id = NULL;
DELETE FROM public.staff;

INSERT INTO public.staff (
  id,
  location_id,
  employee_code,
  full_name,
  job_title,
  department,
  hire_date,
  status,
  phone,
  staff_role,
  qid
)
SELECT
  v.id::uuid,
  l.id,
  v.employee_code,
  v.full_name,
  v.job_title,
  v.department,
  v.hire_date::date,
  v.status,
  v.phone,
  v.staff_role,
  v.qid
FROM (
  VALUES
${valueRows}
) AS v(id, loc_code, employee_code, full_name, job_title, department, hire_date, status, phone, staff_role, qid)
JOIN public.locations l ON l.code = v.loc_code;
`;

const migrationPath = path.join(root, "supabase", "migrations", "20260629180000_staff_directory_replace.sql");
fs.writeFileSync(migrationPath, migration, "utf8");

console.log(`Wrote ${csvPath} (${staff.length} rows)`);
console.log(`Wrote ${migrationPath}`);

/**
 * Generates Qatar FEC demo CSVs for June 2026 into demo-data/.
 * Usage: node scripts/generate-demo-data.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "demo-data");
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const TZ = "Asia/Qatar";
const CURRENCY = "QAR";
const YEAR = 2026;
const MONTH = 6;
const DAYS_IN_MONTH = 30;

/** @type {const} */
const BRANCHES = [
  { code: "KDS-CC", name: "Kids Driving School", mall: "City Center", region: "City Center Doha", launched_on: "2022-03-15", baseRevenue: 11000, weekendMult: 1.85 },
  { code: "INF-CC", name: "Inflatapark", mall: "City Center", region: "City Center Doha", launched_on: "2022-06-01", baseRevenue: 15000, weekendMult: 2.1 },
  { code: "UA-DM", name: "Urban Arena", mall: "Doha Mall", region: "Doha Mall", launched_on: "2023-01-10", baseRevenue: 13000, weekendMult: 1.75 },
  { code: "CB-VM", name: "Crayons & Bricks", mall: "Vendome Mall", region: "Vendome Mall", launched_on: "2023-04-20", baseRevenue: 9000, weekendMult: 1.6 },
  { code: "CB-DSM", name: "Crayons & Bricks", mall: "Dar Al Salam Mall", region: "Dar Al Salam Mall", launched_on: "2023-09-01", baseRevenue: 8500, weekendMult: 1.55 },
  { code: "CAR-AP", name: "Carousel", mall: "Aspire Park", region: "Aspire Park", launched_on: "2024-02-14", baseRevenue: 7000, weekendMult: 1.9 },
];

const FIRST_NAMES = [
  "Abdullah", "Fatima", "Mohammed", "Mariam", "Khalid", "Noor", "Hassan", "Aisha",
  "Saeed", "Layla", "Omar", "Hessa", "Yousef", "Amna", "Rashid", "Sara", "Hamad", "Reem",
  "Fahad", "Noura", "Jassim", "Latifa", "Ali", "Dana", "Sultan", "Maha", "Tariq", "Shamma",
];
const LAST_NAMES = [
  "Al-Thani", "Al-Kuwari", "Al-Marri", "Al-Mansouri", "Al-Naimi", "Al-Sulaiti",
  "Al-Hajri", "Al-Malki", "Al-Dosari", "Al-Kaabi", "Al-Attiyah", "Al-Buainain",
];

const OPENING_ITEMS = [
  { label: "Unlock main entrance and disable alarm", requires_photo: false },
  { label: "Power on POS terminals and verify network", requires_photo: false },
  { label: "Safety walk-through — attractions and egress", requires_photo: true },
  { label: "Verify first-aid kit stocked and AED charged", requires_photo: false },
  { label: "Check restroom supplies and cleanliness", requires_photo: false },
  { label: "Confirm staff briefing completed", requires_photo: false },
  { label: "Review daily bookings and party schedule", requires_photo: false },
  { label: "Sign off opening checklist", requires_photo: false },
];

const CLOSING_ITEMS = [
  { label: "Cash reconciliation and Z-report printed", requires_photo: false },
  { label: "Secure cash drawer and deposit prepared", requires_photo: false },
  { label: "Attractions powered down and barriers secured", requires_photo: true },
  { label: "Inventory spot-check — retail and F&B", requires_photo: false },
  { label: "Cleaning crew sign-off", requires_photo: false },
  { label: "Incident and complaint log reviewed", requires_photo: false },
  { label: "Set building alarm and lock all exits", requires_photo: true },
  { label: "Supervisor closing sign-off", requires_photo: false },
];

const CORPORATE_USERS = [
  { key: "gm", name: "Nasser Al-Thani", role: "ceo", role_level: 100, title: "General Manager", email: "gm@fec.qa", location_codes: [] },
  { key: "ops", name: "Salem Al-Kuwari", role: "coo", role_level: 85, title: "Operations Manager", email: "ops@fec.qa", location_codes: [] },
  { key: "finance", name: "Hind Al-Marri", role: "cfo", role_level: 80, title: "Finance Manager", email: "finance@fec.qa", location_codes: [] },
  { key: "hr", name: "Amina Al-Mansouri", role: "auditor", role_level: 65, title: "HR & Admin Manager", email: "hr@fec.qa", location_codes: [] },
  { key: "maint1", name: "Rajesh Nair", role: "technician", role_level: 35, title: "Maintenance Technician", email: "maint1@fec.qa", location_codes: [] },
  { key: "maint2", name: "Pradeep Sharma", role: "technician", role_level: 35, title: "Maintenance Technician", email: "maint2@fec.qa", location_codes: [] },
];

function uuid(key) {
  const h = createHash("sha256").update(`fec-demo-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function qid(seed) {
  const base = 28000000000 + (seed % 700000000);
  return String(base).padStart(11, "0").slice(0, 11);
}

function phone(seed) {
  const n = 30000000 + (seed % 5000000);
  return `+974${n}`;
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function dateStr(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isWeekend(day) {
  const d = new Date(`${dateStr(day)}T12:00:00+03:00`);
  const dow = d.getUTCDay();
  return dow === 5 || dow === 6;
}

function isoAt(day, hour, minute = 0) {
  return `${dateStr(day)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`;
}

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(name, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  writeFileSync(join(OUT_DIR, name), `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

function rand(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateDemoData() {
  const locations = BRANCHES.map((b) => ({
    id: uuid(`loc:${b.code}`),
    code: b.code,
    name: b.name,
    city: "Doha",
    region: b.region,
    country: "QA",
    timezone: TZ,
    gla_sqm: Math.round(400 + rand(b.code.length) * 1200),
    status: "active",
    launched_on: b.launched_on,
    surge_mode: false,
  }));

  const locByCode = Object.fromEntries(locations.map((l) => [l.code, l]));

  const attractions = [];
  const attractionDefs = {
    "KDS-CC": [
      { code: "MINI-CIRCUIT", name: "Mini Circuit Track", category: "driving", capacity: 12 },
      { code: "SIM-PODS", name: "Driving Simulators", category: "simulation", capacity: 8 },
      { code: "TRAFFIC-LAB", name: "Traffic Safety Lab", category: "education", capacity: 20 },
    ],
    "INF-CC": [
      { code: "MEGA-SLIDE", name: "Mega Inflatable Slide", category: "inflatable", capacity: 30 },
      { code: "TODDLER-ZONE", name: "Toddler Soft Play", category: "soft_play", capacity: 25 },
      { code: "OBSTACLE-RUN", name: "Obstacle Run", category: "inflatable", capacity: 20 },
    ],
    "UA-DM": [
      { code: "TRAMP-PARK", name: "Trampoline Park", category: "sports", capacity: 40 },
      { code: "NINJA-COURSE", name: "Ninja Warrior Course", category: "sports", capacity: 15 },
      { code: "CLIMB-WALL", name: "Climbing Wall", category: "sports", capacity: 10 },
    ],
    "CB-VM": [
      { code: "BRICK-LAB", name: "Brick Building Lab", category: "creative", capacity: 30 },
      { code: "ART-STUDIO", name: "Art & Craft Studio", category: "creative", capacity: 24 },
    ],
    "CB-DSM": [
      { code: "BRICK-LAB", name: "Brick Building Lab", category: "creative", capacity: 28 },
      { code: "ART-STUDIO", name: "Art & Craft Studio", category: "creative", capacity: 22 },
      { code: "PARTY-ROOM", name: "Birthday Party Room", category: "events", capacity: 35 },
    ],
    "CAR-AP": [
      { code: "CLASSIC-CAROUSEL", name: "Classic Carousel", category: "ride", capacity: 48 },
      { code: "MINI-TRAIN", name: "Aspire Mini Train", category: "ride", capacity: 24 },
    ],
  };

  let attrIdx = 0;
  for (const b of BRANCHES) {
    for (const a of attractionDefs[b.code] ?? []) {
      attractions.push({
        id: uuid(`attr:${b.code}:${a.code}`),
        location_id: locByCode[b.code].id,
        location_code: b.code,
        code: a.code,
        name: a.name,
        category: a.category,
        capacity: a.capacity,
        throughput_per_hour: Math.round(a.capacity * (1.2 + rand(attrIdx) * 0.8)),
        status: attrIdx % 17 === 0 ? "degraded" : "operational",
      });
      attrIdx++;
    }
  }

  const assets = [];
  const assetTemplates = [
    { tag: "POS-01", name: "POS Terminal 1", category: "pos", criticality: "high" },
    { tag: "POS-02", name: "POS Terminal 2", category: "pos", criticality: "high" },
    { tag: "HVAC-01", name: "Main HVAC Unit", category: "hvac", criticality: "critical" },
    { tag: "CCTV-NVR", name: "CCTV NVR System", category: "security", criticality: "high" },
    { tag: "GEN-UPS", name: "UPS Backup", category: "electrical", criticality: "medium" },
    { tag: "AED-01", name: "AED Unit", category: "safety", criticality: "critical" },
    { tag: "RIDE-CTRL", name: "Ride Control Panel", category: "attraction", criticality: "critical" },
  ];

  for (const b of BRANCHES) {
    const branchAttrs = attractions.filter((a) => a.location_code === b.code);
    assetTemplates.forEach((t, i) => {
      assets.push({
        id: uuid(`asset:${b.code}:${t.tag}`),
        location_id: locByCode[b.code].id,
        location_code: b.code,
        attraction_id: i < branchAttrs.length ? branchAttrs[i % branchAttrs.length].id : null,
        tag: t.tag,
        name: t.name,
        category: t.category,
        manufacturer: pick(["Siemens", "Honeywell", "Ingenico", "Otis", "FEC OEM"], i),
        model: `MDL-${1000 + i}`,
        criticality: t.criticality,
        installed_on: b.launched_on,
        warranty_expires_on: "2027-12-31",
      });
    });
  }

  const staff = [];
  const profiles = [];
  const userRoles = [];
  let staffSeed = 0;
  let qidSeed = 28560000000;

  for (const cu of CORPORATE_USERS) {
    const profileId = uuid(`user:${cu.key}`);
    profiles.push({
      id: profileId,
      display_name: cu.name,
      employee_code: `FEC-HQ-${cu.key.toUpperCase()}`,
      phone: phone(staffSeed++),
      preferred_language: "en",
      email: cu.email,
      qid: qid(qidSeed++),
      job_title: cu.title,
      has_auth: true,
    });
    userRoles.push({
      id: uuid(`role:${cu.key}`),
      user_id: profileId,
      role: cu.role,
      role_level: cu.role_level,
      location_ids: cu.location_codes.length ? cu.location_codes.map((c) => locByCode[c].id).join("|") : "",
      location_scope: cu.location_codes.length ? "branch" : "all",
    });
  }

  for (const b of BRANCHES) {
    const locId = locByCode[b.code].id;
    const roles = [
      { suffix: "BM", title: "Branch Manager", department: "Operations", app_role: "branch_gm", role_level: 55, has_auth: true },
      { suffix: "SUP", title: "Shift Supervisor", department: "Operations", app_role: "duty_manager", role_level: 45, has_auth: true },
      { suffix: "CSH", title: "Cashier / Host", department: "Front of House", app_role: "cashier_host", role_level: 25, has_auth: true },
    ];
    const floorTitles = [
      "Attraction Operator", "Party Host", "Floor Attendant", "Retail Associate",
      "F&B Attendant", "Safety Marshal", "Guest Experience Associate",
    ];

    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      const fn = pick(FIRST_NAMES, staffSeed);
      const ln = pick(LAST_NAMES, staffSeed + 3);
      const fullName = `${fn} ${ln}`;
      const empCode = `${b.code}-${r.suffix}`;
      const profileId = r.has_auth ? uuid(`user:${empCode}`) : null;

      staff.push({
        id: uuid(`staff:${empCode}`),
        location_id: locId,
        location_code: b.code,
        user_id: profileId,
        employee_code: empCode,
        full_name: fullName,
        job_title: r.title,
        department: r.department,
        hire_date: b.launched_on,
        status: "active",
        phone: phone(staffSeed),
        email: `${empCode.toLowerCase().replace(/-/g, ".")}@fec.qa`,
        qid: qid(qidSeed++),
        app_role: r.app_role,
      });

      if (profileId) {
        profiles.push({
          id: profileId,
          display_name: fullName,
          employee_code: empCode,
          phone: phone(staffSeed),
          preferred_language: staffSeed % 4 === 0 ? "ar" : "en",
          email: `${empCode.toLowerCase().replace(/-/g, ".")}@fec.qa`,
          qid: qid(qidSeed - 1),
          job_title: r.title,
          has_auth: true,
        });
        userRoles.push({
          id: uuid(`role:${empCode}`),
          user_id: profileId,
          role: r.app_role,
          role_level: r.role_level,
          location_ids: locId,
          location_scope: "branch",
        });
      }
      staffSeed++;
    }

    const floorCount = 4 + (staffSeed % 3);
    for (let f = 0; f < floorCount; f++) {
      const fn = pick(FIRST_NAMES, staffSeed + f);
      const ln = pick(LAST_NAMES, staffSeed + f + 5);
      const empCode = `${b.code}-STF${String(f + 1).padStart(2, "0")}`;
      staff.push({
        id: uuid(`staff:${empCode}`),
        location_id: locId,
        location_code: b.code,
        user_id: null,
        employee_code: empCode,
        full_name: `${fn} ${ln}`,
        job_title: floorTitles[f % floorTitles.length],
        department: "Operations",
        hire_date: "2024-01-15",
        status: f === floorCount - 1 && staffSeed % 11 === 0 ? "on_leave" : "active",
        phone: phone(staffSeed + f),
        email: `${empCode.toLowerCase().replace(/-/g, ".")}@fec.qa`,
        qid: qid(qidSeed++),
        app_role: null,
      });
    }
    staffSeed += floorCount;
  }

  const taskTemplates = [];
  const taskTemplateItems = [];
  for (const b of BRANCHES) {
    for (const kind of ["opening", "closing"]) {
      const tplId = uuid(`tpl:${b.code}:${kind}`);
      const items = kind === "opening" ? OPENING_ITEMS : CLOSING_ITEMS;
      taskTemplates.push({
        id: tplId,
        location_id: locByCode[b.code].id,
        location_code: b.code,
        title: kind === "opening" ? `Daily Opening — ${b.name}` : `Daily Closing — ${b.name}`,
        kind,
        description: `${kind === "opening" ? "Pre-open" : "End-of-day"} checklist for ${b.mall}`,
        active: true,
      });
      items.forEach((it, pos) => {
        taskTemplateItems.push({
          id: uuid(`tpli:${b.code}:${kind}:${pos}`),
          template_id: tplId,
          location_code: b.code,
          template_kind: kind,
          position: pos,
          label: it.label,
          requires_photo: it.requires_photo,
          required: true,
        });
      });
    }
  }

  const shifts = [];
  const taskInstances = [];
  const taskItemResults = [];
  const financialSnapshots = [];
  const transactions = [];
  const complaints = [];
  const tickets = [];
  const workOrders = [];
  const incidents = [];
  const purchaseOrders = [];
  const inventoryItems = [];
  const staffLeaderboard = [];
  const supervisorKpis = [];
  const customTasks = [];

  const complaintTopics = [
    { cat: "wait_time", summary: "Long queue at ticket counter during peak hours", severity: "medium" },
    { cat: "cleanliness", summary: "Restroom cleanliness below standard", severity: "low" },
    { cat: "staff_attitude", summary: "Guest felt staff were dismissive at reception", severity: "medium" },
    { cat: "safety", summary: "Child bumped on attraction padding — parent concerned", severity: "high" },
    { cat: "billing", summary: "Double charge on card payment", severity: "high" },
    { cat: "party", summary: "Birthday party package items missing from room setup", severity: "medium" },
    { cat: "ac", summary: "Air conditioning too cold in play zone", severity: "low" },
    { cat: "refund", summary: "Requested refund for unused play time due to ride downtime", severity: "medium" },
  ];

  const ticketTopics = [
    { title: "POS terminal intermittent freeze", category: "it", priority: "high" },
    { title: "Attraction safety sensor fault", category: "attraction", priority: "urgent" },
    { title: "HVAC temperature fluctuation", category: "facilities", priority: "normal" },
    { title: "CCTV camera offline — aisle 3", category: "security", priority: "normal" },
    { title: "Ride motor unusual noise", category: "attraction", priority: "high" },
    { title: "Leak under F&B counter sink", category: "plumbing", priority: "normal" },
    { title: "Emergency exit sign not illuminated", category: "safety", priority: "high" },
  ];

  const incidentTopics = [
    { category: "safety", summary: "Minor slip on wet floor near entrance — guest assisted", severity: "low" },
    { category: "medical", summary: "Child felt dizzy after trampoline session — first aid given", severity: "medium" },
    { category: "security", summary: "Unattended bag reported — cleared by security", severity: "medium" },
    { category: "property", summary: "Damaged retail display during busy period", severity: "low" },
    { category: "safety", summary: "Finger pinch on ride gate — minor injury", severity: "medium" },
  ];

  const invSkus = [
    { sku: "PPE-GLOVE-M", name: "Disposable Gloves (M)", category: "consumables", unit: "box", reorder: 20 },
    { sku: "CLEAN-SPRAY", name: "Surface Sanitizer 5L", category: "cleaning", unit: "bottle", reorder: 10 },
    { sku: "TISSUE-BOX", name: "Facial Tissue Box", category: "consumables", unit: "pack", reorder: 30 },
    { sku: "POS-ROLL", name: "Thermal POS Paper Roll", category: "retail", unit: "roll", reorder: 50 },
    { sku: "PARTY-BALLOON", name: "Helium Balloon Pack", category: "party", unit: "pack", reorder: 15 },
    { sku: "BRICK-REFILL", name: "Creative Brick Refill Kit", category: "attraction", unit: "kit", reorder: 8 },
    { sku: "SNACK-CHIPS", name: "Snack Chips Assorted", category: "fnb", unit: "case", reorder: 12 },
    { sku: "JUICE-BOX", name: "Kids Juice Box", category: "fnb", unit: "case", reorder: 12 },
    { sku: "FIRST-AID-REF", name: "First Aid Refill Pack", category: "safety", unit: "kit", reorder: 5 },
    { sku: "WAIVER-FORMS", name: "Guest Waiver Forms", category: "admin", unit: "pad", reorder: 10 },
    { sku: "BADGE-LANYARD", name: "Staff Lanyards", category: "hr", unit: "pack", reorder: 5 },
    { sku: "SOAP-REFILL", name: "Hand Soap Refill 5L", category: "cleaning", unit: "bottle", reorder: 8 },
  ];

  let ticketCounter = 0;
  let complaintCounter = 0;
  let incidentCounter = 0;
  let poCounter = 0;
  let txnCounter = 0;

  for (const b of BRANCHES) {
    const loc = locByCode[b.code];
    const branchStaff = staff.filter((s) => s.location_code === b.code && s.user_id);
    const bm = branchStaff.find((s) => s.job_title === "Branch Manager");
    const sup = branchStaff.find((s) => s.job_title === "Shift Supervisor");
    const cashier = branchStaff.find((s) => s.job_title === "Cashier / Host");
    const branchAssets = assets.filter((a) => a.location_code === b.code);
    const openingTpl = taskTemplates.find((t) => t.location_code === b.code && t.kind === "opening");
    const closingTpl = taskTemplates.find((t) => t.location_code === b.code && t.kind === "closing");
    const openingItems = taskTemplateItems.filter((i) => i.template_id === openingTpl.id);
    const closingItems = taskTemplateItems.filter((i) => i.template_id === closingTpl.id);

    supervisorKpis.push({
      id: uuid(`supkpi:${b.code}`),
      location_id: loc.id,
      location_code: b.code,
      supervisor_employee_code: sup?.employee_code ?? "",
      supervisor_name: sup?.full_name ?? "",
      period_month: `${YEAR}-${String(MONTH).padStart(2, "0")}`,
      checklist_completion_pct: 92 + Math.round(rand(b.code.length) * 7),
      staff_attendance_pct: 88 + Math.round(rand(b.code.length + 1) * 10),
      complaint_resolution_hours_avg: (4 + rand(b.code.length) * 8).toFixed(1),
      maintenance_sla_pct: 85 + Math.round(rand(b.code.length + 2) * 12),
      revenue_vs_target_pct: 94 + Math.round(rand(b.code.length + 3) * 12),
      incidents_reported: 2 + (b.code.length % 3),
      tasks_assigned: 28,
      tasks_completed: 26 + (b.code.length % 3),
      status: "reviewed",
    });

    financialSnapshots.push({
      id: uuid(`finsnap:target:${b.code}`),
      location_id: loc.id,
      location_code: b.code,
      period_kind: "month_target",
      period_start: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
      revenue: Math.round(b.baseRevenue * 30 * 1.15),
      cogs: 0,
      labor: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      other_opex: 0,
      ebitda: null,
      footfall: null,
    });

    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      const weekend = isWeekend(day);
      const mult = weekend ? b.weekendMult : 1;
      const noise = 0.85 + rand(day * 17 + b.code.charCodeAt(0)) * 0.3;
      const revenue = Math.round(b.baseRevenue * mult * noise);
      const footfall = Math.round(revenue / (35 + rand(day) * 15));
      const cogs = Math.round(revenue * 0.22);
      const labor = Math.round(revenue * 0.28);
      const rent = Math.round(revenue * 0.12);
      const utilities = Math.round(revenue * 0.04);
      const marketing = Math.round(revenue * 0.03);
      const other = Math.round(revenue * 0.05);
      const ebitda = revenue - cogs - labor - rent - utilities - marketing - other;

      financialSnapshots.push({
        id: uuid(`finsnap:day:${b.code}:${day}`),
        location_id: loc.id,
        location_code: b.code,
        period_kind: "day",
        period_start: dateStr(day),
        revenue,
        cogs,
        labor,
        rent,
        utilities,
        marketing,
        other_opex: other,
        ebitda,
        footfall,
      });

      const txnCount = weekend ? 18 + (day % 5) : 8 + (day % 4);
      for (let t = 0; t < txnCount; t++) {
        txnCounter++;
        const categories = ["ticket", "fnb", "retail", "party"];
        const cat = categories[t % categories.length];
        const amt = Math.round((revenue / txnCount) * (0.6 + rand(txnCounter) * 0.8));
        transactions.push({
          id: uuid(`txn:${b.code}:${day}:${t}`),
          location_id: loc.id,
          location_code: b.code,
          occurred_at: isoAt(day, 10 + (t % 10), (t * 7) % 60),
          channel: t % 5 === 0 ? "kiosk" : "pos",
          category: cat,
          payment_method: t % 3 === 0 ? "cash" : "card",
          amount: amt,
          currency: CURRENCY,
          cashier_id: cashier?.user_id ?? null,
        });
      }

      for (const tpl of [openingTpl, closingTpl]) {
        const items = tpl.kind === "opening" ? openingItems : closingItems;
        const instId = uuid(`ti:${b.code}:${tpl.kind}:${day}`);
        const missed = day === 12 && b.code === "INF-CC" && tpl.kind === "opening";
        const late = day === 18 && b.code === "UA-DM" && tpl.kind === "closing";
        const status = missed ? "overdue" : late ? "submitted" : "submitted";
        const assigned = tpl.kind === "opening" ? sup?.user_id : bm?.user_id;

        taskInstances.push({
          id: instId,
          template_id: tpl.id,
          location_id: loc.id,
          location_code: b.code,
          title: tpl.title,
          checklist_date: dateStr(day),
          checklist_kind: tpl.kind,
          due_at: isoAt(day, tpl.kind === "opening" ? 9 : 22, 0),
          status,
          assigned_to: assigned ?? null,
          submitted_by: status === "submitted" ? assigned : null,
          submitted_at: status === "submitted" ? isoAt(day, tpl.kind === "opening" ? 9 : 22, late ? 45 : 15) : null,
        });

        items.forEach((item, idx) => {
          const checked = status === "submitted" && !(missed && idx > 3);
          taskItemResults.push({
            id: uuid(`tir:${instId}:${item.id}`),
            instance_id: instId,
            item_id: item.id,
            checked,
            photo_path: checked && item.requires_photo ? `demo/${b.code}/${tpl.kind}/${day}/${idx}.jpg` : null,
            note: !checked && missed ? "Not completed — supervisor follow-up required" : null,
            completed_by: checked ? assigned : null,
            completed_at: checked ? isoAt(day, tpl.kind === "opening" ? 9 : 22, 10 + idx) : null,
          });
        });
      }

      const onDutyCount = weekend ? 7 : 5;
      const branchAllStaff = staff.filter((s) => s.location_code === b.code && s.status === "active");
      for (let s = 0; s < onDutyCount; s++) {
        const st = branchAllStaff[(day + s) % branchAllStaff.length];
        const absent = day === 5 && s === 2 && b.code === "CB-VM";
        const lateIn = day === 14 && s === 0;
        const shiftStart = isoAt(day, s % 2 === 0 ? 9 : 14, lateIn ? 25 : 0);
        const shiftEnd = isoAt(day, s % 2 === 0 ? 17 : 22, 0);
        shifts.push({
          id: uuid(`shift:${st.employee_code}:${day}`),
          location_id: loc.id,
          location_code: b.code,
          user_id: st.user_id,
          employee_code: st.employee_code,
          staff_name: st.full_name,
          role_label: st.job_title,
          starts_at: shiftStart,
          ends_at: shiftEnd,
          status: absent ? "no_show" : "completed",
          clock_in_at: absent ? null : shiftStart.replace(/:00\+/, lateIn ? ":25+" : ":03+"),
          clock_out_at: absent ? null : shiftEnd.replace(/:00\+/, ":02+"),
          notes: absent ? "No-show — HR notified" : lateIn ? "Late arrival — 25 min" : null,
        });
      }
    }

    for (let c = 0; c < 4 + (b.code.length % 3); c++) {
      const topic = complaintTopics[(complaintCounter + c) % complaintTopics.length];
      const day = 2 + ((complaintCounter + c) * 3) % 28;
      const statuses = ["new", "investigating", "resolved", "resolved", "escalated"];
      const status = statuses[(complaintCounter + c) % statuses.length];
      complaints.push({
        id: uuid(`complaint:${b.code}:${c}`),
        location_id: loc.id,
        location_code: b.code,
        channel: c % 2 === 0 ? "in_person" : "phone",
        severity: topic.severity,
        category: topic.cat,
        summary: topic.summary,
        guest_name: `${pick(FIRST_NAMES, complaintCounter)} ${pick(LAST_NAMES, complaintCounter + 2)}`,
        guest_contact: phone(complaintCounter + 1000),
        status,
        resolution_notes: status === "resolved" ? "Guest offered complimentary pass; case closed same day." : null,
        resolved_at: status === "resolved" ? isoAt(day, 16, 30) : null,
        created_at: isoAt(day, 11 + (c % 6), 15),
      });
      complaintCounter++;
    }

    for (let t = 0; t < 5 + (b.code.length % 2); t++) {
      const topic = ticketTopics[(ticketCounter + t) % ticketTopics.length];
      const day = 1 + ((ticketCounter + t) * 2) % 29;
      const asset = branchAssets[t % branchAssets.length];
      const statuses = ["open", "assigned", "in_progress", "resolved", "closed", "in_progress"];
      const status = statuses[(ticketCounter + t) % statuses.length];
      const ticketId = uuid(`ticket:${b.code}:${t}`);
      tickets.push({
        id: ticketId,
        location_id: loc.id,
        location_code: b.code,
        asset_id: asset.id,
        title: topic.title,
        description: `${topic.title} reported at ${b.name}, ${b.mall}.`,
        category: topic.category,
        priority: topic.priority,
        status,
        reported_by: sup?.user_id ?? null,
        assigned_to: CORPORATE_USERS[t % 2].key === "maint1" ? uuid("user:maint1") : uuid("user:maint2"),
        sla_due_at: isoAt(day, 18, 0),
        resolved_at: ["resolved", "closed"].includes(status) ? isoAt(day + 1, 11, 0) : null,
        created_at: isoAt(day, 10 + t, 0),
      });

      if (t % 2 === 0) {
        workOrders.push({
          id: uuid(`wo:${ticketId}`),
          location_id: loc.id,
          location_code: b.code,
          asset_id: asset.id,
          ticket_id: ticketId,
          title: `WO: ${topic.title}`,
          description: "Corrective maintenance work order",
          kind: t % 3 === 0 ? "preventive" : "corrective",
          status: status === "closed" ? "completed" : status === "resolved" ? "completed" : "in_progress",
          assigned_to: uuid(`user:maint${(t % 2) + 1}`),
          planned_start: isoAt(day, 12, 0),
          planned_end: isoAt(day, 16, 0),
          actual_start: isoAt(day, 12, 30),
          actual_end: ["resolved", "closed"].includes(status) ? isoAt(day, 15, 45) : null,
          planned_hours: 4,
          actual_hours: ["resolved", "closed"].includes(status) ? 3.25 : null,
        });
      }
      ticketCounter++;
    }

    for (let i = 0; i < 2 + (b.code.charCodeAt(0) % 2); i++) {
      const topic = incidentTopics[(incidentCounter + i) % incidentTopics.length];
      const day = 4 + ((incidentCounter + i) * 5) % 26;
      const statuses = ["reported", "investigating", "rca_complete", "closed"];
      const status = statuses[(incidentCounter + i) % statuses.length];
      incidents.push({
        id: uuid(`incident:${b.code}:${i}`),
        location_id: loc.id,
        location_code: b.code,
        occurred_at: isoAt(day, 14 + i, 20),
        category: topic.category,
        severity: topic.severity,
        summary: topic.summary,
        detail: `Incident logged per FEC safety protocol at ${b.name}.`,
        status,
        rca_root_cause: ["rca_complete", "closed"].includes(status) ? "Operational congestion during peak; signage inadequate." : null,
        rca_actions: ["rca_complete", "closed"].includes(status) ? "Additional floor markers installed; staff briefing completed." : null,
        closed_at: status === "closed" ? isoAt(day + 2, 10, 0) : null,
        reported_by: sup?.user_id ?? null,
      });
      incidentCounter++;
    }

    invSkus.forEach((sku, idx) => {
      const onHand = Math.round(sku.reorder * (0.4 + rand(idx + b.code.length) * 1.8));
      inventoryItems.push({
        id: uuid(`inv:${b.code}:${sku.sku}`),
        location_id: loc.id,
        location_code: b.code,
        sku: sku.sku,
        item_name: sku.name,
        category: sku.category,
        unit: sku.unit,
        quantity_on_hand: onHand,
        reorder_level: sku.reorder,
        reorder_quantity: sku.reorder * 2,
        last_counted_on: dateStr(28 - (idx % 5)),
        status: onHand <= sku.reorder ? "low_stock" : onHand <= sku.reorder * 1.2 ? "reorder_soon" : "in_stock",
        unit_cost_qar: Math.round(15 + rand(idx) * 120),
      });
    });

    for (let p = 0; p < 3; p++) {
      const sku = invSkus[(poCounter + p) % invSkus.length];
      purchaseOrders.push({
        id: uuid(`po:${b.code}:${p}`),
        location_id: loc.id,
        location_code: b.code,
        po_number: `PO-${YEAR}${String(MONTH).padStart(2, "0")}-${b.code}-${String(p + 1).padStart(3, "0")}`,
        vendor_name: pick(["Al Meera Supplies", "Qatar Safety Co.", "Gulf F&B Trading", "Doha Retail Wholesale"], poCounter + p),
        category: sku.category,
        description: `Restock ${sku.name}`,
        amount: Math.round((50 + rand(poCounter + p) * 200) * 10) / 10,
        currency: CURRENCY,
        status: pick(["approved", "received", "closed", "pending_approval", "draft"], poCounter + p),
        requested_by: bm?.user_id ?? null,
      });
    }
    poCounter += 3;

    const leaderboardStaff = staff.filter(
      (s) => s.location_code === b.code && s.user_id && s.status === "active",
    );
    leaderboardStaff.slice(0, 4).forEach((st, rank) => {
      staffLeaderboard.push({
        id: uuid(`lb:${b.code}:${st.employee_code}`),
        profile_id: st.user_id,
        location_id: loc.id,
        location_code: b.code,
        employee_code: st.employee_code,
        staff_name: st.full_name,
        period_start: `${YEAR}-${String(MONTH).padStart(2, "0")}-01`,
        period_end: `${YEAR}-${String(MONTH).padStart(2, "0")}-30`,
        tasks_completed: 40 + rank * 5 + Math.round(rand(rank) * 10),
        incidents_resolved: rank % 2,
        complaints_handled: 3 + rank,
        bookings_created: 2 + rank * 2,
        overall_score: 72 + rank * 4 + Math.round(rand(rank + 1) * 8),
        rank: rank + 1,
        badge: rank === 0 ? "gold" : rank === 1 ? "silver" : rank === 2 ? "bronze" : null,
      });
    });

    customTasks.push({
      id: uuid(`task:custom:${b.code}:1`),
      template_id: openingTpl.id,
      location_id: loc.id,
      location_code: b.code,
      title: `Eid weekend staffing plan review — ${b.mall}`,
      checklist_date: "2026-06-20",
      checklist_kind: "custom",
      due_at: isoAt(20, 14, 0),
      status: "open",
      assigned_to: bm?.user_id ?? null,
      submitted_by: null,
      submitted_at: null,
    });
    customTasks.push({
      id: uuid(`task:custom:${b.code}:2`),
      template_id: closingTpl.id,
      location_id: loc.id,
      location_code: b.code,
      title: `Mall landlord audit prep — ${b.mall}`,
      checklist_date: "2026-06-25",
      checklist_kind: "custom",
      due_at: isoAt(25, 10, 0),
      status: "submitted",
      assigned_to: sup?.user_id ?? null,
      submitted_by: sup?.user_id ?? null,
      submitted_at: isoAt(25, 16, 30),
    });
  }

  return {
    locations,
    attractions,
    assets,
    staff,
    profiles,
    userRoles,
    taskTemplates,
    taskTemplateItems,
    taskInstances: [...taskInstances, ...customTasks],
    taskItemResults,
    shifts,
    financialSnapshots,
    transactions,
    complaints,
    tickets,
    workOrders,
    incidents,
    purchaseOrders,
    inventoryItems,
    staffLeaderboard,
    supervisorKpis,
  };
}

function writeAllCsvs(data) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  writeCsv("locations.csv", ["id", "code", "name", "city", "region", "country", "timezone", "gla_sqm", "status", "launched_on", "surge_mode"], data.locations);

  writeCsv("attractions.csv", ["id", "location_id", "location_code", "code", "name", "category", "capacity", "throughput_per_hour", "status"], data.attractions);

  writeCsv("assets.csv", ["id", "location_id", "location_code", "attraction_id", "tag", "name", "category", "manufacturer", "model", "criticality", "installed_on", "warranty_expires_on"], data.assets);

  writeCsv("staff.csv", ["id", "location_id", "location_code", "user_id", "employee_code", "full_name", "job_title", "department", "hire_date", "status", "phone", "email", "qid", "app_role"], data.staff);

  writeCsv("profiles.csv", ["id", "display_name", "employee_code", "phone", "preferred_language", "email", "qid", "job_title", "has_auth"], data.profiles);

  writeCsv("user_roles.csv", ["id", "user_id", "role", "role_level", "location_ids", "location_scope"], data.userRoles);

  writeCsv("task_templates.csv", ["id", "location_id", "location_code", "title", "kind", "description", "active"], data.taskTemplates);

  writeCsv("task_template_items.csv", ["id", "template_id", "location_code", "template_kind", "position", "label", "requires_photo", "required"], data.taskTemplateItems);

  writeCsv("task_instances.csv", ["id", "template_id", "location_id", "location_code", "title", "checklist_date", "checklist_kind", "due_at", "status", "assigned_to", "submitted_by", "submitted_at"], data.taskInstances);

  writeCsv("task_item_results.csv", ["id", "instance_id", "item_id", "checked", "photo_path", "note", "completed_by", "completed_at"], data.taskItemResults);

  writeCsv("shifts.csv", ["id", "location_id", "location_code", "user_id", "employee_code", "staff_name", "role_label", "starts_at", "ends_at", "status", "clock_in_at", "clock_out_at", "notes"], data.shifts);

  writeCsv("financial_snapshots.csv", ["id", "location_id", "location_code", "period_kind", "period_start", "revenue", "cogs", "labor", "rent", "utilities", "marketing", "other_opex", "ebitda", "footfall"], data.financialSnapshots);

  writeCsv("transactions.csv", ["id", "location_id", "location_code", "occurred_at", "channel", "category", "payment_method", "amount", "currency", "cashier_id"], data.transactions);

  writeCsv("complaints.csv", ["id", "location_id", "location_code", "channel", "severity", "category", "summary", "guest_name", "guest_contact", "status", "resolution_notes", "resolved_at", "created_at"], data.complaints);

  writeCsv("tickets.csv", ["id", "location_id", "location_code", "asset_id", "title", "description", "category", "priority", "status", "reported_by", "assigned_to", "sla_due_at", "resolved_at", "created_at"], data.tickets);

  writeCsv("work_orders.csv", ["id", "location_id", "location_code", "asset_id", "ticket_id", "title", "description", "kind", "status", "assigned_to", "planned_start", "planned_end", "actual_start", "actual_end", "planned_hours", "actual_hours"], data.workOrders);

  writeCsv("incidents.csv", ["id", "location_id", "location_code", "occurred_at", "category", "severity", "summary", "detail", "status", "rca_root_cause", "rca_actions", "closed_at", "reported_by"], data.incidents);

  writeCsv("purchase_orders.csv", ["id", "location_id", "location_code", "po_number", "vendor_name", "category", "description", "amount", "currency", "status", "requested_by"], data.purchaseOrders);

  writeCsv("inventory_items.csv", ["id", "location_id", "location_code", "sku", "item_name", "category", "unit", "quantity_on_hand", "reorder_level", "reorder_quantity", "last_counted_on", "status", "unit_cost_qar"], data.inventoryItems);

  writeCsv("staff_leaderboard.csv", ["id", "profile_id", "location_id", "location_code", "employee_code", "staff_name", "period_start", "period_end", "tasks_completed", "incidents_resolved", "complaints_handled", "bookings_created", "overall_score", "rank", "badge"], data.staffLeaderboard);

  writeCsv("supervisor_kpis.csv", ["id", "location_id", "location_code", "supervisor_employee_code", "supervisor_name", "period_month", "checklist_completion_pct", "staff_attendance_pct", "complaint_resolution_hours_avg", "maintenance_sla_pct", "revenue_vs_target_pct", "incidents_reported", "tasks_assigned", "tasks_completed", "status"], data.supervisorKpis);

  return {
    locations: data.locations.length,
    attractions: data.attractions.length,
    assets: data.assets.length,
    staff: data.staff.length,
    profiles: data.profiles.length,
    user_roles: data.userRoles.length,
    task_templates: data.taskTemplates.length,
    task_template_items: data.taskTemplateItems.length,
    task_instances: data.taskInstances.length,
    task_item_results: data.taskItemResults.length,
    shifts: data.shifts.length,
    financial_snapshots: data.financialSnapshots.length,
    transactions: data.transactions.length,
    complaints: data.complaints.length,
    tickets: data.tickets.length,
    work_orders: data.workOrders.length,
    incidents: data.incidents.length,
    purchase_orders: data.purchaseOrders.length,
    inventory_items: data.inventoryItems.length,
    staff_leaderboard: data.staffLeaderboard.length,
    supervisor_kpis: data.supervisorKpis.length,
  };
}

if (isDirectRun) {
  const data = generateDemoData();
  const counts = writeAllCsvs(data);
  console.log("Demo data written to demo-data/");
  console.log(JSON.stringify(counts, null, 2));
}

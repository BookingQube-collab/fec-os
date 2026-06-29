/**
 * Seed E3 AMC & Compliance Tracker items for all six FEC locations.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-e3-compliance-items.mjs
 *   node --env-file=.env.local scripts/seed-e3-compliance-items.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!dryRun && (!url || !serviceKey)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = dryRun
  ? null
  : createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

const LOCATIONS = [
  "InflataPark City Center",
  "KDS City Center",
  "Urban Arena Doha Mall",
  "Crayons & Bricks Vendome",
  "Crayons & Bricks Dar Al Salam",
  "Carousel Aspire Park",
];

const LOCATION_AREAS = {
  "InflataPark City Center": ["Whole Area", "Play Ground", "Cafe"],
  "KDS City Center": ["Whole Area", "Center", "Cafe"],
  "Urban Arena Doha Mall": ["Whole Area", "Play Ground", "Center"],
  "Crayons & Bricks Vendome": ["Whole Area", "Play Ground", "Cafe"],
  "Crayons & Bricks Dar Al Salam": ["Whole Area", "Play Ground", "Cafe"],
  "Carousel Aspire Park": ["Whole Area", "Center", "Play Ground"],
};

const CATEGORIES = [
  "QCDD",
  "E3 Compliance",
  "Fire Alarm",
  "Pest Control",
  "AC Cleaning",
  "CCTV",
  "POS",
  "Kitchen Hood",
  "Waste Management",
  "Kitchen Maintenance",
  "Third Party Certification",
];

const VENDORS = {
  "Fire Alarm": "Qatar Fire Systems LLC",
  "Pest Control": "SafeGuard Pest Qatar",
  "AC Cleaning": "CoolAir HVAC Services",
  CCTV: "VisionTech Security",
  POS: "RetailPro IT Solutions",
  "Kitchen Hood": "Gulf Kitchen Hygiene",
  "Waste Management": "EcoWaste Qatar",
  "Kitchen Maintenance": "ProKitchen Maint.",
  "Third Party Certification": "Bureau Veritas Qatar",
  QCDD: "Qatar Civil Defence (QCDD)",
  "E3 Compliance": "Ministry of Commerce",
};

const OWNERS = ["HR & Admin", "Facilities & Maintenance", "Operations Manager"];

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(base, months) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const baseYear = today.getFullYear();

function buildItems() {
  const rows = [];
  let seq = 1;

  for (const location of LOCATIONS) {
    const areas = LOCATION_AREAS[location];
    for (const category of CATEGORIES) {
      for (const area of areas) {
        if (category === "Kitchen Hood" && area === "Play Ground") continue;
        if (category === "Kitchen Maintenance" && area !== "Cafe") continue;
        if (category === "Waste Management" && area === "Center") continue;
        if (category === "POS" && area !== "Whole Area" && area !== "Cafe") continue;
        if ((category === "QCDD" || category === "E3 Compliance") && area !== "Whole Area") continue;

        const id = `C${String(seq).padStart(3, "0")}`;
        seq += 1;

        const vendor = VENDORS[category] ?? "General Vendor";
        const owner =
          category === "QCDD" || category === "E3 Compliance"
            ? "HR & Admin"
            : category === "POS"
              ? "Operations Manager"
              : OWNERS[seq % OWNERS.length];

        const isLicense = category === "QCDD" || category === "E3 Compliance";
        const freq = isLicense
          ? "Annual"
          : category === "Pest Control"
            ? "Monthly"
            : category === "AC Cleaning"
              ? "Quarterly"
              : category === "Fire Alarm" || category === "CCTV"
                ? "Annual"
                : "TBD";

        const contractStart = addMonths(`${baseYear}-01-15`, -(seq % 18));
        const contractEnd = addMonths(contractStart, 12);
        const issueDate = addMonths(contractStart, -1);
        let expiryDate = addDays(today, (seq * 17) % 200 - 30);

        if (seq % 11 === 0) expiryDate = null;
        if (seq % 13 === 0) expiryDate = addDays(today, -15);
        if (seq % 7 === 0) expiryDate = addDays(today, 20);
        if (seq % 9 === 0) expiryDate = addDays(today, 45);
        if (seq % 5 === 0) expiryDate = addDays(today, 75);

        const lastService = isLicense ? null : addMonths(contractStart, seq % 6);
        const nextService = isLicense ? null : addMonths(lastService ?? contractStart, freq === "Monthly" ? 1 : 3);

        rows.push({
          id,
          location,
          area,
          category,
          item: isLicense
            ? `${category} Certificate — ${location.split(" ")[0]}`
            : `${category} AMC — ${area}`,
          vendor,
          contract_start: isLicense ? null : contractStart,
          contract_end: isLicense ? null : contractEnd,
          last_service: lastService,
          next_service: nextService,
          issue_date: isLicense ? issueDate : null,
          expiry_date: expiryDate,
          frequency: freq,
          owner,
          remarks: seq % 8 === 0 ? "Renewal quote pending from vendor" : null,
          drive_link: seq % 6 === 0 ? null : `https://drive.google.com/file/d/demo-${id}`,
        });
      }
    }
  }

  return rows;
}

async function main() {
  const rows = buildItems();
  console.log(`Prepared ${rows.length} e3_compliance_items rows.`);

  if (dryRun) {
    const byLoc = Object.fromEntries(LOCATIONS.map((l) => [l, 0]));
    for (const r of rows) byLoc[r.location] += 1;
    console.log("By location:", byLoc);
    return;
  }

  const { error: delErr } = await admin.from("e3_compliance_items").delete().like("id", "C%");
  if (delErr && !delErr.message.includes("does not exist")) throw delErr;

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await admin.from("e3_compliance_items").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }

  console.log(`Seeded ${rows.length} rows into e3_compliance_items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

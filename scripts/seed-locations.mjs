/**
 * Upserts Qatar FEC branch locations via Supabase service role.
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-locations.mjs
 */
import { createClient } from "@supabase/supabase-js";

const LOCATIONS = [
  {
    code: "KDS-CC",
    name: "Kids Driving School",
    city: "Doha",
    region: "City Center Doha",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2022-03-15",
  },
  {
    code: "INF-CC",
    name: "Inflatapark",
    city: "Doha",
    region: "City Center Doha",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2022-06-01",
  },
  {
    code: "UA-DM",
    name: "Urban Arena",
    city: "Doha",
    region: "Doha Mall",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2023-01-10",
  },
  {
    code: "CB-VM",
    name: "Crayons & Bricks",
    city: "Doha",
    region: "Vendome Mall",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2023-04-20",
  },
  {
    code: "CB-DSM",
    name: "Crayons & Bricks",
    city: "Doha",
    region: "Dar Al Salam Mall",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2023-09-01",
  },
  {
    code: "CAR-AP",
    name: "Carousel",
    city: "Doha",
    region: "Aspire Park",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2024-02-14",
  },
];

const ALLOWED_CODES = LOCATIONS.map((loc) => loc.code);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: allLocations, error: listAllError } = await admin
  .from("locations")
  .select("id, code, status");

if (listAllError) {
  console.error("Failed to list locations:", listAllError.message);
  process.exit(1);
}

const toClose = (allLocations ?? []).filter(
  (row) => !ALLOWED_CODES.includes(row.code) && row.status !== "closed",
);

if (toClose.length > 0) {
  const { error: closeError } = await admin
    .from("locations")
    .update({ status: "closed" })
    .in(
      "id",
      toClose.map((row) => row.id),
    );

  if (closeError) {
    console.error("Failed to close extra locations:", closeError.message);
    process.exit(1);
  }

  console.log(`Closed ${toClose.length} non-Qatar location(s):`);
  for (const row of toClose) {
    console.log(`  ${row.code}`);
  }
} else {
  console.log("No extra active locations to close.");
}

for (const loc of LOCATIONS) {
  const { data: existing, error: fetchError } = await admin
    .from("locations")
    .select("id")
    .eq("code", loc.code)
    .maybeSingle();

  if (fetchError) {
    console.error(`Failed to read ${loc.code}:`, fetchError.message);
    process.exit(1);
  }

  if (existing) {
    const { error: updateError } = await admin.from("locations").update(loc).eq("id", existing.id);
    if (updateError) {
      console.error(`Failed to update ${loc.code}:`, updateError.message);
      process.exit(1);
    }
    console.log(`Updated ${loc.code} (${loc.name})`);
  } else {
    const { error: insertError } = await admin.from("locations").insert(loc);
    if (insertError) {
      console.error(`Failed to insert ${loc.code}:`, insertError.message);
      process.exit(1);
    }
    console.log(`Inserted ${loc.code} (${loc.name})`);
  }
}

const { data: active, error: listError } = await admin
  .from("locations")
  .select("code, name, region, status")
  .eq("status", "active")
  .order("code");

if (listError) {
  console.error("Failed to list active locations:", listError.message);
  process.exit(1);
}

console.log(`\nActive locations (${active.length}):`);
for (const row of active) {
  console.log(`  ${row.code} — ${row.name} @ ${row.region}`);
}

if (active.length !== ALLOWED_CODES.length) {
  console.error(
    `\nExpected ${ALLOWED_CODES.length} active locations, found ${active.length}.`,
  );
  process.exit(1);
}

console.log("\nLocation seed complete.");

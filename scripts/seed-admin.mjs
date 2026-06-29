/**
 * Creates the default FEC admin user (admin@fec.com) via Supabase Admin API.
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-admin.mjs
 */
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@fec.com";
const ADMIN_PASSWORD = "123456";
const ADMIN_ROLE = "ceo";
const ADMIN_ROLE_LEVEL = 100;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error("Failed to list users:", listError.message);
  process.exit(1);
}

let userId = existing.users.find((u) => u.email === ADMIN_EMAIL)?.id;

if (userId) {
  console.log(`User ${ADMIN_EMAIL} already exists (${userId}).`);
} else {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Admin" },
  });

  if (createError) {
    console.error("Failed to create user:", createError.message);
    process.exit(1);
  }

  userId = created.user.id;
  console.log(`Created user ${ADMIN_EMAIL} (${userId}).`);
}

const { data: roles, error: rolesError } = await admin
  .from("user_roles")
  .select("role")
  .eq("user_id", userId);

if (rolesError) {
  console.error("Failed to read user_roles:", rolesError.message);
  process.exit(1);
}

if (!roles?.some((r) => r.role === ADMIN_ROLE)) {
  const { error: insertError } = await admin.from("user_roles").insert({
    user_id: userId,
    role: ADMIN_ROLE,
    role_level: ADMIN_ROLE_LEVEL,
  });

  if (insertError) {
    console.error("Failed to assign role:", insertError.message);
    process.exit(1);
  }

  console.log(`Assigned ${ADMIN_ROLE} role (level ${ADMIN_ROLE_LEVEL}).`);
} else {
  console.log(`${ADMIN_ROLE} role already assigned.`);
}

console.log("Admin seed complete.");

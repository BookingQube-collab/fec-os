/**
 * Sets Admin AI routing: primary=gemini, secondary=openrouter.
 * Never prints key material — only yes/no and status fields.
 *
 * Usage: node --env-file=.env.local scripts/configure-ai-routing-gemini.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function summary(row) {
  return {
    code: row.provider_code,
    enabled: Boolean(row.enabled),
    has_key: Boolean(row.encrypted_api_key),
    connection_status: row.connection_status,
    selected_model: row.selected_model,
  };
}

const { data: providers, error: providersErr } = await admin
  .from("ai_provider_configs")
  .select(
    "provider_code, enabled, encrypted_api_key, connection_status, selected_model, key_last_four",
  )
  .order("provider_code");

if (providersErr) {
  console.error("Failed to load providers:", providersErr.message);
  process.exit(1);
}

const rows = providers ?? [];
console.log("providers_before:");
for (const row of rows) {
  const s = summary(row);
  console.log(
    `  ${s.code}: has_key=${s.has_key} enabled=${s.enabled} status=${s.connection_status} model=${s.selected_model ?? "null"}`,
  );
}

const byCode = Object.fromEntries(rows.map((r) => [r.provider_code, r]));
const gemini = byCode.gemini;
const openrouter = byCode.openrouter;

console.log(`gemini_key_present: ${Boolean(gemini?.encrypted_api_key)}`);
console.log(`openrouter_key_present: ${Boolean(openrouter?.encrypted_api_key)}`);

// Enable configured providers so they can enter the fallback chain after a successful Test Connection.
for (const code of ["gemini", "openrouter"]) {
  const row = byCode[code];
  if (!row?.encrypted_api_key) continue;
  if (row.enabled) continue;
  const { error } = await admin
    .from("ai_provider_configs")
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .eq("provider_code", code);
  if (error) {
    console.error(`Failed to enable ${code}:`, error.message);
    process.exit(1);
  }
  console.log(`enabled ${code}`);
}

const { data: routingRows, error: routingErr } = await admin
  .from("ai_routing_settings")
  .select("id, primary_provider, secondary_provider, tertiary_provider, auto_fallback, timeout_ms, max_retries")
  .limit(1);

if (routingErr) {
  console.error("Failed to load routing:", routingErr.message);
  process.exit(1);
}

let routing = routingRows?.[0];
if (!routing) {
  const { data: created, error: insertErr } = await admin
    .from("ai_routing_settings")
    .insert({
      primary_provider: null,
      secondary_provider: null,
      tertiary_provider: null,
      timeout_ms: 30_000,
      max_retries: 1,
      auto_fallback: true,
    })
    .select("id, primary_provider, secondary_provider, tertiary_provider, auto_fallback, timeout_ms, max_retries")
    .single();
  if (insertErr) {
    console.error("Failed to create routing row:", insertErr.message);
    process.exit(1);
  }
  routing = created;
}

console.log("routing_before:", {
  primary: routing.primary_provider,
  secondary: routing.secondary_provider,
  tertiary: routing.tertiary_provider,
  auto_fallback: routing.auto_fallback,
});

const nextPrimary = gemini?.encrypted_api_key ? "gemini" : null;
const nextSecondary = openrouter?.encrypted_api_key ? "openrouter" : null;

const { error: updateErr } = await admin
  .from("ai_routing_settings")
  .update({
    primary_provider: nextPrimary,
    secondary_provider: nextSecondary,
    tertiary_provider: null,
    auto_fallback: true,
    updated_at: new Date().toISOString(),
  })
  .eq("id", routing.id);

if (updateErr) {
  console.error("Failed to update routing:", updateErr.message);
  process.exit(1);
}

console.log("routing_after:", {
  primary: nextPrimary,
  secondary: nextSecondary,
  tertiary: null,
  auto_fallback: true,
});

// Point call-center Run-test default model at Gemini Flash when still on OpenAI mini.
const { data: ccRows, error: ccErr } = await admin
  .from("call_center_settings")
  .select("id, ai_model")
  .limit(1);

if (ccErr) {
  console.error("Failed to load call_center_settings:", ccErr.message);
  process.exit(1);
}

const cc = ccRows?.[0];
if (cc && (!cc.ai_model || cc.ai_model === "gpt-4o-mini")) {
  const { error: ccUpdateErr } = await admin
    .from("call_center_settings")
    .update({ ai_model: "gemini-flash-latest", updated_at: new Date().toISOString() })
    .eq("id", cc.id);
  if (ccUpdateErr) {
    console.error("Failed to update call_center ai_model:", ccUpdateErr.message);
    process.exit(1);
  }
  console.log(`call_center_ai_model: ${cc.ai_model ?? "null"} -> gemini-flash-latest`);
} else if (cc) {
  console.log(`call_center_ai_model: unchanged (${cc.ai_model})`);
} else {
  console.log("call_center_ai_model: no settings row");
}

const needsTest = ["gemini", "openrouter"].filter((code) => {
  const row = byCode[code];
  return row?.encrypted_api_key && row.connection_status !== "connected";
});

if (needsTest.length) {
  console.log(
    `note: ${needsTest.join(", ")} have keys but connection_status is not connected — open Admin → AI Integrations → Test Connection so they become routing-eligible at runtime.`,
  );
} else {
  console.log("note: gemini/openrouter already connected (or missing keys).");
}

console.log("done");

/**
 * Encrypts GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY from .env.local
 * into ai_provider_configs. Never logs key material.
 *
 * Usage: node --env-file=.env.local scripts/seed-ai-provider-keys.mjs
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PROVIDERS = [
  { code: "gemini", env: "GEMINI_API_KEY", name: "Google Gemini", model: "gemini-flash-latest", base: "https://generativelanguage.googleapis.com/v1beta" },
  { code: "groq", env: "GROQ_API_KEY", name: "Groq", model: "llama-3.3-70b-versatile", base: "https://api.groq.com/openai/v1" },
  { code: "openrouter", env: "OPENROUTER_API_KEY", name: "OpenRouter", model: "openrouter/free", base: "https://openrouter.ai/api/v1" },
];

function parseKey(raw) {
  const value = raw?.trim() ?? "";
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  const buf = Buffer.from(value, "base64");
  if (buf.length === 32) return buf;
  throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (openssl rand -hex 32).");
}

function encryptSecret(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const master = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!master) {
  console.error("Missing AI_CREDENTIALS_ENCRYPTION_KEY.");
  process.exit(1);
}

const key = parseKey(master);
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let imported = 0;
for (const provider of PROVIDERS) {
  const apiKey = process.env[provider.env]?.trim();
  if (!apiKey) {
    console.log(`skip ${provider.code}: env not set`);
    continue;
  }
  const { error } = await admin.from("ai_provider_configs").upsert(
    {
      provider_code: provider.code,
      display_name: provider.name,
      encrypted_api_key: encryptSecret(apiKey, key),
      key_last_four: apiKey.slice(-4),
      selected_model: provider.model,
      base_url: provider.base,
      connection_status: "untested",
      last_test_result: "Key imported from server env — test connection before using as primary.",
      last_tested_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_code" },
  );
  if (error) {
    console.error(`failed ${provider.code}: ${error.message}`);
    process.exit(1);
  }
  imported += 1;
  console.log(`imported ${provider.code} (masked)`);
}

console.log(`done: ${imported} provider key(s) stored encrypted`);

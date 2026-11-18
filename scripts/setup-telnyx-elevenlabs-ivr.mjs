/**
 * Set up Telnyx Integration Secret for ElevenLabs IVR Speak/Say.
 *
 * After this, set Vercel Production env:
 *   TELNYX_ELEVENLABS_API_KEY_REF=<identifier>
 * Redeploy. FEC auto-upgrades Polly Joanna / Azure Fatima → ElevenLabs Rachel / Charlotte.
 *
 * Usage:
 *   # Print steps only (no API calls):
 *   node scripts/setup-telnyx-elevenlabs-ivr.mjs
 *
 *   # Create/update Telnyx secret (needs both keys):
 *   set TELNYX_API_KEY=KEY
 *   set ELEVENLABS_API_KEY=KEY
 *   node scripts/setup-telnyx-elevenlabs-ivr.mjs --create
 *
 *   # Custom secret identifier:
 *   node scripts/setup-telnyx-elevenlabs-ivr.mjs --create --id=elevenlabs_api_key
 *
 * Does not print secret values. Does not touch IVR_OSS_PLAY_* (Piper stays off).
 */

const TELNYX_API = "https://api.telnyx.com/v2";
const DEFAULT_ID = "elevenlabs_api_key";

const args = new Set(process.argv.slice(2));
const create = args.has("--create");
const idArg = [...args].find((a) => a.startsWith("--id="));
const identifier = (idArg?.slice("--id=".length) || process.env.TELNYX_ELEVENLABS_API_KEY_REF || DEFAULT_ID).trim();

const telnyxKey = process.env.TELNYX_API_KEY?.trim() || "";
const elevenKey = process.env.ELEVENLABS_API_KEY?.trim() || "";

console.log(`
=== FEC → Telnyx ElevenLabs IVR setup ===

Goal: humanized IVR tone via Telnyx <Speak>/<Say> (NOT Piper /ivr/ Play).

Defaults after TELNYX_ELEVENLABS_API_KEY_REF is set:
  EN  ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM  (Rachel)
  AR  ElevenLabs.eleven_multilingual_v2.XB0fDUnXU5powFXDhCwa  (Charlotte)
Soft-fail: Polly.Joanna-Neural / Azure.ar-AE-FatimaNeural

True Qatari dialect: upload human MP3/WAV on IVR Builder + bridge (non-/ivr/ HTTPS).

--- Manual steps ---
1) ElevenLabs paid account → copy API key
2) Telnyx Mission Control → Integration Secrets → create secret
   identifier: ${identifier}
   value:     <ElevenLabs API key>
   OR run: node scripts/setup-telnyx-elevenlabs-ivr.mjs --create
3) Vercel → Project e3fec → Settings → Environment Variables → Production:
   TELNYX_ELEVENLABS_API_KEY_REF=${identifier}
4) Redeploy Production
5) Call the DID — Language menu should sound ElevenLabs (not Joanna)
`);

if (!create) {
  console.log("Tip: pass --create with TELNYX_API_KEY + ELEVENLABS_API_KEY to create the secret via API.");
  process.exit(0);
}

if (!telnyxKey) {
  console.error("Missing TELNYX_API_KEY (needed to POST /v2/integration_secrets).");
  process.exit(1);
}
if (!elevenKey) {
  console.error("Missing ELEVENLABS_API_KEY (the value stored inside Telnyx — never put this in Vercel).");
  process.exit(1);
}

const body = JSON.stringify({
  identifier,
  value: elevenKey,
  type: "bearer",
});

const res = await fetch(`${TELNYX_API}/integration_secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${telnyxKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body,
});

const text = await res.text().catch(() => "");
if (!res.ok) {
  // 422 often means identifier already exists — that is fine if the value is current.
  console.error(`Telnyx integration_secrets failed HTTP ${res.status}: ${text.slice(0, 400)}`);
  console.error(`
If the identifier already exists, keep using it:
  TELNYX_ELEVENLABS_API_KEY_REF=${identifier}
Or delete/recreate the secret in Mission Control, then re-run --create.
`);
  process.exit(1);
}

console.log(`Created Telnyx Integration Secret identifier="${identifier}".`);
console.log(`
Set this on Vercel Production (and redeploy):
  TELNYX_ELEVENLABS_API_KEY_REF=${identifier}

Do NOT set the raw ElevenLabs API key on Vercel — only the Telnyx secret identifier.
`);

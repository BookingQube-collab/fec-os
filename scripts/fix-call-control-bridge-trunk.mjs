/**
 * Call Control bridge requires a wildcard LiveKit inbound trunk.
 * Telnyx transfers to sip:<roomUser>@<livekit-sip-host> — that user part is NOT the DID.
 * An inbound trunk with numbers=["+1870…"] rejects the INVITE → agent Connected, dead air.
 *
 * Usage: node --env-file=.env.local scripts/fix-call-control-bridge-trunk.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { SipClient } from "livekit-server-sdk";

const LIVEKIT_SETTINGS_ID = "00000000-0000-4000-8000-0000000000c4";
const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function liveKitHttpUrl(serverUrl) {
  return String(serverUrl)
    .trim()
    .replace(/^wss:\/\//i, "https://")
    .replace(/^ws:\/\//i, "http://");
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: lk, error: lkErr } = await sb
  .from("chat_livekit_settings")
  .select("enabled, server_url, api_key, api_secret")
  .eq("id", LIVEKIT_SETTINGS_ID)
  .maybeSingle();
if (lkErr) throw new Error(lkErr.message);
if (!lk?.enabled || !lk.server_url || !lk.api_key || !lk.api_secret) {
  console.error("LiveKit credentials missing/disabled.");
  process.exit(1);
}

const { data: cc, error: ccErr } = await sb
  .from("call_center_settings")
  .select("inbound_mode, livekit_sip_inbound_trunk_id")
  .eq("id", CALL_CENTER_SETTINGS_ID)
  .maybeSingle();
if (ccErr) throw new Error(ccErr.message);

const trunkId = (cc?.livekit_sip_inbound_trunk_id || "").trim();
if (!trunkId) {
  console.error("livekit_sip_inbound_trunk_id not set.");
  process.exit(1);
}

const sip = new SipClient(liveKitHttpUrl(lk.server_url), lk.api_key, lk.api_secret);
const beforeList = await sip.listSipInboundTrunk({ trunkIds: [trunkId] });
const before = beforeList.find((t) => t?.sipTrunkId === trunkId);
if (!before) {
  console.error(`Inbound trunk ${trunkId} not found.`);
  process.exit(1);
}

const numbersBefore = before.numbers ?? [];
let numbersAfter = numbersBefore;
if (numbersBefore.length > 0) {
  const updated = await sip.updateSipInboundTrunkFields(trunkId, {
    // Empty `set: []` is rejected; use clear to accept any destination (room user URI).
    numbers: { clear: true },
    name: before.name?.includes("bridge") ? before.name : `${before.name || "E3 SIP"} (CC bridge)`,
  });
  numbersAfter = updated.numbers ?? [];
}

console.log(
  JSON.stringify(
    {
      ok: numbersAfter.length === 0,
      inboundMode: cc?.inbound_mode,
      trunkId,
      nameBefore: before.name,
      numbersBefore,
      numbersAfter,
      allowedAddresses: before.allowedAddresses ?? [],
      note:
        numbersAfter.length === 0
          ? "Wildcard inbound trunk ready — Call Control transfer to sip:<room>@host will match."
          : "Failed to clear trunk numbers — Call Control bridge will still dead-air.",
    },
    null,
    2,
  ),
);

if (numbersAfter.length !== 0) process.exit(1);

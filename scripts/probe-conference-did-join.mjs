/**
 * Probe: LiveKit createSipParticipant dials our DID (same direction as Answer bridge join).
 * Expect Telnyx TeXML to answer the DID. Does not require a live customer conference.
 *
 * Usage: node --env-file=.env.local scripts/probe-conference-did-join.mjs
 * Exit 0 = SIP answered into a LiveKit room; exit 2 = dial/answer failed.
 */
import { SipClient, RoomServiceClient } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
const LIVEKIT_SETTINGS_ID = "00000000-0000-4000-8000-0000000000c4";

const sb = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const [{ data: cc }, { data: lk }] = await Promise.all([
  sb
    .from("call_center_settings")
    .select("livekit_sip_trunk_id, outbound_caller_id_e164, telnyx_sip_uri")
    .eq("id", CALL_CENTER_SETTINGS_ID)
    .maybeSingle(),
  sb
    .from("chat_livekit_settings")
    .select("server_url, api_key, api_secret")
    .eq("id", LIVEKIT_SETTINGS_ID)
    .maybeSingle(),
]);

const trunkId = cc?.livekit_sip_trunk_id?.trim();
const did = cc?.outbound_caller_id_e164?.trim();
const httpUrl = String(lk?.server_url || "")
  .replace(/^wss:/i, "https:")
  .replace(/^ws:/i, "http:");

if (!trunkId || !did || !httpUrl || !lk?.api_key || !lk?.api_secret) {
  console.error("Missing trunk / DID / LiveKit settings");
  process.exit(1);
}

const rooms = new RoomServiceClient(httpUrl, lk.api_key, lk.api_secret);
const sip = new SipClient(httpUrl, lk.api_key, lk.api_secret);
const roomName = `cc-probe-conf-${Date.now().toString(36)}`;
const identity = `sip-probe-conf-${Date.now().toString(36)}`;

console.log("probe conference DID join", {
  roomName,
  did,
  trunkId: trunkId.slice(0, 10) + "…",
});

await rooms.createRoom({ name: roomName, emptyTimeout: 120 });

let answered = false;
let error = null;
try {
  const info = await sip.createSipParticipant(trunkId, did, roomName, {
    participantIdentity: identity,
    participantName: "probe-conf-join",
    fromNumber: did,
    playDialtone: false,
    waitUntilAnswered: true,
    ringingTimeout: 35,
    timeout: 50,
    headers: {
      "X-FEC-Bridge": "1",
      "X-FEC-Conference": "probe-unused",
    },
  });
  answered = true;
  console.log("answered", {
    identity: info.participantIdentity || identity,
    sipCallId: info.sipCallId || null,
  });
} catch (e) {
  error = e instanceof Error ? e.message : String(e);
  console.error("createSipParticipant failed:", error);
}

try {
  await rooms.deleteRoom(roomName);
} catch {
  // ignore
}

if (!answered) {
  console.error("RESULT: DID join failed (exit 2)");
  process.exit(2);
}
console.log("RESULT: DID join answered (exit 0)");
process.exit(0);

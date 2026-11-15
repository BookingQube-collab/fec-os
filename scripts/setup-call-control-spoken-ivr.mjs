/**
 * Enable Telnyx Call Control inbound (spoken IVR via Telnyx TTS/gather)
 * for +18704772102 without a LiveKit Agents worker.
 *
 * - Fixes Call Control app webhook → /api/public/call-center/telnyx
 * - Ensures a LiveKit callee dispatch rule (cc-) for agent-answer bridge
 * - Points DID at the Call Control application
 * - Sets call_center_settings.inbound_mode = telnyx_call_control
 *
 * Usage: node --env-file=.env.local scripts/setup-call-control-spoken-ivr.mjs
 * Does not print secrets. Does not commit.
 */
import { createClient } from "@supabase/supabase-js";
import { SipClient } from "livekit-server-sdk";

const LIVEKIT_SETTINGS_ID = "00000000-0000-4000-8000-0000000000c4";
const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
const DID = process.env.CALL_CENTER_SETUP_DID?.trim() || "+18704772102";
const WEBHOOK_BASE = "https://e3fec.vercel.app/api/public/call-center/telnyx";
const CALL_CONTROL_APP_ID = "3091583881162261835"; // E3 Call Center
const ROOM_PREFIX = "cc-";
const CALLEE_RULE_NAME = "fec-callee-bridge";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
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
  console.error("LiveKit credentials missing/disabled in chat_livekit_settings.");
  process.exit(1);
}

const { data: cc, error: ccErr } = await sb
  .from("call_center_settings")
  .select(
    "telnyx_api_key, telnyx_connection_id, inbound_mode, livekit_sip_dispatch_rule_id, livekit_sip_inbound_trunk_id, webhook_shared_secret, telnyx_webhook_secret",
  )
  .eq("id", CALL_CENTER_SETTINGS_ID)
  .maybeSingle();
if (ccErr) throw new Error(ccErr.message);

const telnyxKey = (cc?.telnyx_api_key || process.env.TELNYX_API_KEY || "").trim();
if (!telnyxKey) {
  console.error("Telnyx API key missing in call_center_settings / TELNYX_API_KEY.");
  process.exit(1);
}

const webhookSecret = (cc?.webhook_shared_secret || cc?.telnyx_webhook_secret || "").trim();
const WEBHOOK_URL = webhookSecret
  ? `${WEBHOOK_BASE}?secret=${encodeURIComponent(webhookSecret)}`
  : WEBHOOK_BASE;
if (!webhookSecret) {
  console.warn(
    "Warning: no webhook_shared_secret — Telnyx production webhooks may 401 unless TELNYX_PUBLIC_KEY is set.",
  );
}

const telnyxHeaders = {
  Authorization: `Bearer ${telnyxKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function telnyx(method, path, body) {
  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    method,
    headers: telnyxHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || res.statusText;
    throw new Error(`Telnyx ${method} ${path}: ${res.status} ${msg}`);
  }
  return json;
}

// --- 1) Call Control app webhook ---
const appBefore = await telnyx("GET", `/call_control_applications/${CALL_CONTROL_APP_ID}`);
const appData = appBefore?.data ?? {};
const webhookBefore = appData.webhook_event_url ?? null;
if (webhookBefore !== WEBHOOK_URL) {
  await telnyx("PATCH", `/call_control_applications/${CALL_CONTROL_APP_ID}`, {
    webhook_event_url: WEBHOOK_URL,
    webhook_event_failover_url: WEBHOOK_URL,
    webhook_api_version: "2",
  });
}

const appAfter = await telnyx("GET", `/call_control_applications/${CALL_CONTROL_APP_ID}`);

// --- 2) LiveKit callee dispatch rule for bridge ---
const sip = new SipClient(liveKitHttpUrl(lk.server_url), lk.api_key, lk.api_secret);
const allRules = await sip.listSipDispatchRule();
function summarize(r) {
  const inner = r?.rule?.rule;
  return {
    id: r.sipDispatchRuleId,
    name: r.name,
    case: inner?.case ?? null,
    roomPrefix: inner?.value?.roomPrefix ?? null,
    trunkIds: r.trunkIds ?? [],
  };
}
const summarized = (allRules || []).filter(Boolean).map(summarize);
let callee = summarized.find(
  (r) => r.case === "dispatchRuleCallee" && (r.roomPrefix === ROOM_PREFIX || r.roomPrefix === "cc-"),
);
if (!callee) {
  const created = await sip.createSipDispatchRule(
    {
      type: "callee",
      roomPrefix: ROOM_PREFIX,
      randomizeRoomName: false,
    },
    {
      name: CALLEE_RULE_NAME,
      trunkIds: [], // all trunks — transfer URI does not need inbound trunk binding
    },
  );
  callee = summarize(created);
}

// Call Control transfer uses sip:<roomUser>@host (not the DID). Inbound trunk must be wildcard.
const inboundTrunkId = (cc?.livekit_sip_inbound_trunk_id || "").trim();
let inboundTrunkFix = null;
if (inboundTrunkId) {
  const trunks = await sip.listSipInboundTrunk({ trunkIds: [inboundTrunkId] });
  const trunk = trunks.find((t) => t?.sipTrunkId === inboundTrunkId);
  if (trunk && (trunk.numbers?.length ?? 0) > 0) {
    const updated = await sip.updateSipInboundTrunkFields(inboundTrunkId, {
      numbers: { clear: true },
      name: trunk.name?.includes("bridge") ? trunk.name : `${trunk.name || "E3 SIP"} (CC bridge)`,
    });
    inboundTrunkFix = {
      id: inboundTrunkId,
      numbersBefore: trunk.numbers,
      numbersAfter: updated.numbers ?? [],
    };
  } else if (trunk) {
    inboundTrunkFix = { id: inboundTrunkId, numbersBefore: [], numbersAfter: [], alreadyWildcard: true };
  }
}

// --- 3) Point DID at Call Control app ---
const nums = await telnyx(
  "GET",
  `/phone_numbers?filter[phone_number]=${encodeURIComponent(DID)}`,
);
const num = nums?.data?.[0];
if (!num?.id) {
  console.error(`Telnyx number ${DID} not found.`);
  process.exit(1);
}
const connectionBefore = {
  id: num.connection_id,
  name: num.connection_name,
};
if (num.connection_id !== CALL_CONTROL_APP_ID) {
  await telnyx("PATCH", `/phone_numbers/${num.id}`, {
    connection_id: CALL_CONTROL_APP_ID,
  });
}
const numAfter = (
  await telnyx("GET", `/phone_numbers?filter[phone_number]=${encodeURIComponent(DID)}`)
)?.data?.[0];

// --- 4) FEC settings ---
const { error: updErr } = await sb
  .from("call_center_settings")
  .update({
    inbound_mode: "telnyx_call_control",
    telnyx_connection_id: CALL_CONTROL_APP_ID,
    livekit_sip_dispatch_rule_id: callee.id,
    // Keep SIP trunk ids; useful if switching back to telnyx_sip_trunk later.
  })
  .eq("id", CALL_CENTER_SETTINGS_ID);
if (updErr) throw new Error(updErr.message);

function redactWebhook(u) {
  return String(u || "")
    .replace(/([?&]secret=)[^&]*/gi, "$1***")
    .slice(0, 160);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      spokenIvrPath: "telnyx_call_control",
      callControlApp: {
        id: CALL_CONTROL_APP_ID,
        name: appAfter?.data?.application_name,
        webhookBefore: redactWebhook(webhookBefore),
        webhookAfter: redactWebhook(appAfter?.data?.webhook_event_url),
        hasSecretQuery: /[?&]secret=/.test(String(appAfter?.data?.webhook_event_url || "")),
      },
      did: {
        e164: DID,
        connectionBefore,
        connectionAfter: {
          id: numAfter?.connection_id,
          name: numAfter?.connection_name,
        },
      },
      livekitCalleeRule: callee,
      inboundTrunkFix,
      keptIndividualRules: summarized.filter((r) => r.case === "dispatchRuleIndividual"),
      settings: {
        inbound_mode: "telnyx_call_control",
        telnyx_connection_id: CALL_CONTROL_APP_ID,
        livekit_sip_dispatch_rule_id: callee.id,
      },
      note:
        "Inbound calls to DID now use Telnyx TTS/gather. Agent answer bridges via Telnyx transfer → LiveKit SIP (wildcard inbound trunk + callee rule). LiveKit webhook still needed for SIP CDR sync.",
    },
    null,
    2,
  ),
);

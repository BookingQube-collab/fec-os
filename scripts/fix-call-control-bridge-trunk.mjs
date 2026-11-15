/**
 * Call Control bridge needs:
 * 1) Wildcard LiveKit inbound trunk (empty numbers) — Telnyx transfers to sip:<roomUser>@host
 * 2) A callee dispatch rule bound to that trunk (roomPrefix cc-)
 * 3) NO individual dispatch rule on the same trunk — those steal INVITEs into
 *    cc-_+DID_<random> rooms while the agent joins cc-<callId> → dead air + phantom DID CDR
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
  .select("inbound_mode, livekit_sip_inbound_trunk_id, livekit_sip_dispatch_rule_id")
  .eq("id", CALL_CENTER_SETTINGS_ID)
  .maybeSingle();
if (ccErr) throw new Error(ccErr.message);

const trunkId = (cc?.livekit_sip_inbound_trunk_id || "").trim();
const ruleId = (cc?.livekit_sip_dispatch_rule_id || "").trim();
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

const allRules = (await sip.listSipDispatchRule()).filter(Boolean);
const removedIndividual = [];
for (const rule of allRules) {
  if (!rule?.sipDispatchRuleId || (ruleId && rule.sipDispatchRuleId === ruleId)) continue;
  const inner = rule.rule?.rule;
  const caseName = inner?.case ?? (inner?.dispatchRuleIndividual ? "dispatchRuleIndividual" : null);
  // SDK may surface oneof as { case, value } or as dispatchRuleIndividual key
  const isIndividual =
    caseName === "dispatchRuleIndividual" || Boolean(rule.rule?.dispatchRuleIndividual);
  if (!isIndividual) continue;
  const trunks = rule.trunkIds ?? [];
  if (trunks.length === 0 || trunks.includes(trunkId)) {
    try {
      await sip.deleteSipDispatchRule(rule.sipDispatchRuleId);
      removedIndividual.push(rule.sipDispatchRuleId);
    } catch (e) {
      removedIndividual.push(`${rule.sipDispatchRuleId}:delete-failed(${e.message})`);
    }
  }
}

let calleeAfter = null;
if (ruleId) {
  const list = await sip.listSipDispatchRule({ dispatchRuleIds: [ruleId] });
  const callee = list.find((r) => r?.sipDispatchRuleId === ruleId);
  if (callee) {
    const trunks = callee.trunkIds ?? [];
    if (!trunks.includes(trunkId)) {
      calleeAfter = await sip.updateSipDispatchRuleFields(ruleId, {
        trunkIds: { set: [trunkId] },
        name: callee.name?.includes("callee") ? callee.name : "fec-callee-bridge",
      });
    } else {
      calleeAfter = callee;
    }
  }
}

const rulesFinal = (await sip.listSipDispatchRule()).filter(Boolean).map((r) => {
  const inner = r.rule?.rule ?? r.rule;
  return {
    id: r.sipDispatchRuleId,
    name: r.name,
    trunks: r.trunkIds ?? [],
    case: inner?.case ?? Object.keys(inner || {}).find((k) => k.startsWith("dispatch")),
    prefix: inner?.value?.roomPrefix ?? inner?.dispatchRuleCallee?.roomPrefix ?? inner?.dispatchRuleIndividual?.roomPrefix,
  };
});

const wildcardOk = numbersAfter.length === 0;
const calleeOk = Boolean(
  calleeAfter &&
    (calleeAfter.trunkIds ?? []).includes(trunkId) &&
    (calleeAfter.rule?.rule?.case === "dispatchRuleCallee" ||
      calleeAfter.rule?.dispatchRuleCallee ||
      rulesFinal.some((r) => r.id === ruleId && r.case === "dispatchRuleCallee")),
);
const noIndividualOnTrunk = !rulesFinal.some(
  (r) =>
    r.case === "dispatchRuleIndividual" &&
    (r.trunks.length === 0 || r.trunks.includes(trunkId)),
);

console.log(
  JSON.stringify(
    {
      ok: wildcardOk && calleeOk && noIndividualOnTrunk,
      inboundMode: cc?.inbound_mode,
      trunkId,
      nameBefore: before.name,
      numbersBefore,
      numbersAfter,
      allowedAddresses: before.allowedAddresses ?? [],
      dispatchRuleId: ruleId,
      removedIndividual,
      calleeTrunks: calleeAfter?.trunkIds ?? null,
      rulesFinal,
      note:
        wildcardOk && calleeOk && noIndividualOnTrunk
          ? "Wildcard trunk + callee rule only — Call Control transfer to sip:<room>@host will join the agent room."
          : "Bridge still misconfigured — fix trunk numbers and ensure only a callee rule is bound to the inbound trunk.",
    },
    null,
    2,
  ),
);

if (!(wildcardOk && calleeOk && noIndividualOnTrunk)) process.exit(1);

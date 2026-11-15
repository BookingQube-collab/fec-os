import "server-only";

import {
  AgentDispatchClient,
  RoomServiceClient,
  SipClient,
  WebhookReceiver,
} from "livekit-server-sdk";

import {
  loadLiveKitSettingsRow,
  readLiveKitEnv,
  resolveLiveKitCredentials,
  type LiveKitCredentials,
} from "@/lib/chat/livekit-settings";

import { CarrierNotConfiguredError } from "./carrier-errors";
import { normalizeSipUriHost } from "./db";
import {
  looksLikeSipHostNotId,
  sipHostMistakenForIdMessage,
} from "./sip-ids";
import type { CallCenterSettingsRow } from "./types";

/**
 * LiveKit SIP glue.
 *
 * - Inbound (Telnyx SIP Trunking → LiveKit): Telnyx originates to the LiveKit SIP host /
 *   inbound trunk; a dispatch rule places the caller in a room; FEC routes IVR/queue.
 * - Inbound (Telnyx Call Control bridge): Telnyx `transfer`s the caller to
 *   `sip:<room user>@<LiveKit SIP host>`. A LiveKit **callee** dispatch rule turns that
 *   into the `cc-…` room agents already joined.
 * - Outbound: `SipClient.createSipParticipant` dials the PSTN number through a LiveKit
 *   **outbound** trunk (whose upstream is Telnyx SIP termination) into the agent's room.
 */

/** Room prefix FEC uses for CDR rooms (routing.ts `roomNameForCall`). */
export const CALL_CENTER_ROOM_PREFIX = "cc-";

export async function resolveLiveKitServerCredentials(): Promise<LiveKitCredentials | null> {
  let row = null;
  try {
    row = await loadLiveKitSettingsRow();
  } catch {
    row = null;
  }
  return resolveLiveKitCredentials(row, readLiveKitEnv());
}

async function requireCredentials(): Promise<LiveKitCredentials> {
  const credentials = await resolveLiveKitServerCredentials();
  if (!credentials) {
    throw new CarrierNotConfiguredError(
      "LiveKit is not configured. Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET or Admin → Chat calls.",
    );
  }
  return credentials;
}

export function liveKitHttpUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
}

async function sipClient(): Promise<SipClient> {
  const c = await requireCredentials();
  return new SipClient(liveKitHttpUrl(c.serverUrl), c.apiKey, c.apiSecret);
}

async function roomClient(): Promise<RoomServiceClient> {
  const c = await requireCredentials();
  return new RoomServiceClient(liveKitHttpUrl(c.serverUrl), c.apiKey, c.apiSecret);
}

function looksLikeSipParticipant(p: {
  identity?: string;
  kind?: number | string;
  attributes?: Record<string, string>;
}): boolean {
  const kind = p.kind;
  // ParticipantInfo.Kind.SIP = 3; SDK may also surface the string name.
  if (Number(kind) === 3 || String(kind).toUpperCase() === "SIP") return true;
  const id = (p.identity ?? "").trim();
  if (/^sip[_+.-]/i.test(id) || /^\+?\d{7,}$/.test(id)) return true;
  return Object.keys(p.attributes ?? {}).some((k) => k.startsWith("sip."));
}

/** Ensure the agent/SIP room exists before Telnyx transfers into it (idempotent). */
export async function ensureLiveKitRoom(roomName: string): Promise<void> {
  const name = roomName.trim();
  if (!name) return;
  const rooms = await roomClient();
  await rooms.createRoom({
    name,
    // Keep empty room briefly so SIP INVITE can land while the agent softphone connects.
    emptyTimeout: 300,
    departureTimeout: 20,
  });
}

let bridgeDispatchCache: { trunkId: string; ruleId: string; at: number; ok: boolean; detail: string } | null =
  null;
const BRIDGE_DISPATCH_CACHE_MS = 60_000;

/**
 * Call Control bridge needs a **callee** dispatch rule on the inbound trunk.
 * An **individual** rule bound to the same trunk steals INVITEs into
 * `cc-_+DID_<random>` rooms while the agent joins `cc-<callId>` → dead air + phantom CDR.
 */
export async function ensureCallControlBridgeDispatch(
  settings: CallCenterSettingsRow | null,
): Promise<{ ok: boolean; detail: string }> {
  const trunkId = settings?.livekit_sip_inbound_trunk_id?.trim() ?? "";
  const ruleId = settings?.livekit_sip_dispatch_rule_id?.trim() ?? "";
  if (!trunkId || !ruleId) {
    return {
      ok: false,
      detail: "Call Control bridge needs livekit_sip_inbound_trunk_id and livekit_sip_dispatch_rule_id.",
    };
  }
  if (
    bridgeDispatchCache &&
    bridgeDispatchCache.trunkId === trunkId &&
    bridgeDispatchCache.ruleId === ruleId &&
    Date.now() - bridgeDispatchCache.at < BRIDGE_DISPATCH_CACHE_MS
  ) {
    return { ok: bridgeDispatchCache.ok, detail: bridgeDispatchCache.detail };
  }

  const sip = await sipClient();
  const all = (await sip.listSipDispatchRule()).filter(Boolean);
  const removed: string[] = [];

  for (const rule of all) {
    if (!rule?.sipDispatchRuleId || rule.sipDispatchRuleId === ruleId) continue;
    const inner = rule.rule?.rule as { case?: string } | undefined;
    if (inner?.case !== "dispatchRuleIndividual") continue;
    const trunks = rule.trunkIds ?? [];
    // Empty trunk list = all trunks — also steals Call Control transfers.
    if (trunks.length === 0 || trunks.includes(trunkId)) {
      try {
        await sip.deleteSipDispatchRule(rule.sipDispatchRuleId);
        removed.push(rule.sipDispatchRuleId);
      } catch {
        if (trunks.includes(trunkId)) {
          try {
            await sip.updateSipDispatchRuleFields(rule.sipDispatchRuleId, {
              trunkIds: { remove: [trunkId] },
            });
            removed.push(`${rule.sipDispatchRuleId}:unbound`);
          } catch {
            // leave for carrier check UI
          }
        }
      }
    }
  }

  const calleeList = await sip.listSipDispatchRule({ dispatchRuleIds: [ruleId] });
  const callee = calleeList.find((r) => r?.sipDispatchRuleId === ruleId);
  if (!callee) {
    const detail = `Callee dispatch rule ${truncateId(ruleId)} not found.`;
    bridgeDispatchCache = { trunkId, ruleId, at: Date.now(), ok: false, detail };
    return { ok: false, detail };
  }
  const inner = callee.rule?.rule as { case?: string; value?: { roomPrefix?: string } } | undefined;
  if (inner?.case !== "dispatchRuleCallee") {
    const detail = `Dispatch rule ${truncateId(ruleId)} must be type callee (got ${inner?.case ?? "unknown"}).`;
    bridgeDispatchCache = { trunkId, ruleId, at: Date.now(), ok: false, detail };
    return { ok: false, detail };
  }
  const prefix = inner.value?.roomPrefix ?? "";
  if (prefix && prefix !== CALL_CENTER_ROOM_PREFIX) {
    const detail = `Callee room prefix "${prefix}" must be "${CALL_CENTER_ROOM_PREFIX}".`;
    bridgeDispatchCache = { trunkId, ruleId, at: Date.now(), ok: false, detail };
    return { ok: false, detail };
  }

  const trunks = callee.trunkIds ?? [];
  if (!trunks.includes(trunkId)) {
    await sip.updateSipDispatchRuleFields(ruleId, {
      trunkIds: { set: [trunkId] },
      name: callee.name?.includes("callee") ? callee.name : "fec-callee-bridge",
    });
  }

  const detail =
    removed.length > 0
      ? `Callee rule bound to trunk; removed conflicting individual rule(s): ${removed.join(", ")}.`
      : `Callee rule bound to inbound trunk ${truncateId(trunkId)}.`;
  bridgeDispatchCache = { trunkId, ruleId, at: Date.now(), ok: true, detail };
  return { ok: true, detail };
}

/**
 * After Telnyx transfers into LiveKit SIP, wait until the caller appears in the room.
 * Returns the SIP participant identity, or null on timeout.
 */
export async function waitForSipParticipantInRoom(
  roomName: string,
  timeoutMs = 12_000,
): Promise<string | null> {
  const rooms = await roomClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const participants = await rooms.listParticipants(roomName);
      const sip = participants.find((p) => looksLikeSipParticipant(p));
      if (sip?.identity) return sip.identity;
      // Any remote identity is enough once the room is ours (agent joins as local JWT later).
      const any = participants.find((p) => (p.identity ?? "").trim().length > 0);
      if (any?.identity) return any.identity;
    } catch {
      // Room may not exist yet while SIP INVITE is in flight.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

let prefixCache: { ruleId: string; prefix: string; at: number } | null = null;
const PREFIX_CACHE_MS = 60_000;

/**
 * Room prefix of the configured LiveKit callee dispatch rule (settings → dispatch rule id).
 * Falls back to CALL_CENTER_SIP_ROOM_PREFIX / `cc-`.
 */
export async function resolveDispatchRoomPrefix(settings: CallCenterSettingsRow | null): Promise<string> {
  const fallback = process.env.CALL_CENTER_SIP_ROOM_PREFIX ?? CALL_CENTER_ROOM_PREFIX;
  const ruleId = settings?.livekit_sip_dispatch_rule_id?.trim() ?? "";
  if (!ruleId) return fallback;
  if (prefixCache && prefixCache.ruleId === ruleId && Date.now() - prefixCache.at < PREFIX_CACHE_MS) {
    return prefixCache.prefix;
  }
  try {
    const rules = await (await sipClient()).listSipDispatchRule({ dispatchRuleIds: [ruleId] });
    const rule = rules.find((r) => r?.sipDispatchRuleId === ruleId);
    const inner = rule?.rule?.rule as { case?: string; value?: { roomPrefix?: string } } | undefined;
    if (inner?.case === "dispatchRuleCallee") {
      const prefix = inner.value?.roomPrefix ?? "";
      prefixCache = { ruleId, prefix, at: Date.now() };
      return prefix;
    }
  } catch {
    // fall through to env/default
  }
  return fallback;
}

/** `sip:<room-without-prefix>@<livekit sip host>` — pairs with a LiveKit callee dispatch rule. */
export async function buildLiveKitSipUri(
  roomName: string,
  settings: CallCenterSettingsRow | null,
): Promise<string> {
  const host = normalizeSipUriHost(settings?.telnyx_sip_uri ?? "");
  if (!host) {
    throw new CarrierNotConfiguredError(
      "LiveKit SIP host is not set. Put your LiveKit SIP URI host (e.g. xxxx.sip.livekit.cloud) in Call Center → Settings → SIP URI.",
    );
  }
  const prefix = await resolveDispatchRoomPrefix(settings);
  const user = prefix && roomName.startsWith(prefix) ? roomName.slice(prefix.length) : roomName;
  return `sip:${user}@${host}`;
}

export type OutboundSipResult = {
  participantIdentity: string;
  sipCallId: string;
};

function truncateId(id: string): string {
  const v = id.trim();
  return v.length <= 14 ? v : `${v.slice(0, 8)}…${v.slice(-4)}`;
}

function hostOf(serverUrl: string): string {
  try {
    return new URL(liveKitHttpUrl(serverUrl)).host;
  } catch {
    return serverUrl;
  }
}

/** Build a user-verifiable "trunk not found" message: saved id, LiveKit host, and trunks that DO exist there. */
async function describeMissingTrunk(trunkId: string): Promise<string> {
  let host = "unknown host";
  let existing = "";
  try {
    const c = await requireCredentials();
    host = hostOf(c.serverUrl);
    const trunks = await (await sipClient()).listSipOutboundTrunk();
    const ids = trunks.map((t) => truncateId(t.sipTrunkId)).filter(Boolean);
    existing = ids.length
      ? ` Outbound trunks in that project: ${ids.slice(0, 5).join(", ")}.`
      : " That project has no outbound trunks.";
  } catch {
    // diagnostics are best-effort
  }
  return (
    `LiveKit outbound SIP trunk "${truncateId(trunkId)}" not found on ${host} (the project your API key belongs to).` +
    `${existing} Paste the OUTBOUND trunk id (ST_…) from that same project in Call Center → Settings, then press Check carrier setup.`
  );
}

/**
 * Dial a PSTN number into `roomName` via the configured LiveKit outbound trunk.
 * Resolves once the callee answers (throws when busy / rejected / timeout).
 */
export async function dialOutboundSip(input: {
  settings: CallCenterSettingsRow | null;
  roomName: string;
  toE164: string;
  fromE164: string;
  callId: string;
}): Promise<OutboundSipResult> {
  const trunkId = input.settings?.livekit_sip_trunk_id?.trim() ?? "";
  if (!trunkId) {
    throw new CarrierNotConfiguredError(
      "LiveKit SIP outbound trunk id is not set. Add it in Call Center → Settings.",
    );
  }
  const identity = `sip-out-${input.callId.replace(/-/g, "").slice(0, 12)}`;
  const from = input.fromE164.startsWith("+") ? input.fromE164 : "";
  let info;
  try {
    info = await (await sipClient()).createSipParticipant(trunkId, input.toE164, input.roomName, {
      participantIdentity: identity,
      participantName: input.toE164,
      fromNumber: from || undefined,
      playDialtone: true,
      waitUntilAnswered: true,
      ringingTimeout: 45,
      timeout: 60,
      headers: { "X-FEC-Call-Id": input.callId },
      participantAttributes: { "fec.callId": input.callId, "fec.direction": "outbound" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/trunk (does not exist|not found)|does not exist/i.test(message)) {
      throw new Error(await describeMissingTrunk(trunkId));
    }
    throw e;
  }
  return {
    participantIdentity: info.participantIdentity || identity,
    sipCallId: info.sipCallId || "",
  };
}

/** Best-effort: drop everyone (including SIP legs) from the call room. */
export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  if (!roomName) return;
  try {
    await (await roomClient()).deleteRoom(roomName);
  } catch {
    // room may already be gone
  }
}

/**
 * Explicitly dispatch a LiveKit Agent into the call room (IVR / AI first answer).
 * Requires a registered agent with `agentName` matching settings.
 */
export async function dispatchLiveKitAgent(input: {
  roomName: string;
  agentName: string;
  metadata?: string;
}): Promise<{ ok: true; dispatchId: string } | { ok: false; reason: string }> {
  const name = input.agentName.trim();
  if (!name) return { ok: false, reason: "Agent name empty" };
  if (!input.roomName.trim()) return { ok: false, reason: "Room name empty" };
  try {
    const c = await requireCredentials();
    const client = new AgentDispatchClient(liveKitHttpUrl(c.serverUrl), c.apiKey, c.apiSecret);
    const dispatch = await client.createDispatch(input.roomName, name, {
      metadata: input.metadata,
    });
    return { ok: true, dispatchId: dispatch.id || "" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Agent dispatch failed" };
  }
}

export type LiveKitWebhookVerdict =
  | { ok: true; event: Awaited<ReturnType<WebhookReceiver["receive"]>> }
  | { ok: false; reason: string };

/** Verify LiveKit's signed webhook (Authorization JWT with body hash) and parse it. */
export async function verifyLiveKitWebhook(
  rawBody: string,
  authHeader: string | null,
): Promise<LiveKitWebhookVerdict> {
  const credentials = await resolveLiveKitServerCredentials();
  if (!credentials) return { ok: false, reason: "LiveKit credentials not configured" };
  try {
    const receiver = new WebhookReceiver(credentials.apiKey, credentials.apiSecret);
    const event = await receiver.receive(rawBody, authHeader ?? undefined);
    return { ok: true, event };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Invalid LiveKit webhook" };
  }
}

export type CarrierCheck = {
  key: string;
  ok: boolean;
  detail: string;
};

/** Read-only diagnostics for the CEO/COO settings screen. */
export async function checkCarrierSetup(settings: CallCenterSettingsRow | null): Promise<CarrierCheck[]> {
  const checks: CarrierCheck[] = [];
  const credentials = await resolveLiveKitServerCredentials();
  checks.push({
    key: "livekit",
    ok: Boolean(credentials),
    detail: credentials ? "LiveKit server credentials found." : "LiveKit URL / key / secret missing.",
  });

  const host = normalizeSipUriHost(settings?.telnyx_sip_uri ?? "");
  checks.push({
    key: "sip_host",
    ok: Boolean(host),
    detail: host ? `LiveKit SIP host: ${host}` : "SIP URI host not set.",
  });

  const telnyxKey = settings?.telnyx_api_key?.trim() || process.env.TELNYX_API_KEY?.trim();
  checks.push({
    key: "telnyx_key",
    ok: Boolean(telnyxKey),
    detail: telnyxKey ? "Telnyx API key present." : "Telnyx API key missing (needed for inbound answer/IVR/bridge).",
  });

  if (!credentials) return checks;

  const inboundMode = settings?.inbound_mode === "telnyx_call_control" ? "telnyx_call_control" : "telnyx_sip_trunk";
  checks.push({
    key: "inbound_mode",
    ok: true,
    detail:
      inboundMode === "telnyx_sip_trunk"
        ? "Inbound mode: Telnyx SIP Trunking → LiveKit (recommended). Set DTMF to RFC 2833 on Telnyx."
        : "Inbound mode: Telnyx Call Control IVR → LiveKit bridge on agent answer.",
  });
  checks.push({
    key: "dtmf_mode",
    ok: (settings?.telnyx_dtmf_mode ?? "rfc2833") === "rfc2833",
    detail:
      (settings?.telnyx_dtmf_mode ?? "rfc2833") === "rfc2833"
        ? "DTMF mode rfc2833 (RTP telephone-event) — recommended for IVR."
        : `DTMF mode is "${settings?.telnyx_dtmf_mode}". Prefer rfc2833 on the Telnyx SIP connection.`,
  });
  const qatarDid = settings?.qatar_did_e164?.trim() ?? "";
  checks.push({
    key: "qatar_did",
    ok: Boolean(qatarDid) && qatarDid.startsWith("+974"),
    detail: qatarDid
      ? qatarDid.startsWith("+974")
        ? `Qatar DID ${qatarDid} recorded.`
        : `DID ${qatarDid} does not look like +974…`
      : "Qatar DID not set (optional reminder). Map it under Call Center → Numbers after purchase/port.",
  });

  const inboundTrunkId = settings?.livekit_sip_inbound_trunk_id?.trim() ?? "";
  if (!inboundTrunkId) {
    checks.push({
      key: "inbound_trunk",
      ok: inboundMode !== "telnyx_sip_trunk",
      detail:
        inboundMode === "telnyx_sip_trunk"
          ? "Inbound trunk id not set (required for Telnyx SIP → LiveKit). LiveKit Cloud → Telephony → SIP trunks → Inbound → copy ST_… (not SIP host)."
          : "Inbound trunk id not set (optional when using Call Control bridge). If needed: LiveKit Cloud → Telephony → SIP trunks → Inbound → copy ST_….",
    });
  } else if (looksLikeSipHostNotId(inboundTrunkId)) {
    checks.push({
      key: "inbound_trunk",
      ok: false,
      detail: sipHostMistakenForIdMessage("inbound_trunk"),
    });
  } else {
    try {
      const trunks = await (await sipClient()).listSipInboundTrunk({ trunkIds: [inboundTrunkId] });
      const found = trunks.find((t) => t?.sipTrunkId === inboundTrunkId);
      if (!found) {
        checks.push({
          key: "inbound_trunk",
          ok: false,
          detail: `Inbound trunk "${truncateId(inboundTrunkId)}" not found on ${hostOf(credentials.serverUrl)}.`,
        });
      } else {
        const numbers = found.numbers ?? [];
        // Call Control transfers to sip:<roomUser>@host — trunk must accept any destination.
        const bridgeNeedsWildcard = inboundMode === "telnyx_call_control" && numbers.length > 0;
        checks.push({
          key: "inbound_trunk",
          ok: !bridgeNeedsWildcard,
          detail: bridgeNeedsWildcard
            ? `Inbound trunk "${found.name || inboundTrunkId}" only allows ${numbers.slice(0, 3).join(", ")}. Call Control bridge dials the room user (not the DID) — clear numbers (wildcard) or agent will get dead air. Run scripts/fix-call-control-bridge-trunk.mjs.`
            : numbers.length === 0
              ? `Inbound trunk "${found.name || inboundTrunkId}" is wildcard (any destination) — OK for Call Control bridge.`
              : `Inbound trunk "${found.name || inboundTrunkId}" ready for Telnyx origination (${numbers.slice(0, 3).join(", ")}).`,
        });
      }
    } catch (e) {
      checks.push({
        key: "inbound_trunk",
        ok: false,
        detail: e instanceof Error ? e.message : "Could not list inbound trunks.",
      });
    }
  }

  const trunkId = settings?.livekit_sip_trunk_id?.trim() ?? "";
  if (!trunkId) {
    checks.push({
      key: "outbound_trunk",
      ok: false,
      detail:
        "Outbound trunk id not set (needed for dial-out). LiveKit Cloud → Telephony → SIP trunks → Outbound → copy ST_… (not SIP host).",
    });
  } else if (looksLikeSipHostNotId(trunkId)) {
    checks.push({
      key: "outbound_trunk",
      ok: false,
      detail: sipHostMistakenForIdMessage("outbound_trunk"),
    });
  } else {
    try {
      const trunks = await (await sipClient()).listSipOutboundTrunk({ trunkIds: [trunkId] });
      const found = trunks.find((t) => t?.sipTrunkId === trunkId);
      let detail = found
        ? `Outbound trunk "${found.name || trunkId}" → ${found.address}`
        : `Outbound trunk "${truncateId(trunkId)}" not found on ${hostOf(credentials.serverUrl)}. Paste the OUTBOUND trunk id (ST_…), not the inbound trunk or dispatch rule id.`;
      if (!found) {
        try {
          const inbound = await (await sipClient()).listSipInboundTrunk({ trunkIds: [trunkId] });
          if (inbound.some((t) => t?.sipTrunkId === trunkId)) {
            detail = "This is an INBOUND trunk id. Outbound dialing needs the OUTBOUND trunk id.";
          }
        } catch {
          // keep generic message
        }
      }
      checks.push({ key: "outbound_trunk", ok: Boolean(found), detail });
    } catch (e) {
      checks.push({
        key: "outbound_trunk",
        ok: false,
        detail: e instanceof Error ? e.message : "Could not list outbound trunks.",
      });
    }
  }

  const ruleId = settings?.livekit_sip_dispatch_rule_id?.trim() ?? "";
  if (!ruleId) {
    checks.push({
      key: "dispatch_rule",
      ok: false,
      detail: "Dispatch rule id not set. Paste SDR_… from LiveKit Cloud → Telephony → Dispatch rules.",
    });
  } else if (looksLikeSipHostNotId(ruleId)) {
    checks.push({
      key: "dispatch_rule",
      ok: false,
      detail: sipHostMistakenForIdMessage("dispatch_rule"),
    });
  } else {
    try {
      const allRules = await (await sipClient()).listSipDispatchRule();
      const found = allRules.find((r) => r?.sipDispatchRuleId === ruleId);
      const inner = found?.rule?.rule as { case?: string; value?: { roomPrefix?: string } } | undefined;
      const isCallee = inner?.case === "dispatchRuleCallee";
      const isIndividual = inner?.case === "dispatchRuleIndividual";
      const trunkIds = found?.trunkIds ?? [];
      const boundOk =
        inboundMode !== "telnyx_call_control" ||
        !inboundTrunkId ||
        trunkIds.length === 0 ||
        trunkIds.includes(inboundTrunkId);

      const conflicting = allRules.filter((r) => {
        if (!r?.sipDispatchRuleId || r.sipDispatchRuleId === ruleId) return false;
        const c = r.rule?.rule as { case?: string } | undefined;
        if (c?.case !== "dispatchRuleIndividual") return false;
        if (inboundMode !== "telnyx_call_control" || !inboundTrunkId) return false;
        const t = r.trunkIds ?? [];
        return t.length === 0 || t.includes(inboundTrunkId);
      });

      let detail = !found
        ? `Dispatch rule "${truncateId(ruleId)}" not found. Paste the id (SDR_…) from LiveKit Cloud → Telephony → Dispatch rules.`
        : isCallee
          ? `Callee rule, room prefix "${inner?.value?.roomPrefix ?? ""}" (must match FEC room prefix "${CALL_CENTER_ROOM_PREFIX}" for Call Control bridge).`
          : isIndividual
            ? "Individual dispatch rule — suitable for Telnyx SIP Trunk → LiveKit inbound rooms."
            : "Use a callee (cc-) or individual dispatch rule for FEC rooms.";

      if (found && isCallee && inboundMode === "telnyx_call_control" && !boundOk) {
        detail += ` Rule is not bound to inbound trunk ${truncateId(inboundTrunkId)} — Answer bridge may miss the agent room.`;
      }
      if (conflicting.length > 0) {
        detail += ` Conflicting individual rule(s) on the same trunk will steal bridges into cc-_+DID_random rooms: ${conflicting
          .map((r) => truncateId(r.sipDispatchRuleId))
          .join(", ")}. Run scripts/fix-call-control-bridge-trunk.mjs.`;
      }

      checks.push({
        key: "dispatch_rule",
        ok:
          Boolean(found) &&
          (isCallee || isIndividual) &&
          conflicting.length === 0 &&
          (inboundMode !== "telnyx_call_control" || (isCallee && boundOk)),
        detail,
      });
    } catch (e) {
      checks.push({
        key: "dispatch_rule",
        ok: false,
        detail: e instanceof Error ? e.message : "Could not list dispatch rules.",
      });
    }
  }
  return checks;
}

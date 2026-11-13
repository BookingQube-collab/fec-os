import "server-only";

import { RoomServiceClient, SipClient, WebhookReceiver } from "livekit-server-sdk";

import {
  loadLiveKitSettingsRow,
  readLiveKitEnv,
  resolveLiveKitCredentials,
  type LiveKitCredentials,
} from "@/lib/chat/livekit-settings";

import { CarrierNotConfiguredError } from "./carrier-errors";
import { normalizeSipUriHost } from "./db";
import type { CallCenterSettingsRow } from "./types";

/**
 * LiveKit SIP glue.
 *
 * - Inbound (Telnyx Call Control): Telnyx `transfer`s the caller to
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
  const info = await (await sipClient()).createSipParticipant(trunkId, input.toE164, input.roomName, {
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

  const trunkId = settings?.livekit_sip_trunk_id?.trim() ?? "";
  if (!trunkId) {
    checks.push({ key: "outbound_trunk", ok: false, detail: "Outbound trunk id not set." });
  } else {
    try {
      const trunks = await (await sipClient()).listSipOutboundTrunk({ trunkIds: [trunkId] });
      const found = trunks.find((t) => t?.sipTrunkId === trunkId);
      checks.push({
        key: "outbound_trunk",
        ok: Boolean(found),
        detail: found ? `Outbound trunk "${found.name || trunkId}" → ${found.address}` : "Trunk id not found as an outbound trunk.",
      });
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
    checks.push({ key: "dispatch_rule", ok: false, detail: "Dispatch rule id not set." });
  } else {
    try {
      const rules = await (await sipClient()).listSipDispatchRule({ dispatchRuleIds: [ruleId] });
      const found = rules.find((r) => r?.sipDispatchRuleId === ruleId);
      const inner = found?.rule?.rule as { case?: string; value?: { roomPrefix?: string } } | undefined;
      const isCallee = inner?.case === "dispatchRuleCallee";
      checks.push({
        key: "dispatch_rule",
        ok: Boolean(found) && isCallee,
        detail: !found
          ? "Dispatch rule id not found."
          : isCallee
            ? `Callee rule, room prefix "${inner?.value?.roomPrefix ?? ""}" (must match FEC room prefix "${CALL_CENTER_ROOM_PREFIX}").`
            : "Rule must be a callee rule so Telnyx bridges land in the agent's cc-… room.",
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

/**
 * Pure helpers for distinguishing LiveKit SIP callers from agent softphones,
 * plus SIP URI shaping for Call Control → LiveKit transfers.
 * Kept free of server-only imports so unit tests can cover Answer false-positives.
 */

/** LiveKit Cloud telephony / RTC region names (region pinning). */
export const LIVEKIT_TELEPHONY_REGIONS = [
  "us",
  "eu",
  "sa",
  "india",
  "japan",
  "aus",
  "canada",
] as const;
export type LiveKitTelephonyRegion = (typeof LIVEKIT_TELEPHONY_REGIONS)[number];

const REGION_RE = "us|eu|sa|india|japan|aus|canada";

/**
 * Pin a global LiveKit SIP host to one region so Telnyx INVITEs and the softphone
 * meet on the same LiveKit nodes. Format: `{sub}.{region}.sip.livekit.cloud`.
 */
export function pinSipHostToRegion(host: string, region: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  const reg = region.trim().toLowerCase();
  if (!h || !reg) return host.trim();
  const pinned = new RegExp(`^([a-z0-9-]+)\\.(${REGION_RE})\\.sip\\.livekit\\.cloud$`, "i");
  const global = /^([a-z0-9-]+)\.sip\.livekit\.cloud$/i;
  const pinnedMatch = h.match(pinned);
  if (pinnedMatch) return `${pinnedMatch[1]}.${reg}.sip.livekit.cloud`;
  const globalMatch = h.match(global);
  if (globalMatch) return `${globalMatch[1]}.${reg}.sip.livekit.cloud`;
  return host.trim();
}

/**
 * Pin LiveKit WebRTC URL to the same region as SIP.
 * `wss://proj.livekit.cloud` → `wss://proj.{region}.rtc.livekit.cloud`
 */
export function pinRtcUrlToRegion(serverUrl: string, region: string): string {
  const reg = region.trim().toLowerCase();
  if (!serverUrl.trim() || !reg) return serverUrl;
  try {
    const u = new URL(serverUrl);
    const host = u.hostname.toLowerCase();
    const pinned = new RegExp(`^([a-z0-9-]+)\\.(${REGION_RE})\\.rtc\\.livekit\\.cloud$`, "i");
    const global = /^([a-z0-9-]+)\.livekit\.cloud$/i;
    const pinnedMatch = host.match(pinned);
    if (pinnedMatch) {
      u.hostname = `${pinnedMatch[1]}.${reg}.rtc.livekit.cloud`;
      return u.toString().replace(/\/$/, "");
    }
    const globalMatch = host.match(global);
    if (globalMatch) {
      u.hostname = `${globalMatch[1]}.${reg}.rtc.livekit.cloud`;
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    // leave unchanged
  }
  return serverUrl;
}

/** `sip:<room-without-prefix>@host` — transport is set via Telnyx sip_transport_protocol. */
export function formatLiveKitSipUri(roomName: string, host: string, roomPrefix = "cc-"): string {
  const h = host.trim();
  const prefix = roomPrefix.trim();
  const user = prefix && roomName.startsWith(prefix) ? roomName.slice(prefix.length) : roomName;
  return `sip:${user}@${h}`;
}


export function isAgentSoftphoneIdentity(identity: string): boolean {
  const id = identity.trim().toLowerCase();
  return (
    id.startsWith("cc-agent-") ||
    id.startsWith("cc-supervisor-") ||
    id.startsWith("agent-") ||
    id.startsWith("supervisor-")
  );
}

/** True when a LiveKit room participant is the PSTN/SIP caller (not the FEC softphone). */
export function looksLikeSipParticipant(p: {
  identity?: string;
  kind?: number | string;
  attributes?: Record<string, string>;
}): boolean {
  const id = (p.identity ?? "").trim();
  if (!id || isAgentSoftphoneIdentity(id)) return false;

  const kind = p.kind;
  // ParticipantInfo.Kind.SIP = 3; SDK may also surface the string name.
  if (Number(kind) === 3 || String(kind).toUpperCase() === "SIP") return true;
  if (/^sip[_+.-]/i.test(id) || /^\+?\d{7,}$/.test(id)) return true;
  return Object.keys(p.attributes ?? {}).some((k) => k.startsWith("sip."));
}

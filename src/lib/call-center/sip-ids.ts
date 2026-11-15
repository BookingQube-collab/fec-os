/**
 * Client-safe LiveKit SIP id / host shape checks.
 * Trunks are `ST_…`, dispatch rules are `SDR_…`. The SIP host
 * (`xxxx.sip.livekit.cloud`) belongs in the SIP URI field only.
 */

/** True when a pasted value looks like a SIP host/URI, not an ST_/SDR_ id. */
export function looksLikeSipHostNotId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^(sips?:|wss?:\/\/|https?:\/\/)/i.test(v)) return true;
  if (v.includes("@")) return true;
  const host = v.replace(/^(sips?:|wss?:\/\/|https?:\/\/)/i, "").split(/[/;?#]/)[0] ?? v;
  const lower = host.toLowerCase();
  if (lower.includes(".sip.") || lower.endsWith(".livekit.cloud")) return true;
  // Hostname with dots and no LiveKit id prefix (ST_ / SDR_)
  if (host.includes(".") && !/^(ST_|SDR_)/i.test(host) && !host.includes("_")) return true;
  return false;
}

export function isLiveKitTrunkIdShape(value: string): boolean {
  return /^ST_[A-Za-z0-9]+$/i.test(value.trim());
}

export function isLiveKitDispatchRuleIdShape(value: string): boolean {
  return /^SDR_[A-Za-z0-9]+$/i.test(value.trim());
}

/** User-facing message when a SIP host was pasted into an id field. */
export function sipHostMistakenForIdMessage(field: "outbound_trunk" | "inbound_trunk" | "dispatch_rule"): string {
  switch (field) {
    case "outbound_trunk":
      return "That value looks like a SIP host, not an outbound trunk id. Put the host in Telnyx / SIP URI. Paste the OUTBOUND trunk id (ST_…) from LiveKit Cloud → Telephony → SIP trunks → Outbound.";
    case "inbound_trunk":
      return "That value looks like a SIP host, not an inbound trunk id. Put the host in Telnyx / SIP URI. Paste the INBOUND trunk id (ST_…) from LiveKit Cloud → Telephony → SIP trunks → Inbound.";
    case "dispatch_rule":
      return "That value looks like a SIP host, not a dispatch rule id. Paste the dispatch rule id (SDR_…) from LiveKit Cloud → Telephony → Dispatch rules.";
  }
}

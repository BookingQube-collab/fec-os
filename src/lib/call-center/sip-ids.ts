/**
 * Client-safe LiveKit SIP id / host shape checks.
 * Trunks are `ST_…`, dispatch rules are `SDR_…`. The SIP host
 * (`xxxx.sip.livekit.cloud`) belongs in the SIP URI field only.
 */

/** Strip URI schemes / path so a pasted value becomes a bare host (client-safe). */
export function extractSipHostCandidate(value: string): string {
  let v = value.trim();
  if (!v) return "";
  v = v.replace(/^(sips?:|wss:\/\/|ws:\/\/|https?:\/\/)/i, "");
  if (v.includes("@")) {
    v = v.split("@").pop() ?? v;
  }
  v = v.split(/[/;?#]/)[0] ?? v;
  return v.trim();
}

/** True when a pasted value looks like a SIP host/URI, not an ST_/SDR_ id. */
export function looksLikeSipHostNotId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^(sips?:|wss?:\/\/|https?:\/\/)/i.test(v)) return true;
  if (v.includes("@")) return true;
  const host = extractSipHostCandidate(v);
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

export type RecoverMisplacedOutboundSipHostResult = {
  outboundTrunkId: string;
  sipUri: string;
  /** True when a SIP host was removed from the outbound trunk id field. */
  recovered: boolean;
};

/**
 * If the outbound trunk field holds a SIP host (not ST_…), move it into the
 * SIP URI field when that field is empty or already the same host, then clear
 * the trunk id. Never invents an ST_ id.
 */
export function recoverMisplacedOutboundSipHost(input: {
  outboundTrunkId: string;
  sipUri: string;
}): RecoverMisplacedOutboundSipHostResult {
  const outbound = input.outboundTrunkId.trim();
  const sipUriRaw = input.sipUri.trim();
  const existingHost = extractSipHostCandidate(sipUriRaw);

  if (!outbound || !looksLikeSipHostNotId(outbound)) {
    return {
      outboundTrunkId: outbound,
      sipUri: existingHost || sipUriRaw,
      recovered: false,
    };
  }

  const host = extractSipHostCandidate(outbound);
  if (!host) {
    return { outboundTrunkId: "", sipUri: existingHost || sipUriRaw, recovered: true };
  }

  if (!existingHost) {
    return { outboundTrunkId: "", sipUri: host, recovered: true };
  }
  if (existingHost.toLowerCase() === host.toLowerCase()) {
    return { outboundTrunkId: "", sipUri: existingHost, recovered: true };
  }
  // SIP URI already has a different host — clear the mistaken trunk id only.
  return { outboundTrunkId: "", sipUri: existingHost, recovered: true };
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

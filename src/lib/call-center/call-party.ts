/**
 * Display helpers for Call Center party numbers (client + server safe).
 * Never surface our own DID / outbound caller ID as the "customer" on inbound rows.
 */

export type CallPartyLike = {
  direction: string;
  fromE164: string;
  toE164: string;
  provider?: string;
  status?: string;
  livekitRoom?: string | null;
  metadata?: Record<string, unknown> | null;
};

function digitsKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  return `+${digits.replace(/\D/g, "")}`;
}

export function collectOwnedE164s(input: {
  outboundCallerIdE164?: string | null;
  qatarDidE164?: string | null;
  didE164s?: Array<string | null | undefined>;
}): string[] {
  const out: string[] = [];
  const push = (n: string | null | undefined) => {
    const v = digitsKey(n ?? "");
    if (v && !out.includes(v)) out.push(v);
  };
  push(input.outboundCallerIdE164);
  push(input.qatarDidE164);
  for (const d of input.didE164s ?? []) push(d);
  return out;
}

/** True when this CDR is a bogus LiveKit SIP row created from a Call Control bridge INVITE. */
export function isPhantomDidInbound(call: CallPartyLike, ownedE164s: string[]): boolean {
  if (call.direction !== "inbound" && call.direction !== "internal_test") return false;
  if (call.provider !== "livekit_sip") return false;
  const owned = new Set(ownedE164s.map(digitsKey).filter(Boolean));
  const from = digitsKey(call.fromE164);
  if (!from || !owned.has(from)) return false;
  // Individual-dispatch leftovers: cc-_+DID_<random>
  const room = call.livekitRoom ?? "";
  if (room.startsWith("cc-_+") || room.includes(`_+${from.slice(1)}_`)) return true;
  // Or any livekit_sip inbound whose From is our DID (bridge From header).
  return Boolean((call.metadata as Record<string, unknown> | null)?.livekitSipInbound);
}

/** Customer-facing number for dialer / Recent / active call label. */
export function remotePartyE164(call: CallPartyLike, ownedE164s: string[] = []): string {
  const owned = new Set(ownedE164s.map(digitsKey).filter(Boolean));
  if (call.direction === "outbound") {
    return call.toE164?.trim() || "";
  }
  const from = call.fromE164?.trim() || "";
  const fromKey = digitsKey(from);
  if (from && from !== "test" && !from.endsWith("00000000") && !owned.has(fromKey)) {
    return from;
  }
  // From is missing or is our DID — do not show DID as the customer.
  if (owned.has(fromKey)) return "";
  if (call.toE164 && call.toE164 !== "test" && !owned.has(digitsKey(call.toE164))) {
    return call.toE164;
  }
  return from && !owned.has(fromKey) ? from : "";
}

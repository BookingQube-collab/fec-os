/**
 * RFC 4733 / telephone-event codes for LiveKit publishDtmf.
 * @see https://docs.livekit.io/telephony/features/dtmf/
 */

const SPECIAL: Record<string, number> = {
  "*": 10,
  "#": 11,
  A: 12,
  B: 13,
  C: 14,
  D: 15,
};

/** Map a keypad digit to the RTP telephone-event code LiveKit expects. */
export function dtmfDigitToCode(digit: string): number {
  const d = digit.trim();
  if (/^[0-9]$/.test(d)) return Number(d);
  const upper = d.toUpperCase();
  if (upper in SPECIAL) return SPECIAL[upper]!;
  throw new Error(`Unsupported DTMF digit: ${digit}`);
}

export const TELNYX_DTMF_MODES = ["rfc2833", "inband", "sip_info"] as const;
export type TelnyxDtmfMode = (typeof TELNYX_DTMF_MODES)[number];

export const CALL_CENTER_INBOUND_MODES = ["telnyx_sip_trunk", "telnyx_call_control"] as const;
export type CallCenterInboundMode = (typeof CALL_CENTER_INBOUND_MODES)[number];

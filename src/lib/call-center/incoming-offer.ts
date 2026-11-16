import type { CallCenterCall, CallCenterCallStatus } from "./types";

const OFFER_STATUSES = new Set<CallCenterCallStatus>(["ringing", "offered", "queued"]);
const TERMINAL_OR_TAKEN = new Set<CallCenterCallStatus>([
  "ended",
  "missed",
  "declined",
  "failed",
  "voicemail",
  "answered",
  "held",
]);

/**
 * Whether the agent UI may show the Incoming Call modal.
 * ACW / busy / offline must not surface stale React Query ringing rows.
 */
export function canShowIncomingOffer(input: {
  workspaceStatus: string | null | undefined;
  activeCall: boolean;
  acwRemaining: number | null | undefined;
}): boolean {
  if (input.activeCall) return false;
  if (input.acwRemaining != null && input.acwRemaining > 0) return false;
  return input.workspaceStatus === "available";
}

/**
 * Pick the first still-live inbound offer, suppressing stale cache rows that Recent
 * (or a fresher candidate list) already shows as ended / declined / answered.
 */
export function pickActiveIncomingOffer(
  candidates: CallCenterCall[] | null | undefined,
  recentCalls: CallCenterCall[] = [],
): CallCenterCall | null {
  if (!candidates?.length) return null;
  const recentById = new Map(recentCalls.map((c) => [c.id, c]));
  for (const call of candidates) {
    if (!OFFER_STATUSES.has(call.status)) continue;
    const latest = recentById.get(call.id);
    if (latest && TERMINAL_OR_TAKEN.has(latest.status)) continue;
    return call;
  }
  return null;
}

/** True when Answer/bridge is in flight or done — Telnyx must not restart hold music. */
export function shouldSkipHoldMusic(call: {
  status: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (call.status === "answered" || call.status === "held") return true;
  const meta = call.metadata ?? {};
  if (
    meta.bridgedAt ||
    meta.bridgeInProgress ||
    meta.bridgeAwaitingAgent ||
    meta.answerClaimedBy
  ) {
    return true;
  }
  return false;
}

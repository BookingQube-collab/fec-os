import "server-only";

import { createPublicKey, timingSafeEqual, verify as cryptoVerify } from "node:crypto";

import { CarrierNotConfiguredError, TelnyxApiError } from "./carrier-errors";
import type { CallCenterSettingsRow } from "./types";

/**
 * Telnyx Call Control (v2) helpers.
 *
 * Why Call Control (not TeXML): the inbound stub already keys off `call_control_id`,
 * and IVR / queue / answer-time bridging needs per-call decisions made by FEC code
 * (routing.ts), which Call Control JSON webhooks + REST commands fit directly.
 */

const TELNYX_API_BASE = "https://api.telnyx.com/v2";
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function resolveTelnyxApiKey(settings: CallCenterSettingsRow | null): string {
  return settings?.telnyx_api_key?.trim() || process.env.TELNYX_API_KEY?.trim() || "";
}

/** Telnyx webhook public key (Mission Control → Keys & Credentials → Public Key). Base64, 32 bytes. */
export function resolveTelnyxPublicKey(settings: CallCenterSettingsRow | null): string {
  const fromEnv = process.env.TELNYX_PUBLIC_KEY?.trim();
  if (fromEnv) return fromEnv;
  const stored = settings?.telnyx_webhook_secret?.trim() ?? "";
  // The webhook secret field may hold either a shared secret or the public key.
  return Buffer.from(stored, "base64").length === 32 ? stored : "";
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Verify Telnyx `telnyx-signature-ed25519` over `${timestamp}|${rawBody}`. */
export function verifyTelnyxSignature(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
  publicKey: string;
  nowMs?: number;
}): boolean {
  try {
    const keyBytes = Buffer.from(input.publicKey.trim(), "base64");
    if (keyBytes.length !== 32) return false;
    const ts = Number(input.timestamp);
    if (!Number.isFinite(ts)) return false;
    const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
    if (Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, keyBytes]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(`${input.timestamp}|${input.rawBody}`),
      key,
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export type TelnyxEvent = {
  eventId: string;
  eventType: string;
  callControlId: string;
  callSessionId: string;
  direction: string;
  from: string;
  to: string;
  connectionId: string;
  clientState: Record<string, unknown>;
  digits: string;
  gatherStatus: string;
  hangupCause: string;
  hangupSource: string;
  raw: Record<string, unknown>;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function encodeClientState(state: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
}

export function decodeClientState(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Returns null when the body is not a Telnyx Call Control event envelope. */
export function parseTelnyxEvent(body: unknown): TelnyxEvent | null {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const data = root?.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const eventType = str(data?.event_type);
  if (!data || !eventType) return null;
  const payload =
    data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {};
  return {
    eventId: str(data.id),
    eventType,
    callControlId: str(payload.call_control_id),
    callSessionId: str(payload.call_session_id),
    direction: str(payload.direction),
    from: str(payload.from),
    to: str(payload.to),
    connectionId: str(payload.connection_id),
    clientState: decodeClientState(payload.client_state),
    digits: str(payload.digits),
    gatherStatus: str(payload.status),
    hangupCause: str(payload.hangup_cause),
    hangupSource: str(payload.hangup_source),
    raw: payload,
  };
}

export function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

const PROVIDER_VOICE_RE = /^(Polly|Azure|Google|Telnyx|AWS)\./i;

/** Pick Telnyx voice/language. Plain `female` works for en-US and arb; provider-prefixed voices pass through. */
export function pickSpeakVoice(text: string, configuredVoice?: string): { voice: string; language: string } {
  const language = isArabicText(text) ? "arb" : "en-US";
  const configured = configuredVoice?.trim() ?? "";
  if (configured && PROVIDER_VOICE_RE.test(configured)) return { voice: configured, language };
  return { voice: "female", language };
}

function describeError(body: unknown, fallback: string): string {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const errors = Array.isArray(root.errors) ? root.errors : [];
  const first = errors[0] && typeof errors[0] === "object" ? (errors[0] as Record<string, unknown>) : {};
  return str(first.detail) || str(first.title) || fallback;
}

export type TelnyxClient = ReturnType<typeof createTelnyxClient>;

export function createTelnyxClient(apiKey: string) {
  if (!apiKey) {
    throw new CarrierNotConfiguredError(
      "Telnyx API key is not set. Add it in Call Center → Settings (or TELNYX_API_KEY).",
    );
  }

  async function action(callControlId: string, name: string, body: Record<string, unknown> = {}) {
    const response = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${name}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new TelnyxApiError(
        `Telnyx ${name} failed: ${describeError(json, `HTTP ${response.status}`)}`,
        response.status,
      );
    }
    return json;
  }

  return {
    answer: (id: string, clientState?: Record<string, unknown>) =>
      action(id, "answer", clientState ? { client_state: encodeClientState(clientState) } : {}),
    reject: (id: string, cause = "CALL_REJECTED") => action(id, "reject", { cause }),
    hangup: (id: string) => action(id, "hangup"),
    speak: (
      id: string,
      text: string,
      clientState: Record<string, unknown>,
      configuredVoice?: string,
    ) =>
      action(id, "speak", {
        payload: text,
        ...pickSpeakVoice(text, configuredVoice),
        client_state: encodeClientState(clientState),
      }),
    gatherUsingSpeak: (
      id: string,
      text: string,
      clientState: Record<string, unknown>,
      configuredVoice?: string,
    ) =>
      action(id, "gather_using_speak", {
        payload: text,
        ...pickSpeakVoice(text, configuredVoice),
        minimum_digits: 1,
        maximum_digits: 1,
        timeout_millis: 8000,
        valid_digits: "0123456789*#",
        client_state: encodeClientState(clientState),
      }),
    playbackStart: (
      id: string,
      audioUrl: string,
      clientState: Record<string, unknown>,
      loop: boolean,
    ) =>
      action(id, "playback_start", {
        audio_url: audioUrl,
        loop: loop ? "infinity" : 1,
        client_state: encodeClientState(clientState),
      }),
    playbackStop: (id: string) => action(id, "playback_stop"),
    /** Dial `to` (SIP URI or E.164) and bridge the caller to it once answered. */
    transfer: (
      id: string,
      to: string,
      options: { headers?: Array<{ name: string; value: string }>; clientState?: Record<string, unknown> } = {},
    ) =>
      action(id, "transfer", {
        to,
        timeout_secs: 30,
        ...(options.headers?.length ? { custom_headers: options.headers } : {}),
        ...(options.clientState ? { client_state: encodeClientState(options.clientState) } : {}),
      }),
  };
}

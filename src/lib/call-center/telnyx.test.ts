import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decodeClientState,
  encodeClientState,
  parseTelnyxEvent,
  pickSpeakVoice,
  verifyTelnyxSignature,
} from "./telnyx";

function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, publicKeyBase64: Buffer.from(der.subarray(der.length - 32)).toString("base64") };
}

describe("verifyTelnyxSignature", () => {
  const rawBody = JSON.stringify({ data: { event_type: "call.initiated" } });

  it("accepts a valid signature", () => {
    const { privateKey, publicKeyBase64 } = makeKey();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
    expect(verifyTelnyxSignature({ rawBody, signature, timestamp, publicKey: publicKeyBase64 })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const { privateKey, publicKeyBase64 } = makeKey();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
    expect(
      verifyTelnyxSignature({ rawBody: `${rawBody} `, signature, timestamp, publicKey: publicKeyBase64 }),
    ).toBe(false);
  });

  it("rejects stale timestamps and bad keys", () => {
    const { privateKey, publicKeyBase64 } = makeKey();
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString("base64");
    expect(verifyTelnyxSignature({ rawBody, signature, timestamp, publicKey: publicKeyBase64 })).toBe(false);
    expect(verifyTelnyxSignature({ rawBody, signature, timestamp, publicKey: "not-a-key" })).toBe(false);
  });
});

describe("parseTelnyxEvent", () => {
  it("parses a call.initiated envelope", () => {
    const ev = parseTelnyxEvent({
      data: {
        id: "evt-1",
        event_type: "call.initiated",
        payload: {
          call_control_id: "v3:abc",
          direction: "incoming",
          from: "+97455550000",
          to: "+97440000000",
          connection_id: "conn-1",
          client_state: encodeClientState({ step: "ivr" }),
        },
      },
    });
    expect(ev).toMatchObject({
      eventType: "call.initiated",
      callControlId: "v3:abc",
      direction: "incoming",
      from: "+97455550000",
      to: "+97440000000",
      connectionId: "conn-1",
      clientState: { step: "ivr" },
    });
  });

  it("returns null for flat demo bodies", () => {
    expect(parseTelnyxEvent({ from: "+1", to: "+2" })).toBeNull();
    expect(parseTelnyxEvent(null)).toBeNull();
  });
});

describe("client state + voice", () => {
  it("round-trips client_state and tolerates garbage", () => {
    expect(decodeClientState(encodeClientState({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeClientState("%%%")).toEqual({});
    expect(decodeClientState(undefined)).toEqual({});
  });

  it("picks Arabic vs English Neural voices", () => {
    expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة")).toEqual({
      voice: "Polly.Hala-Neural",
      language: "ar-AE",
    });
    expect(pickSpeakVoice("Hello")).toEqual({
      voice: "Polly.Joanna-Neural",
      language: "en-US",
    });
    // Bilingual Language menu must stay en-US so DTMF barge-in works for digit 0.
    expect(
      pickSpeakVoice(
        "Thank you for calling E3. For English, press 1. للعربية، اضغط 2. To speak with an agent, press 0.",
      ).language,
    ).toBe("en-US");
    // Standard Polly ids upgrade to Neural for more natural speech.
    expect(pickSpeakVoice("Hello", "Polly.Joanna").voice).toBe("Polly.Joanna-Neural");
    expect(pickSpeakVoice("Hello", "Polly.Joanna-Neural").voice).toBe("Polly.Joanna-Neural");
    // Legacy Google-style id → natural Polly Neural default (not basic female).
    expect(pickSpeakVoice("Hello", "en-US-Neural2-A").voice).toBe("Polly.Joanna-Neural");
    // EN Polly on Arabic-majority text → Arabic Polly Neural (Polly ignores language).
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Joanna-Neural").voice,
    ).toBe("Polly.Hala-Neural");
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Hala-Neural").voice,
    ).toBe("Polly.Hala-Neural");
    // Zeina is MSA — keep arb when explicitly configured.
    expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Zeina")).toEqual({
      voice: "Polly.Zeina",
      language: "arb",
    });
  });


  it("coerces numeric DTMF digits from Telnyx payloads", () => {
    const ev = parseTelnyxEvent({
      data: {
        id: "evt-gather",
        event_type: "call.gather.ended",
        payload: {
          call_control_id: "v3:abc",
          digits: 0,
          status: "valid",
        },
      },
    });
    expect(ev?.digits).toBe("0");
  });
});

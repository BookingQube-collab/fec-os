import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSpeakPayload } from "./ivr-tts-voice";
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

  it("picks Arabic Azure Fatima vs English Azure Ava", () => {
    expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة")).toEqual({
      voice: "Azure.ar-AE-FatimaNeural",
      language: "ar-AE",
    });
    expect(pickSpeakVoice("Hello")).toEqual({
      voice: "Azure.en-US-AvaMultilingualNeural",
      language: "en-US",
    });
    // Bilingual Language menu must stay en-US so DTMF barge-in works for digit 0.
    expect(
      pickSpeakVoice(
        "Thank you for calling E3. For English, press 1. للعربية، اضغط 2. To speak with an agent, press 0.",
      ),
    ).toEqual({
      voice: "Azure.en-US-AvaMultilingualNeural",
      language: "en-US",
    });
    // Saved Polly Joanna / Jenny auto-upgrade to Azure Ava Multilingual.
    expect(pickSpeakVoice("Hello", "Polly.Joanna").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(pickSpeakVoice("Hello", "Polly.Joanna-Neural").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(pickSpeakVoice("Hello", "Azure.en-US-JennyNeural").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(pickSpeakVoice("Hello", "Polly.Matthew-Neural").voice).toBe(
      "Azure.en-US-AndrewMultilingualNeural",
    );
    // Legacy Google-style id → Azure Ava Multilingual default.
    expect(pickSpeakVoice("Hello", "en-US-Neural2-A").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    // EN Polly/Azure on Arabic-majority text → Azure Fatima (Gulf), not Polly Hala.
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Joanna-Neural").voice,
    ).toBe("Azure.ar-AE-FatimaNeural");
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Azure.en-US-AvaMultilingualNeural")
        .voice,
    ).toBe("Azure.ar-AE-FatimaNeural");
    // Saved Polly.Hala (from prior Gulf push) auto-upgrades to Azure Fatima.
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Hala-Neural").voice,
    ).toBe("Azure.ar-AE-FatimaNeural");
    expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Zayd")).toEqual({
      voice: "Azure.ar-AE-HamdanNeural",
      language: "ar-AE",
    });
    // Zeina MSA → Azure Fatima Gulf (not Polly Hala).
    expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Zeina")).toEqual({
      voice: "Azure.ar-AE-FatimaNeural",
      language: "ar-AE",
    });
    // Arabic-only saved voice must not speak English prompts.
    expect(pickSpeakVoice("Hello", "Polly.Hala-Neural").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(pickSpeakVoice("Hello", "Azure.ar-AE-FatimaNeural").voice).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    // Explicit Azure Fatima on Arabic stays Fatima.
    expect(
      pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Azure.ar-AE-FatimaNeural"),
    ).toEqual({
      voice: "Azure.ar-AE-FatimaNeural",
      language: "ar-AE",
    });
  });

  it("wraps Azure EN and AR speak in conversational SSML with menu breaks", () => {
    const ar = buildSpeakPayload("مرحباً بكم. اضغط 1", "Azure.ar-AE-FatimaNeural");
    expect(ar.payload_type).toBe("ssml");
    expect(ar.payload).toContain('<prosody rate="92%" pitch="-1%">');
    expect(ar.payload).toContain("مرحباً بكم");
    expect(ar.payload).toContain('<break time="400ms"/>');
    expect(ar.payload).toContain('<break time="250ms"/>اضغط 1');

    const en = buildSpeakPayload(
      "Thank you for calling. For English, press 1.",
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(en.payload_type).toBe("ssml");
    expect(en.payload).toContain('<prosody rate="92%" pitch="-1%">');
    expect(en.payload).toContain('<break time="400ms"/>');
    expect(en.payload).toContain('<break time="250ms"/>press 1');

    // Explicit legacy Polly (if somehow kept) stays plain text.
    expect(buildSpeakPayload("Hello", "Polly.Hala-Neural")).toEqual({
      payload: "Hello",
      payload_type: "text",
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

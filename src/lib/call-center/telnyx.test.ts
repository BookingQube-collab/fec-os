import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSpeakPayload, callControlSpeakLanguage } from "./ivr-tts-voice";
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

  it("picks Arabic Azure Fatima vs English Polly Joanna", () => {
    const prevEleven = process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    try {
      expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة")).toEqual({
        voice: "Azure.ar-AE-FatimaNeural",
        language: "ar-AE",
      });
      expect(pickSpeakVoice("Hello")).toEqual({
        voice: "Polly.Joanna-Neural",
        language: "en-US",
      });
      // Explicit Settings AR ElevenLabs without secret → Fatima (avoid failed Speak).
      expect(
        pickSpeakVoice(
          "مرحباً بكم في إي ثري اختر اللغة",
          "Polly.Joanna-Neural",
          "ElevenLabs.eleven_multilingual_v2.abc123",
        ).voice,
      ).toBe("Azure.ar-AE-FatimaNeural");
      // Bilingual Language menu must stay en-US so DTMF barge-in works for digit 0.
      expect(
        pickSpeakVoice(
          "Thank you for calling E3. For English, press 1. للعربية، اضغط 2. To speak with an agent, press 0.",
        ),
      ).toEqual({
        voice: "Polly.Joanna-Neural",
        language: "en-US",
      });
      // Polly Neural stays; Multilingual Azure EN remapped to proven Polly.
      expect(pickSpeakVoice("Hello", "Polly.Joanna").voice).toBe("Polly.Joanna-Neural");
      expect(pickSpeakVoice("Hello", "Polly.Joanna-Neural").voice).toBe("Polly.Joanna-Neural");
      expect(pickSpeakVoice("Hello", "Azure.en-US-JennyNeural").voice).toBe(
        "Azure.en-US-JennyNeural",
      );
      expect(pickSpeakVoice("Hello", "Azure.en-US-AvaMultilingualNeural").voice).toBe(
        "Polly.Joanna-Neural",
      );
      expect(pickSpeakVoice("Hello", "Polly.Matthew-Neural").voice).toBe("Polly.Matthew-Neural");
      expect(pickSpeakVoice("Hello", "Azure.en-US-AndrewMultilingualNeural").voice).toBe(
        "Polly.Matthew-Neural",
      );
      // Legacy Google-style id → Polly Joanna Neural default.
      expect(pickSpeakVoice("Hello", "en-US-Neural2-A").voice).toBe("Polly.Joanna-Neural");
      // EN Polly/Azure on Arabic-majority text → Azure Fatima (Gulf), not Polly Hala.
      expect(
        pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Polly.Joanna-Neural").voice,
      ).toBe("Azure.ar-AE-FatimaNeural");
      expect(
        pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Azure.en-US-JennyNeural").voice,
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
      expect(pickSpeakVoice("Hello", "Polly.Hala-Neural").voice).toBe("Polly.Joanna-Neural");
      expect(pickSpeakVoice("Hello", "Azure.ar-AE-FatimaNeural").voice).toBe("Polly.Joanna-Neural");
      // Explicit Azure Fatima on Arabic stays Fatima (no ElevenLabs secret).
      expect(
        pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", "Azure.ar-AE-FatimaNeural"),
      ).toEqual({
        voice: "Azure.ar-AE-FatimaNeural",
        language: "ar-AE",
      });
    } finally {
      if (prevEleven === undefined) delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
      else process.env.TELNYX_ELEVENLABS_API_KEY_REF = prevEleven;
    }
  });

  it("auto-upgrades Joanna/Fatima to ElevenLabs when TELNYX_ELEVENLABS_API_KEY_REF is set", () => {
    const prevEleven = process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    process.env.TELNYX_ELEVENLABS_API_KEY_REF = "elevenlabs_secret_id";
    try {
      expect(pickSpeakVoice("Hello").voice).toBe(
        "ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM",
      );
      expect(pickSpeakVoice("Hello", "Polly.Joanna-Neural").voice).toBe(
        "ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM",
      );
      expect(pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة").voice).toBe(
        "ElevenLabs.eleven_multilingual_v2.XB0fDUnXU5powFXDhCwa",
      );
      expect(
        pickSpeakVoice(
          "مرحباً بكم في إي ثري اختر اللغة",
          "Polly.Joanna-Neural",
          "Azure.ar-AE-FatimaNeural",
        ).voice,
      ).toBe("ElevenLabs.eleven_multilingual_v2.XB0fDUnXU5powFXDhCwa");
      // Explicit custom ElevenLabs AR wins.
      expect(
        pickSpeakVoice(
          "مرحباً بكم في إي ثري اختر اللغة",
          "Polly.Joanna-Neural",
          "ElevenLabs.eleven_multilingual_v2.abc123",
        ).voice,
      ).toBe("ElevenLabs.eleven_multilingual_v2.abc123");
      // Non-default EN Azure Jenny is left alone (not auto-upgraded).
      expect(pickSpeakVoice("Hello", "Azure.en-US-JennyNeural").voice).toBe(
        "Azure.en-US-JennyNeural",
      );
      // Male Gulf Hamdan left alone.
      expect(
        pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", undefined, "Azure.ar-AE-HamdanNeural")
          .voice,
      ).toBe("Azure.ar-AE-HamdanNeural");
    } finally {
      if (prevEleven === undefined) delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
      else process.env.TELNYX_ELEVENLABS_API_KEY_REF = prevEleven;
    }
  });

  it("keeps speak payload as plain text (no SSML) for Azure and Polly", () => {
    expect(buildSpeakPayload("مرحباً بكم. اضغط 1", "Azure.ar-AE-FatimaNeural")).toEqual({
      payload: "مرحباً بكم. اضغط 1",
      payload_type: "text",
    });
    expect(
      buildSpeakPayload(
        "Thank you for calling. For English, press 1.",
        "Polly.Joanna-Neural",
      ),
    ).toEqual({
      payload: "Thank you for calling. For English, press 1.",
      payload_type: "text",
    });
    expect(buildSpeakPayload("Hello", "Azure.en-US-JennyNeural")).toEqual({
      payload: "Hello",
      payload_type: "text",
    });
  });

  it("omits Call Control language for Azure Fatima (ar-AE is not in Speak enum)", () => {
    // Root cause of live Fatima failure: language=ar-AE → invalid_enumerated_value.
    expect(callControlSpeakLanguage("Azure.ar-AE-FatimaNeural", "ar-AE")).toBeUndefined();
    expect(callControlSpeakLanguage("Azure.ar-AE-HamdanNeural", "ar-AE")).toBeUndefined();
    expect(callControlSpeakLanguage("Polly.Joanna-Neural", "en-US")).toBeUndefined();
    expect(callControlSpeakLanguage("female", "en-US")).toBe("en-US");
    expect(callControlSpeakLanguage("female", "arb")).toBe("arb");
    // Semantic pick still returns ar-AE for TeXML/REST; Call Control must sanitize.
    const picked = pickSpeakVoice(
      "مرحباً بكم في إي ثري اختر اللغة",
      "Polly.Joanna-Neural",
      "Azure.ar-AE-FatimaNeural",
    );
    expect(picked.voice).toBe("Azure.ar-AE-FatimaNeural");
    expect(picked.language).toBe("ar-AE");
    expect(callControlSpeakLanguage(picked.voice, picked.language)).toBeUndefined();
  });

  it("honors settings ElevenLabs ref without env", () => {
    const prevEleven = process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    try {
      expect(
        pickSpeakVoice("Hello", "Polly.Joanna-Neural", undefined, {
          elevenLabsApiKeyRef: "settings_secret_id",
        }).voice,
      ).toBe("ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM");
      expect(
        pickSpeakVoice("مرحباً بكم في إي ثري اختر اللغة", undefined, "Azure.ar-AE-FatimaNeural", {
          elevenLabsApiKeyRef: "settings_secret_id",
        }).voice,
      ).toBe("ElevenLabs.eleven_multilingual_v2.XB0fDUnXU5powFXDhCwa");
    } finally {
      if (prevEleven === undefined) delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
      else process.env.TELNYX_ELEVENLABS_API_KEY_REF = prevEleven;
    }
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

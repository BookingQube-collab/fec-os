import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import {
  texmlCallIds,
  texmlConference,
  texmlDialSip,
  texmlGatherMenu,
  texmlQueueWait,
  updateTexmlCall,
} from "./texml";

describe("texmlConference", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("cdn.example") || url.includes("/ivr/")) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts the live leg into a named conference without redial", async () => {
    const xml = await texmlConference({
      name: "fecabc123",
      beep: false,
      endConferenceOnExit: false,
    });
    expect(xml).toContain("<Conference");
    expect(xml).toContain(">fecabc123</Conference>");
    expect(xml).toContain('beep="false"');
    expect(xml).toContain('startConferenceOnEnter="true"');
    expect(xml).toContain('maxParticipants="2"');
  });

  it("prepends recording disclosure Say before Dial when preSay is set", async () => {
    const xml = await texmlConference({
      name: "fecabc123",
      voice: "Polly.Joanna-Neural",
      preSay: "Please note that this call may be recorded for quality and training purposes.",
    });
    expect(xml).toContain('voice="Polly.Joanna-Neural"');
    expect(xml).not.toContain("effect=");
    expect(xml).not.toContain("voiceSpeed=");
    expect(xml).not.toContain("<prosody");
    expect(xml).not.toContain("<speak>");
    // Polly ignores language — omit attr (voice id is enough).
    expect(xml).not.toContain("language=");
    expect(xml).toContain(
      "Please note that this call may be recorded for quality and training purposes.",
    );
    expect(xml.indexOf("<Say")).toBeLessThan(xml.indexOf("<Dial>"));
  });

  it("rewrites stale MSA Arabic preSay to Gulf and uses TeXML-safe Polly Hala without Azure BYOK", async () => {
    const prevAzure = process.env.TELNYX_AZURE_API_KEY_REF;
    delete process.env.TELNYX_AZURE_API_KEY_REF;
    try {
      const xml = await texmlConference({
        name: "fecabc123",
        voice: "Polly.Joanna-Neural",
        voiceAr: "Azure.ar-AE-FatimaNeural",
        preSay: "يرجى ملاحظة أن هذه المكالمة قد يتم تسجيلها لأغراض الجودة والتدريب.",
        preferLang: "ar",
      });
      expect(xml).toContain("المكالمة هذي ممكن تنسجل");
      // Without Azure api_key_ref, Fatima Say is silent on TeXML — remap to Hala.
      expect(xml).toContain('voice="Polly.Hala-Neural"');
      expect(xml).not.toContain("Azure.ar-AE-FatimaNeural");
      expect(xml).not.toContain('language="ar-AE"');
      expect(xml).not.toContain("effect=");
      expect(xml).not.toContain("<prosody");
    } finally {
      if (prevAzure === undefined) delete process.env.TELNYX_AZURE_API_KEY_REF;
      else process.env.TELNYX_AZURE_API_KEY_REF = prevAzure;
    }
  });

  it("prefers prePlayUrl over TTS preSay for human bridge clips", async () => {
    const xml = await texmlConference({
      name: "fecabc123",
      voice: "Polly.Joanna-Neural",
      preSay: "Please note that this call may be recorded.",
      prePlayUrl: "https://cdn.example/bridge-en.mp3",
    });
    expect(xml).toContain(
      '<Play continueOnError="true">https://cdn.example/bridge-en.mp3</Play>',
    );
    expect(xml).not.toContain("Please note that this call may be recorded.");
    expect(xml.indexOf("<Play")).toBeLessThan(xml.indexOf("<Dial>"));
  });

  it("falls back to Say when prePlayUrl is unreachable", async () => {
    const xml = await texmlConference({
      name: "fecabc123",
      voice: "Polly.Joanna-Neural",
      preSay: "Please note that this call may be recorded.",
      prePlayUrl: "https://missing.example/gone.mp3",
    });
    expect(xml).not.toContain("<Play>");
    expect(xml).toContain("Please note that this call may be recorded.");
  });
});

describe("texmlGatherMenu", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("cdn.example")) return new Response(null, { status: 200 });
        return new Response(null, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays reachable audio without stacking Say", async () => {
    const xml = await texmlGatherMenu({
      actionUrl: "https://example.com/gather",
      timeoutRedirectUrl: "https://example.com/texml",
      prompt: "For English press 1.",
      voice: "Polly.Joanna-Neural",
      audioUrl: "https://cdn.example/lang.mp3",
    });
    expect(xml).toContain('<Play continueOnError="true">https://cdn.example/lang.mp3</Play>');
    expect(xml).not.toContain("For English press 1.");
    expect(xml).toContain("We did not receive any input.");
  });

  it("uses Say when audio URL is unreachable", async () => {
    const xml = await texmlGatherMenu({
      actionUrl: "https://example.com/gather",
      timeoutRedirectUrl: "https://example.com/texml",
      prompt: "For English press 1.",
      voice: "Polly.Joanna-Neural",
      audioUrl: "https://missing.example/lang.mp3",
    });
    expect(xml).not.toContain("<Play>");
    expect(xml).toContain("For English press 1.");
  });

  it("uses Say for Piper /ivr/ language menu when OSS Play is off (default)", async () => {
    const prevOss = process.env.IVR_OSS_PLAY_ENABLED;
    const prevVerified = process.env.IVR_OSS_PLAY_VERIFIED;
    delete process.env.IVR_OSS_PLAY_ENABLED;
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    try {
      const xml = await texmlGatherMenu({
        actionUrl: "https://example.com/gather",
        timeoutRedirectUrl: "https://example.com/texml",
        prompt: "Thank you for calling E3. For English press 1. For Arabic press 2.",
        voice: "Polly.Joanna-Neural",
        audioUrl: "https://e3fec.vercel.app/ivr/en/language-menu.mp3",
      });
      expect(xml).not.toContain("<Play>");
      expect(xml).toContain("<Say");
      expect(xml).toContain("For English press 1");
    } finally {
      if (prevOss === undefined) delete process.env.IVR_OSS_PLAY_ENABLED;
      else process.env.IVR_OSS_PLAY_ENABLED = prevOss;
      if (prevVerified === undefined) delete process.env.IVR_OSS_PLAY_VERIFIED;
      else process.env.IVR_OSS_PLAY_VERIFIED = prevVerified;
    }
  });

  it("emits ElevenLabs Say + api_key_ref when TELNYX_ELEVENLABS_API_KEY_REF is set", async () => {
    const prevEleven = process.env.TELNYX_ELEVENLABS_API_KEY_REF;
    process.env.TELNYX_ELEVENLABS_API_KEY_REF = "elevenlabs_secret_id";
    try {
      const xml = await texmlGatherMenu({
        actionUrl: "https://example.com/gather",
        timeoutRedirectUrl: "https://example.com/texml",
        prompt: "For English press 1.",
        voice: "Polly.Joanna-Neural",
      });
      expect(xml).toContain('voice="ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM"');
      expect(xml).toContain('api_key_ref="elevenlabs_secret_id"');
      expect(xml).not.toContain("<Play>");
    } finally {
      if (prevEleven === undefined) delete process.env.TELNYX_ELEVENLABS_API_KEY_REF;
      else process.env.TELNYX_ELEVENLABS_API_KEY_REF = prevEleven;
    }
  });

  it("digit1 preferLang=en uses admin EN voice; digit2 preferLang=ar remaps Azure Fatima→Polly Hala without Azure BYOK", async () => {
    const prevAzure = process.env.TELNYX_AZURE_API_KEY_REF;
    delete process.env.TELNYX_AZURE_API_KEY_REF;
    try {
      const enXml = await texmlGatherMenu({
        actionUrl: "https://example.com/gather",
        timeoutRedirectUrl: "https://example.com/texml",
        prompt:
          "Please select the entertainment center you would like assistance with. For Inflata Park, press 1.",
        voice: "Polly.Matthew-Neural",
        voiceAr: "Azure.ar-AE-FatimaNeural",
        preferLang: "en",
      });
      expect(enXml).toContain('voice="Polly.Matthew-Neural"');
      expect(enXml).toContain("Inflata Park");
      expect(enXml).not.toContain("Azure.ar-AE-FatimaNeural");

      const arPrompt =
        "أي مركز تبيه المساعدة فيه؟ لإنفلاتا بارك في سيتي سنتر اضغط 1. لمدرسة القيادة للأطفال اضغط 2.";
      const arXml = await texmlGatherMenu({
        actionUrl: "https://example.com/gather",
        timeoutRedirectUrl: "https://example.com/texml",
        prompt: arPrompt,
        voice: "Polly.Matthew-Neural",
        voiceAr: "Azure.ar-AE-FatimaNeural",
        preferLang: "ar",
      });
      // TeXML Azure needs api_key_ref — without it Fatima Say is silent; Hala stays audible.
      expect(arXml).toContain('voice="Polly.Hala-Neural"');
      expect(arXml).not.toContain("Azure.ar-AE-FatimaNeural");
      expect(arXml).toContain("إنفلاتا بارك");
      expect(arXml).not.toContain('language="ar-AE"');
      expect(arXml).not.toContain("<Play>");
      expect(arXml).toContain("<Gather");
    } finally {
      if (prevAzure === undefined) delete process.env.TELNYX_AZURE_API_KEY_REF;
      else process.env.TELNYX_AZURE_API_KEY_REF = prevAzure;
    }
  });

  it("keeps Azure Fatima on TeXML when azureApiKeyRef is provided", async () => {
    const arPrompt = "أي مركز تبيه المساعدة فيه؟ لإنفلاتا بارك اضغط 1.";
    const arXml = await texmlGatherMenu({
      actionUrl: "https://example.com/gather",
      timeoutRedirectUrl: "https://example.com/texml",
      prompt: arPrompt,
      voice: "Polly.Joanna-Neural",
      voiceAr: "Azure.ar-AE-FatimaNeural",
      preferLang: "ar",
      azureApiKeyRef: "azure_secret_id",
    });
    expect(arXml).toContain('voice="Azure.ar-AE-FatimaNeural"');
    expect(arXml).toContain('api_key_ref="azure_secret_id"');
    expect(arXml).not.toContain('language="ar-AE"');
  });

  it("splits Language menu into EN Say + AR Say with distinct voices", async () => {
    const prevAzure = process.env.TELNYX_AZURE_API_KEY_REF;
    delete process.env.TELNYX_AZURE_API_KEY_REF;
    try {
      const xml = await texmlGatherMenu({
        actionUrl: "https://example.com/gather",
        timeoutRedirectUrl: "https://example.com/texml",
        prompt:
          "Thank you for calling E3, Events and Entertainment Enterprises. For English, press 1. To speak with an agent, press 0.",
        promptAr:
          "شكراً لاتصالك بـ E3 للفعاليات والترفيه. للإنجليزي اضغط 1. للعربي اضغط 2. عشان تتكلم مع موظف اضغط 0.",
        voice: "Polly.Joanna-Neural",
        voiceAr: "Azure.ar-AE-FatimaNeural",
      });
      expect(xml).toContain('voice="Polly.Joanna-Neural"');
      expect(xml).toContain("For English, press 1");
      expect(xml).toContain('voice="Polly.Hala-Neural"');
      expect(xml).toContain("للعربي اضغط 2");
      // Two Say verbs inside Gather (EN then AR).
      const gatherInner = xml.match(/<Gather[^>]*>([\s\S]*)<\/Gather>/)?.[1] ?? "";
      expect(gatherInner.match(/<Say /g)?.length).toBe(2);
      expect(gatherInner).not.toContain("للعربية، اضغط 2");
    } finally {
      if (prevAzure === undefined) delete process.env.TELNYX_AZURE_API_KEY_REF;
      else process.env.TELNYX_AZURE_API_KEY_REF = prevAzure;
    }
  });
});

describe("texmlDialSip", () => {
  it("emits Dial Sip with answerOnBridge and no pre-Dial Speak", () => {
    const xml = texmlDialSip({
      sipUri: "sip:abc123@k4xpy1vcnur.us.sip.livekit.cloud",
      callerId: "+18704772102",
      failureRedirectUrl: "https://example.com/texml",
    });
    expect(xml).toContain(
      '<Dial timeout="55" callerId="+18704772102" answerOnBridge="true">',
    );
    expect(xml).toContain("<Sip>sip:abc123@k4xpy1vcnur.us.sip.livekit.cloud</Sip>");
    expect(xml).not.toContain("Connecting you now.");
    expect(xml).toContain('<Redirect method="POST">https://example.com/texml</Redirect>');
  });
});

describe("texmlQueueWait", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a short pause by default for faster Answer pickup", async () => {
    const xml = await texmlQueueWait({
      redirectUrl: "https://example.com/texml",
    });
    expect(xml).toContain('<Pause length="3"/>');
  });
});

describe("texmlCallIds", () => {
  it("reads AccountSid for TeXML Update Call", () => {
    expect(
      texmlCallIds({
        CallSid: "v3:abc",
        AccountSid: "f5586561-8ff0-4291-a51b-c7dfe4139ff9",
        From: "+97450080408",
        To: "+18704772102",
      }).accountSid,
    ).toBe("f5586561-8ff0-4291-a51b-c7dfe4139ff9");
  });
});

describe("updateTexmlCall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts Status=completed as form-urlencoded (not JSON)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "completed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateTexmlCall({
      apiKey: "KEY",
      accountSid: "a6153688-7618-424f-a58c-3d2f97467d1c",
      callSid: "v3:abc",
      status: "completed",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("completed");
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(init.body)).toBe("Status=completed");
    expect(String(init.body)).not.toContain("{");
  });
});

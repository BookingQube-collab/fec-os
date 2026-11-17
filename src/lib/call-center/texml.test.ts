import { describe, expect, it, vi, afterEach } from "vitest";

import {
  texmlCallIds,
  texmlConference,
  texmlDialSip,
  texmlQueueWait,
  updateTexmlCall,
} from "./texml";

describe("texmlConference", () => {
  it("puts the live leg into a named conference without redial", () => {
    const xml = texmlConference({
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
    expect(xml).toContain("<Redirect method=\"POST\">https://example.com/texml</Redirect>");
  });
});

describe("texmlQueueWait", () => {
  it("uses a short pause by default for faster Answer pickup", () => {
    const xml = texmlQueueWait({
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
    const fetchMock = vi.fn(async () =>
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

import { describe, expect, it } from "vitest";

import { texmlCallIds, texmlDialSip, texmlQueueWait } from "./texml";

describe("texmlDialSip", () => {
  it("emits Dial Sip with connecting prompt", () => {
    const xml = texmlDialSip({
      sipUri: "sip:abc123@k4xpy1vcnur.us.sip.livekit.cloud",
      callerId: "+18704772102",
      failureRedirectUrl: "https://example.com/texml",
    });
    expect(xml).toContain('<Dial timeout="30" callerId="+18704772102">');
    expect(xml).toContain("<Sip>sip:abc123@k4xpy1vcnur.us.sip.livekit.cloud</Sip>");
    expect(xml).toContain("Connecting you now.");
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

import { describe, expect, it } from "vitest";

import {
  assertSendPulseWebhookAuth,
  buildSendPulseDedupeKey,
  classifySendPulseEvent,
  getSendPulseWhatsappBridgePolicy,
  normalizeSendPulsePhone,
  parseSendPulseWebhookBody,
  sendPulsePhoneDigitsEqual,
} from "./sendpulse";

describe("classifySendPulseEvent", () => {
  it("routes known titles", () => {
    expect(classifySendPulseEvent("open_chat")).toBe("ticket");
    expect(classifySendPulseEvent("incoming_message")).toBe("ticket");
    expect(classifySendPulseEvent("new_subscriber")).toBe("contact_only");
    expect(classifySendPulseEvent("outgoing_message")).toBe("ignore");
    expect(classifySendPulseEvent("FEC Handoff")).toBe("ticket");
  });
});

describe("parseSendPulseWebhookBody", () => {
  it("parses SendPulse open_chat array payload", () => {
    const events = parseSendPulseWebhookBody([
      {
        info: null,
        service: "telegram",
        title: "open_chat",
        bot: { id: "bot1", name: "BEST" },
        contact: {
          name: "veronica",
          last_message: "Need help",
          variables: { Phone: "97455551234", Email: "v@example.com" },
          id: "contact-1",
          tags: ["vip"],
        },
        date: 16377587917546,
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "open_chat",
      service: "telegram",
      contactId: "contact-1",
      contactName: "veronica",
      phone: "+97455551234",
      email: "v@example.com",
      lastMessage: "Need help",
    });
  });

  it("parses incoming_message with channel message id", () => {
    const events = parseSendPulseWebhookBody([
      {
        info: {
          message: {
            channel_data: {
              message: { id: "ABC-msg-1", text: { body: "hey" } },
              message_id: "ABC-msg-1",
            },
            id: "sp-msg-row",
          },
        },
        service: "whatsapp",
        title: "incoming_message",
        bot: { id: "bot-wa" },
        contact: {
          name: "Alexander",
          last_message: "hey",
          phone: "+380932674329",
          id: "wa-contact",
        },
        date: 1625834714,
      },
    ]);
    expect(events[0]?.messageId).toBe("ABC-msg-1");
    expect(events[0]?.phone).toBe("+380932674329");
  });

  it("parses flat demo handoff body", () => {
    const events = parseSendPulseWebhookBody({
      event: "open_chat",
      phone: "97455550000",
      name: "Guest",
      summary: "Billing help",
      channel: "whatsapp",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("open_chat");
    expect(events[0]?.phone).toBe("+97455550000");
    expect(events[0]?.lastMessage).toBe("Billing help");
  });
});

describe("buildSendPulseDedupeKey", () => {
  it("prefers message id then open_chat contact key", () => {
    expect(
      buildSendPulseDedupeKey({
        title: "incoming_message",
        service: "whatsapp",
        date: 1,
        botId: "",
        botName: "",
        contactId: "c1",
        contactName: "A",
        phone: "+1",
        email: "",
        lastMessage: "hi",
        tags: [],
        messageId: "m1",
        raw: {},
      }),
    ).toBe("sp:incoming_message:msg:m1");

    expect(
      buildSendPulseDedupeKey({
        title: "open_chat",
        service: "telegram",
        date: 2,
        botId: "",
        botName: "",
        contactId: "c9",
        contactName: "A",
        phone: "",
        email: "",
        lastMessage: "",
        tags: [],
        messageId: "",
        raw: {},
      }),
    ).toBe("sp:open_chat:contact:c9");
  });
});

describe("normalizeSendPulsePhone", () => {
  it("adds plus and strips noise", () => {
    expect(normalizeSendPulsePhone("974 5555-0000")).toBe("+97455550000");
    expect(normalizeSendPulsePhone("+974 5555 0000")).toBe("+97455550000");
  });
});

describe("getSendPulseWhatsappBridgePolicy", () => {
  it("defaults to separate mode without inbox mirror", () => {
    const policy = getSendPulseWhatsappBridgePolicy({
      SENDPULSE_WHATSAPP_NUMBER: "+97411110000",
      CALL_CENTER_WHATSAPP_NUMBER: "+97422220000",
    } as NodeJS.ProcessEnv);
    expect(policy.mode).toBe("separate");
    expect(policy.shouldMirrorInbox).toBe(false);
    expect(policy.numbersCollide).toBe(false);
  });

  it("warns when separate numbers collide", () => {
    const policy = getSendPulseWhatsappBridgePolicy({
      SENDPULSE_WHATSAPP_NUMBER: "97455550000",
      CALL_CENTER_WHATSAPP_NUMBER: "+97455550000",
    } as NodeJS.ProcessEnv);
    expect(policy.numbersCollide).toBe(true);
    expect(policy.shouldMirrorInbox).toBe(false);
    expect(policy.warnings.length).toBeGreaterThan(0);
  });

  it("enables mirror only when explicitly opted in and numbers are not different", () => {
    const shared = getSendPulseWhatsappBridgePolicy({
      SENDPULSE_MIRROR_WHATSAPP_INBOX: "true",
      SENDPULSE_WHATSAPP_NUMBER: "+97455550000",
      CALL_CENTER_WHATSAPP_NUMBER: "+97455550000",
    } as NodeJS.ProcessEnv);
    expect(shared.mode).toBe("shared");
    expect(shared.shouldMirrorInbox).toBe(true);

    const mismatched = getSendPulseWhatsappBridgePolicy({
      SENDPULSE_MIRROR_WHATSAPP_INBOX: "true",
      SENDPULSE_WHATSAPP_NUMBER: "+97411110000",
      CALL_CENTER_WHATSAPP_NUMBER: "+97422220000",
    } as NodeJS.ProcessEnv);
    expect(mismatched.shouldMirrorInbox).toBe(false);
    expect(mismatched.warnings.length).toBeGreaterThan(0);
  });

  it("compares phone digits loosely", () => {
    expect(sendPulsePhoneDigitsEqual("+974 5555 0000", "97455550000")).toBe(true);
    expect(sendPulsePhoneDigitsEqual("+97411110000", "+97422220000")).toBe(false);
  });
});

describe("assertSendPulseWebhookAuth", () => {
  it("accepts bearer and query secret", () => {
    const bearerReq = new Request("http://localhost/api/public/call-center/sendpulse", {
      headers: { authorization: "Bearer bridge-secret" },
    });
    expect(assertSendPulseWebhookAuth(bearerReq, { expectedSecret: "bridge-secret" })).toBeNull();

    const queryReq = new Request(
      "http://localhost/api/public/call-center/sendpulse?secret=bridge-secret",
    );
    expect(assertSendPulseWebhookAuth(queryReq, { expectedSecret: "bridge-secret" })).toBeNull();
  });

  it("rejects bad secret", () => {
    const req = new Request("http://localhost/api/public/call-center/sendpulse", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = assertSendPulseWebhookAuth(req, { expectedSecret: "bridge-secret" });
    expect(res?.status).toBe(401);
  });

  it("allows demo without secret", () => {
    const req = new Request("http://localhost/api/public/call-center/sendpulse?demo=1");
    expect(assertSendPulseWebhookAuth(req, { expectedSecret: "" })).toBeNull();
  });
});

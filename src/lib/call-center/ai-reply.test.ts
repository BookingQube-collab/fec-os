import { describe, expect, it } from "vitest";

import {
  adminGatewayGatherPrompt,
  buildCallCenterAiMessages,
  parseHandoffKeywords,
  resolveCallCenterAiLanguage,
  utteranceRequestsHandoff,
  usesAdminAiGateway,
} from "./ai-reply-helpers";

describe("usesAdminAiGateway", () => {
  it("treats admin_gateway and empty as admin routing", () => {
    expect(usesAdminAiGateway("admin_gateway")).toBe(true);
    expect(usesAdminAiGateway(null)).toBe(true);
    expect(usesAdminAiGateway(undefined)).toBe(true);
    expect(usesAdminAiGateway("openai")).toBe(false);
    expect(usesAdminAiGateway("livekit_agents")).toBe(false);
  });
});

describe("utteranceRequestsHandoff", () => {
  it("matches configured keywords case-insensitively", () => {
    expect(utteranceRequestsHandoff("Please get me an Agent", "agent,human")).toBe(true);
    expect(utteranceRequestsHandoff("أريد موظف", "agent,موظف")).toBe(true);
    expect(utteranceRequestsHandoff("What are your hours?", "agent,human")).toBe(false);
  });

  it("parses comma/semicolon lists", () => {
    expect(parseHandoffKeywords("agent, human; representative")).toEqual([
      "agent",
      "human",
      "representative",
    ]);
  });
});

describe("resolveCallCenterAiLanguage", () => {
  it("detects Arabic from utterance when auto", () => {
    expect(resolveCallCenterAiLanguage("auto", "مرحبا")).toBe("ar");
    expect(resolveCallCenterAiLanguage("auto", "Hello")).toBe("en");
    expect(resolveCallCenterAiLanguage("ar")).toBe("ar");
  });
});

describe("buildCallCenterAiMessages", () => {
  it("orders system, welcome, history, then user utterance", () => {
    const messages = buildCallCenterAiMessages({
      system: "sys",
      welcome: "hi",
      history: [{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }],
      utterance: "q2",
    });
    expect(messages).toEqual([
      { role: "system", content: "sys" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });
});

describe("adminGatewayGatherPrompt", () => {
  it("mentions digit zero for human handoff", () => {
    expect(adminGatewayGatherPrompt("en").toLowerCase()).toContain("zero");
    expect(adminGatewayGatherPrompt("ar")).toContain("صفر");
  });
});

import { describe, expect, it } from "vitest";

import { gatewayModelForCallCenterTest } from "./gateway-model";

describe("gatewayModelForCallCenterTest", () => {
  it("passes Gemini / OpenRouter style ids through", () => {
    expect(gatewayModelForCallCenterTest("gemini-flash-latest")).toBe("gemini-flash-latest");
    expect(gatewayModelForCallCenterTest("openrouter/free")).toBe("openrouter/free");
  });

  it("drops legacy OpenAI voice model ids so admin routing selected models apply", () => {
    expect(gatewayModelForCallCenterTest("gpt-4o-mini")).toBeUndefined();
    expect(gatewayModelForCallCenterTest("gpt-4o")).toBeUndefined();
    expect(gatewayModelForCallCenterTest("o1-mini")).toBeUndefined();
    expect(gatewayModelForCallCenterTest("")).toBeUndefined();
    expect(gatewayModelForCallCenterTest(null)).toBeUndefined();
  });
});

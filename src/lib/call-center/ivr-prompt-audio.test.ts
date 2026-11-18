import { describe, expect, it } from "vitest";

import { nodePromptAudioUrl, type IvrFlowNode } from "./ivr-flow";

function node(partial: Partial<IvrFlowNode["data"]>): IvrFlowNode {
  return {
    id: "n1",
    type: "menu",
    position: { x: 0, y: 0 },
    data: { label: "Language", ...partial },
  };
}

describe("nodePromptAudioUrl", () => {
  it("prefers language-specific clips over shared audioUrl", () => {
    const n = node({
      audioUrl: "https://cdn.example/shared.mp3",
      audioUrlEn: "https://cdn.example/en.mp3",
      audioUrlAr: "https://cdn.example/ar-qatar.mp3",
    });
    expect(nodePromptAudioUrl(n, "en")).toBe("https://cdn.example/en.mp3");
    expect(nodePromptAudioUrl(n, "ar")).toBe("https://cdn.example/ar-qatar.mp3");
  });

  it("falls back to shared audioUrl when language clip missing", () => {
    const n = node({ audioUrl: "https://cdn.example/shared.mp3" });
    expect(nodePromptAudioUrl(n, "en")).toBe("https://cdn.example/shared.mp3");
    expect(nodePromptAudioUrl(n, "ar")).toBe("https://cdn.example/shared.mp3");
  });

  it("returns empty when no clips configured", () => {
    expect(nodePromptAudioUrl(node({}), "en")).toBe("");
    expect(nodePromptAudioUrl(null, "ar")).toBe("");
  });
});

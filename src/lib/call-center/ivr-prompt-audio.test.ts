import { afterEach, describe, expect, it } from "vitest";

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
  const prev = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("prefers language-specific clips over shared audioUrl", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
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

  it("falls back to Piper OSS clips for known E3 menu labels", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    expect(nodePromptAudioUrl(node({ label: "Language" }), "en")).toBe(
      "https://e3fec.vercel.app/ivr/en/language-menu.mp3",
    );
    expect(nodePromptAudioUrl(node({ label: "Centers (EN)" }), "ar")).toBe(
      "https://e3fec.vercel.app/ivr/ar/center-menu.mp3",
    );
  });

  it("returns empty when no clips configured and label is unknown", () => {
    expect(nodePromptAudioUrl(node({ label: "Custom queue menu" }), "en")).toBe("");
    expect(nodePromptAudioUrl(null, "ar")).toBe("");
  });
});

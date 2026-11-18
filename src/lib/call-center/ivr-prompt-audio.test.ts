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
  const prevOss = process.env.IVR_OSS_PLAY_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
    if (prevOss === undefined) delete process.env.IVR_OSS_PLAY_ENABLED;
    else process.env.IVR_OSS_PLAY_ENABLED = prevOss;
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

  it("does not use Piper OSS clips by default (TTS path — avoids silent Play)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    expect(nodePromptAudioUrl(node({ label: "Language" }), "en")).toBe("");
    expect(
      nodePromptAudioUrl(
        node({
          label: "Language",
          audioUrlEn: "/ivr/en/language-menu.mp3",
          audioUrlAr: "/ivr/ar/language-menu.mp3",
        }),
        "en",
      ),
    ).toBe("");
  });

  it("uses Piper OSS clips when IVR_OSS_PLAY_ENABLED is set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    process.env.IVR_OSS_PLAY_ENABLED = "1";
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

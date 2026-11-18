import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_IVR_OSS_BRIDGE_AR,
  DEFAULT_IVR_OSS_BRIDGE_EN,
  defaultOssAudioForNodeLabel,
  ivrOssPromptPath,
  resolveBridgePromptAudioUrl,
  resolvePublicMediaUrl,
} from "./ivr-oss-prompts";

describe("ivr-oss-prompts", () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevApp2 = process.env.APP_URL;
  const prevVercel = process.env.VERCEL_URL;

  afterEach(() => {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevApp2 === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp2;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
  });

  it("maps prompt ids to public paths", () => {
    expect(ivrOssPromptPath("language-menu", "en")).toBe("/ivr/en/language-menu.mp3");
    expect(ivrOssPromptPath("language-menu", "ar")).toBe("/ivr/ar/language-menu.mp3");
    expect(ivrOssPromptPath("bridge-connecting", "en")).toBe(DEFAULT_IVR_OSS_BRIDGE_EN);
    expect(ivrOssPromptPath("bridge-connecting", "ar")).toBe(DEFAULT_IVR_OSS_BRIDGE_AR);
  });

  it("absolutizes relative /ivr paths for Telnyx Play", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    expect(resolvePublicMediaUrl("/ivr/en/language-menu.mp3")).toBe(
      "https://e3fec.vercel.app/ivr/en/language-menu.mp3",
    );
    expect(resolvePublicMediaUrl("https://cdn.example/x.mp3")).toBe("https://cdn.example/x.mp3");
    expect(resolvePublicMediaUrl("")).toBe("");
  });

  it("falls back to Piper OSS bridge clips when settings empty", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    expect(resolveBridgePromptAudioUrl("en", "", "")).toBe(
      "https://e3fec.vercel.app/ivr/en/bridge-connecting.mp3",
    );
    expect(resolveBridgePromptAudioUrl("ar", null, "  ")).toBe(
      "https://e3fec.vercel.app/ivr/ar/bridge-connecting.mp3",
    );
    expect(resolveBridgePromptAudioUrl("en", "https://cdn.example/custom-en.mp3", "")).toBe(
      "https://cdn.example/custom-en.mp3",
    );
  });

  it("picks OSS menu clips from node labels", () => {
    expect(defaultOssAudioForNodeLabel("Language", "en")).toBe("/ivr/en/language-menu.mp3");
    expect(defaultOssAudioForNodeLabel("المراكز (AR)", "ar")).toBe("/ivr/ar/center-menu.mp3");
    expect(defaultOssAudioForNodeLabel("Services · Inflata Park", "en")).toBe(
      "/ivr/en/service-menu.mp3",
    );
    expect(defaultOssAudioForNodeLabel("Queue", "en")).toBe("");
  });
});

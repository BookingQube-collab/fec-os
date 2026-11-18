import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_IVR_OSS_BRIDGE_AR,
  DEFAULT_IVR_OSS_BRIDGE_EN,
  defaultOssAudioForNodeLabel,
  isIvrOssMediaPath,
  ivrOssPlayEnabled,
  ivrOssPromptPath,
  mediaUrlReachable,
  resolveBridgePromptAudioUrl,
  resolvePlayableMediaUrl,
  resolvePublicMediaUrl,
} from "./ivr-oss-prompts";

describe("ivr-oss-prompts", () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevApp2 = process.env.APP_URL;
  const prevVercel = process.env.VERCEL_URL;
  const prevOss = process.env.IVR_OSS_PLAY_ENABLED;

  afterEach(() => {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevApp2 === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp2;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    if (prevOss === undefined) delete process.env.IVR_OSS_PLAY_ENABLED;
    else process.env.IVR_OSS_PLAY_ENABLED = prevOss;
    vi.unstubAllGlobals();
  });

  it("maps prompt ids to public paths", () => {
    expect(ivrOssPromptPath("language-menu", "en")).toBe("/ivr/en/language-menu.mp3");
    expect(ivrOssPromptPath("language-menu", "ar")).toBe("/ivr/ar/language-menu.mp3");
    expect(ivrOssPromptPath("bridge-connecting", "en")).toBe(DEFAULT_IVR_OSS_BRIDGE_EN);
    expect(ivrOssPromptPath("bridge-connecting", "ar")).toBe(DEFAULT_IVR_OSS_BRIDGE_AR);
  });

  it("detects OSS media paths", () => {
    expect(isIvrOssMediaPath("/ivr/en/language-menu.mp3")).toBe(true);
    expect(isIvrOssMediaPath("https://e3fec.vercel.app/ivr/ar/center-menu.mp3")).toBe(true);
    expect(isIvrOssMediaPath("https://cdn.example/custom.mp3")).toBe(false);
  });

  it("keeps OSS Play enabled by default", () => {
    delete process.env.IVR_OSS_PLAY_ENABLED;
    expect(ivrOssPlayEnabled()).toBe(true);
  });

  it("allows opting out of OSS Play", () => {
    process.env.IVR_OSS_PLAY_ENABLED = "0";
    expect(ivrOssPlayEnabled()).toBe(false);
    process.env.IVR_OSS_PLAY_ENABLED = "false";
    expect(ivrOssPlayEnabled()).toBe(false);
  });

  it("resolves Piper /ivr URLs when OSS Play is on (default)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    expect(resolvePublicMediaUrl("/ivr/en/language-menu.mp3")).toBe(
      "https://e3fec.vercel.app/ivr/en/language-menu.mp3",
    );
    expect(resolvePublicMediaUrl("https://cdn.example/x.mp3")).toBe("https://cdn.example/x.mp3");
    expect(resolvePublicMediaUrl("")).toBe("");

    process.env.IVR_OSS_PLAY_ENABLED = "0";
    expect(resolvePublicMediaUrl("/ivr/en/language-menu.mp3")).toBe("");
    expect(resolvePublicMediaUrl("https://e3fec.vercel.app/ivr/en/language-menu.mp3")).toBe("");
  });

  it("falls back to Piper OSS bridge clips when enabled and settings empty", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    expect(resolveBridgePromptAudioUrl("en", "", "")).toBe(
      "https://e3fec.vercel.app/ivr/en/bridge-connecting.mp3",
    );
    expect(resolveBridgePromptAudioUrl("ar", null, "  ")).toBe(
      "https://e3fec.vercel.app/ivr/ar/bridge-connecting.mp3",
    );
  });

  it("does not force Piper bridge clips when OSS Play is off", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    process.env.IVR_OSS_PLAY_ENABLED = "0";
    expect(resolveBridgePromptAudioUrl("en", "", "")).toBe("");
    expect(resolveBridgePromptAudioUrl("ar", null, "  ")).toBe("");
    expect(resolveBridgePromptAudioUrl("en", "https://cdn.example/custom-en.mp3", "")).toBe(
      "https://cdn.example/custom-en.mp3",
    );
    expect(resolveBridgePromptAudioUrl("en", "/ivr/en/bridge-connecting.mp3", "")).toBe("");
  });

  it("picks OSS menu clips from node labels", () => {
    expect(defaultOssAudioForNodeLabel("Language", "en")).toBe("/ivr/en/language-menu.mp3");
    expect(defaultOssAudioForNodeLabel("المراكز (AR)", "ar")).toBe("/ivr/ar/center-menu.mp3");
    expect(defaultOssAudioForNodeLabel("Services · Inflata Park", "en")).toBe(
      "/ivr/en/service-menu.mp3",
    );
    expect(defaultOssAudioForNodeLabel("Queue", "en")).toBe("");
  });

  it("checks media reachability before Play", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await mediaUrlReachable("https://cdn.example/ok.mp3")).toBe(true);
    expect(await resolvePlayableMediaUrl("https://cdn.example/ok.mp3")).toBe(
      "https://cdn.example/ok.mp3",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await resolvePlayableMediaUrl("https://cdn.example/missing.mp3")).toBe("");
  });
});

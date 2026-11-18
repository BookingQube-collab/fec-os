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
  const prevVerified = process.env.IVR_OSS_PLAY_VERIFIED;

  afterEach(() => {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevApp2 === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp2;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    if (prevOss === undefined) delete process.env.IVR_OSS_PLAY_ENABLED;
    else process.env.IVR_OSS_PLAY_ENABLED = prevOss;
    if (prevVerified === undefined) delete process.env.IVR_OSS_PLAY_VERIFIED;
    else process.env.IVR_OSS_PLAY_VERIFIED = prevVerified;
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

  it("keeps OSS Play disabled by default", () => {
    delete process.env.IVR_OSS_PLAY_ENABLED;
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    expect(ivrOssPlayEnabled()).toBe(false);
  });

  it("requires both ENABLED and VERIFIED flags", () => {
    process.env.IVR_OSS_PLAY_ENABLED = "1";
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    expect(ivrOssPlayEnabled()).toBe(false);

    delete process.env.IVR_OSS_PLAY_ENABLED;
    process.env.IVR_OSS_PLAY_VERIFIED = "1";
    expect(ivrOssPlayEnabled()).toBe(false);

    process.env.IVR_OSS_PLAY_ENABLED = "1";
    process.env.IVR_OSS_PLAY_VERIFIED = "1";
    expect(ivrOssPlayEnabled()).toBe(true);
  });

  it("blocks Piper /ivr URLs by default (TTS path)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    expect(resolvePublicMediaUrl("/ivr/en/language-menu.mp3")).toBe("");
    expect(resolvePublicMediaUrl("https://e3fec.vercel.app/ivr/en/language-menu.mp3")).toBe("");
    expect(resolvePublicMediaUrl("https://cdn.example/x.mp3")).toBe("https://cdn.example/x.mp3");
    expect(resolvePublicMediaUrl("")).toBe("");
  });

  it("resolves Piper /ivr URLs only when dual-verified", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    process.env.IVR_OSS_PLAY_ENABLED = "1";
    process.env.IVR_OSS_PLAY_VERIFIED = "1";
    expect(resolvePublicMediaUrl("/ivr/en/language-menu.mp3")).toBe(
      "https://e3fec.vercel.app/ivr/en/language-menu.mp3",
    );
  });

  it("does not force Piper bridge clips when OSS Play is off", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    expect(resolveBridgePromptAudioUrl("en", "", "")).toBe("");
    expect(resolveBridgePromptAudioUrl("ar", null, "  ")).toBe("");
    expect(resolveBridgePromptAudioUrl("en", "https://cdn.example/custom-en.mp3", "")).toBe(
      "https://cdn.example/custom-en.mp3",
    );
    expect(resolveBridgePromptAudioUrl("en", "/ivr/en/bridge-connecting.mp3", "")).toBe("");
  });

  it("falls back to Piper OSS bridge clips when dual-verified and settings empty", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    process.env.IVR_OSS_PLAY_ENABLED = "1";
    process.env.IVR_OSS_PLAY_VERIFIED = "1";
    expect(resolveBridgePromptAudioUrl("en", "", "")).toBe(
      "https://e3fec.vercel.app/ivr/en/bridge-connecting.mp3",
    );
    expect(resolveBridgePromptAudioUrl("ar", null, "  ")).toBe(
      "https://e3fec.vercel.app/ivr/ar/bridge-connecting.mp3",
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

  it("never resolves /ivr/ as playable without dual flags even if HEAD would succeed", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://e3fec.vercel.app";
    delete process.env.IVR_OSS_PLAY_ENABLED;
    delete process.env.IVR_OSS_PLAY_VERIFIED;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    expect(await resolvePlayableMediaUrl("/ivr/en/language-menu.mp3")).toBe("");
    expect(
      await resolvePlayableMediaUrl("https://e3fec.vercel.app/ivr/en/language-menu.mp3"),
    ).toBe("");
  });
});

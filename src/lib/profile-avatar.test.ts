import { describe, expect, it } from "vitest";

import {
  isProfileAvatarDataUrl,
  profileAvatarApiUrl,
  resolveSessionAvatarUrl,
} from "@/lib/profile-avatar";

describe("profile-avatar", () => {
  it("detects jpeg/png/webp data URLs", () => {
    expect(isProfileAvatarDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isProfileAvatarDataUrl("data:image/png;base64,iVBOR")).toBe(true);
    expect(isProfileAvatarDataUrl("https://cdn.example/a.jpg")).toBe(false);
    expect(isProfileAvatarDataUrl(null)).toBe(false);
  });

  it("builds a cache-busted API path", () => {
    expect(profileAvatarApiUrl(null)).toBe("/api/auth/avatar");
    expect(profileAvatarApiUrl("2026-10-22T10:00:00.000Z")).toBe(
      "/api/auth/avatar?v=2026-10-22T10%3A00%3A00.000Z",
    );
  });

  it("rewrites data URLs for session payloads and keeps http(s) / paths", () => {
    expect(
      resolveSessionAvatarUrl("data:image/jpeg;base64,/9j/4AAQ", "2026-01-01T00:00:00.000Z"),
    ).toBe("/api/auth/avatar?v=2026-01-01T00%3A00%3A00.000Z");
    expect(resolveSessionAvatarUrl("https://lh3.googleusercontent.com/a", null)).toBe(
      "https://lh3.googleusercontent.com/a",
    );
    expect(resolveSessionAvatarUrl("/api/people/staff/s1/photo?v=1", null)).toBe(
      "/api/people/staff/s1/photo?v=1",
    );
    expect(resolveSessionAvatarUrl(null, null, "/api/people/staff/s1/photo")).toBe(
      "/api/people/staff/s1/photo",
    );
    expect(resolveSessionAvatarUrl(null, null, null)).toBeNull();
  });
});

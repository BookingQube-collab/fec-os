import { describe, expect, it } from "vitest";

import { EMBER_TABS, emberTabById } from "@/lib/ember";

describe("ember native Team Chat tabs", () => {
  it("maps every tab to a Vercel-native surface", () => {
    expect(EMBER_TABS.map((t) => t.id)).toEqual([
      "workspace",
      "rooms",
      "newRoom",
      "dms",
      "activity",
      "search",
      "files",
      "bots",
      "agents",
      "profile",
      "push",
      "settings",
      "styles",
    ]);
    for (const tab of EMBER_TABS) {
      expect(tab.native.kind).toBeTruthy();
      expect(emberTabById(tab.id).href).toBe(tab.href);
    }
  });

  it("uses Chat Hub for core messaging tabs including activity", () => {
    expect(emberTabById("workspace").native).toEqual({ kind: "chat", surface: "all" });
    expect(emberTabById("activity").native).toEqual({ kind: "chat", surface: "activity" });
    expect(emberTabById("bots").native).toEqual({ kind: "bots" });
    expect(emberTabById("agents").native).toEqual({ kind: "agents" });
  });
});

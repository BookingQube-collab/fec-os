import { describe, expect, it } from "vitest";

import {
  conversationDisplayName,
  directPeerRoleLine,
  isGenericDirectTitle,
  rosterDisplayName,
  withDirectPeerLabels,
} from "./display-rules";

const label = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

describe("conversationDisplayName", () => {
  it("shows the other person on a direct chat, for either member", () => {
    expect(rosterDisplayName("AGNES KIRORIO")).toBe("Agnes Kirorio");
    expect(rosterDisplayName("Ruben Yaralyan")).toBe("Ruben Yaralyan");
    expect(
      conversationDisplayName({ kind: "DIRECT", title: null, peerName: "AGNES KIRORIO" }, label),
    ).toBe("Agnes Kirorio");
    expect(
      conversationDisplayName({ kind: "DIRECT", title: null, peerName: "Ruben Yaralyan" }, label),
    ).toBe("Ruben Yaralyan");
  });

  it("does not keep the word Direct when the other person is known", () => {
    expect(isGenericDirectTitle("Direct")).toBe(true);
    expect(isGenericDirectTitle("Direct message")).toBe(true);
    expect(
      conversationDisplayName({ kind: "DIRECT", title: "Direct", peerName: "Agnes Kirorio" }, label),
    ).toBe("Agnes Kirorio");
    expect(
      conversationDisplayName({ kind: "DIRECT", title: "Direct message", peerName: "Ruben Yaralyan" }, label),
    ).toBe("Ruben Yaralyan");
  });

  it("falls back only when the other person has no name", () => {
    expect(conversationDisplayName({ kind: "DIRECT", title: null, peerName: null }, label)).toBe("Direct");
    expect(conversationDisplayName({ kind: "DIRECT", title: "  Direct  ", peerName: "  " }, label)).toBe("Direct");
    expect(conversationDisplayName({ kind: "DIRECT", title: "Front desk", peerName: null }, label)).toBe("Front desk");
  });

  it("keeps a group title", () => {
    expect(conversationDisplayName({ kind: "PROJECT", title: "Phase 4", peerName: null }, label)).toBe("Phase 4");
    expect(conversationDisplayName({ kind: "TEAM", title: null, peerName: null }, label)).toBe("TEAM");
  });
});

describe("directPeerRoleLine", () => {
  it("matches a person row: code, then job title", () => {
    expect(directPeerRoleLine("1", "Managing Director / Chief Executive Officer")).toBe(
      "1 · Managing Director / Chief Executive Officer",
    );
    expect(directPeerRoleLine(null, "Cashier / Host")).toBe("Cashier / Host");
    expect(directPeerRoleLine("  ", "  ")).toBe("");
  });
});

describe("withDirectPeerLabels", () => {
  it("fills a nameless direct chat from the directory person", () => {
    const [row] = withDirectPeerLabels(
      [{ id: "dm", kind: "DIRECT", peerName: null, peerUserId: "agnes", peerJobTitle: null, peerEmployeeCode: null }],
      [{ userId: "agnes", fullName: "AGNES KIRORIO", jobTitle: "Barista", employeeCode: "INF-CC-STF16" }],
    );
    expect(row?.peerName).toBe("Agnes Kirorio");
    expect(row?.peerJobTitle).toBe("Barista");
    expect(row?.peerEmployeeCode).toBe("INF-CC-STF16");
  });
});

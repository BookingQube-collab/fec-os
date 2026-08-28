import { describe, expect, it } from "vitest";

import {
  LOCATION_ALIASES,
  formatLocationLabel,
  formatLocationName,
  formatLocationRecord,
  normalizeLocationKey,
  resolveLocationCode,
  rosterSheetLabel,
  ROSTER_SHEET_LABELS,
} from "./normalize";

describe("location normalize", () => {
  it("maps every canonical roster sheet label", () => {
    for (const [label, code] of Object.entries(ROSTER_SHEET_LABELS)) {
      expect(resolveLocationCode(label)).toBe(code);
      expect(LOCATION_ALIASES[normalizeLocationKey(label)]).toBe(code);
    }
  });

  it("maps Winter Mirage and Kids Mini aliases", () => {
    expect(resolveLocationCode("Winter Mirage Vendome Mall")).toBe("WM-VM");
    expect(resolveLocationCode("Kids Mini Driving School - Doha Mall")).toBe("KDS-DM");
    expect(resolveLocationCode("wm-vm")).toBe("WM-VM");
  });

  it("returns the Employee Roster sheet label for a venue code", () => {
    expect(rosterSheetLabel("KDS-CC")).toBe("Kids Driving School - City Center");
    expect(rosterSheetLabel("WM-VM")).toBe("Winter Mirage - Vendome Mall");
    expect(rosterSheetLabel("UNKNOWN", "Fallback")).toBe("Fallback");
  });

  it("does not invent a code for an unmapped venue", () => {
    expect(resolveLocationCode("Mystery Park - West Bay")).toBeNull();
  });

  it("matches locations table name + region when aliases miss", () => {
    const locations = [
      { id: "1", code: "UA-DM", name: "Urban Arena", region: "Doha Mall" },
    ];
    expect(resolveLocationCode("Urban Arena Doha Mall", locations)).toBe("UA-DM");
  });

  it("resolves combined display labels back to the venue code", () => {
    expect(resolveLocationCode("INF-CC — Inflatapark - City Center")).toBe("INF-CC");
    expect(resolveLocationCode("KDS-CC · Kids Driving School - City Center")).toBe("KDS-CC");
    expect(resolveLocationCode("Inflatapark - City Center")).toBe("INF-CC");
  });
});

describe("formatLocationLabel", () => {
  it("joins code and name with an em dash", () => {
    expect(formatLocationLabel("INF-CC", "Inflatapark - City Center")).toBe(
      "INF-CC — Inflatapark - City Center",
    );
  });

  it("skips empty parts", () => {
    expect(formatLocationLabel("INF-CC", "")).toBe("INF-CC");
    expect(formatLocationLabel(null, "Inflatapark")).toBe("Inflatapark");
    expect(formatLocationLabel("  ", "  ")).toBe("—");
    expect(formatLocationLabel("INF-CC", "INF-CC")).toBe("INF-CC");
  });

  it("composes live name and region, then the display label", () => {
    expect(formatLocationName("Inflatapark", "City Center Doha")).toBe("Inflatapark - City Center Doha");
    expect(formatLocationName("Inflatapark - City Center", "City Center")).toBe("Inflatapark - City Center");
    expect(
      formatLocationRecord({ code: "INF-CC", name: "Inflatapark", region: "City Center Doha" }),
    ).toBe("INF-CC — Inflatapark - City Center Doha");
  });
});

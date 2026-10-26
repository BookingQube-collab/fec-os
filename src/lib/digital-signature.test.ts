import { describe, expect, it } from "vitest";

import {
  canUploadDigitalSignature,
  decodeSignatureDataUrl,
  extensionForSignatureMime,
  isSignatureMime,
  knockOutSignatureWhiteBackground,
  signatureStoragePath,
} from "@/lib/digital-signature";

describe("canUploadDigitalSignature", () => {
  it("allows senior app roles", () => {
    expect(canUploadDigitalSignature({ roles: ["ceo"] })).toBe(true);
    expect(canUploadDigitalSignature({ roles: ["branch_gm"] })).toBe(true);
    expect(canUploadDigitalSignature({ roles: ["hr"] })).toBe(true);
    expect(canUploadDigitalSignature({ roles: ["regional_ops"] })).toBe(true);
  });

  it("allows senior job titles without a senior role", () => {
    expect(canUploadDigitalSignature({ roles: ["duty_manager"], jobTitle: "Head of Operations" })).toBe(
      true,
    );
    expect(canUploadDigitalSignature({ roles: ["duty_manager"], jobTitle: "General Manager" })).toBe(
      true,
    );
    expect(
      canUploadDigitalSignature({
        roles: ["duty_manager"],
        jobTitle: "Sr. Site Supervisor",
        staffRole: null,
      }),
    ).toBe(true);
    expect(
      canUploadDigitalSignature({
        roles: ["duty_manager"],
        jobTitle: "F&B Manager",
        department: "F&B",
      }),
    ).toBe(true);
    expect(
      canUploadDigitalSignature({
        roles: ["cashier_host"],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      }),
    ).toBe(true);
  });

  it("denies ordinary crew", () => {
    expect(
      canUploadDigitalSignature({
        roles: ["cashier_host"],
        jobTitle: "Cashier / Host",
        staffRole: "cashier",
      }),
    ).toBe(false);
    expect(
      canUploadDigitalSignature({
        roles: ["technician"],
        jobTitle: "FEC Technician",
        staffRole: "technician",
      }),
    ).toBe(false);
  });
});

describe("signature helpers", () => {
  it("validates mime and builds storage paths", () => {
    expect(isSignatureMime("image/png")).toBe(true);
    expect(isSignatureMime("image/svg+xml")).toBe(true);
    expect(isSignatureMime("application/pdf")).toBe(false);
    expect(extensionForSignatureMime("image/jpeg")).toBe("jpg");
    expect(extensionForSignatureMime("image/svg+xml")).toBe("svg");
    expect(signatureStoragePath("u1", "png")).toBe("u1/signature.png");
  });

  it("decodes data URLs including the base64 payload (React #441 root cause)", () => {
    // 1×1 PNG
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const decoded = decodeSignatureDataUrl(png);
    expect(decoded.contentType).toBe("image/png");
    expect(decoded.bytes.length).toBeGreaterThan(32);
    expect(decoded.bytes[0]).toBe(0x89);

    expect(() => decodeSignatureDataUrl("data:image/gif;base64,AAAA")).toThrow(/PNG, JPEG, WebP, or SVG/);
  });

  it("knocks out near-white pixels while keeping ink strokes", () => {
    // RGBA: white, blue ink, light grey
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, // white → transparent
      30, 80, 200, 255, // blue ink stays
      248, 248, 248, 200, // near-white → transparent
      40, 40, 40, 255, // dark ink stays
    ]);
    knockOutSignatureWhiteBackground(data);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(0);
    expect(data[15]).toBe(255);
  });
});

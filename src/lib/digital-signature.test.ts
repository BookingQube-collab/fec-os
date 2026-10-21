import { describe, expect, it } from "vitest";

import {
  canUploadDigitalSignature,
  extensionForSignatureMime,
  isSignatureMime,
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
});

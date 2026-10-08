import { describe, expect, it } from "vitest";

import { helpdeskAttachmentMagicOk, helpdeskTargets } from "@/lib/hr-helpdesk.shared";

describe("helpdeskTargets", () => {
  const createdAt = "2026-10-01T06:00:00.000Z";
  const now = new Date("2026-10-04T06:00:00.000Z");

  it("leaves dues unset when hours are missing", () => {
    const targets = helpdeskTargets({
      createdAt,
      resolutionAnchor: null,
      status: "open",
      firstResponseHours: null,
      resolutionHours: null,
      firstPublicReplyAt: null,
      now,
    });
    expect(targets.firstResponseDue).toBeNull();
    expect(targets.resolutionDue).toBeNull();
    expect(targets.firstResponseOverdue).toBe(false);
  });

  it("marks an unanswered response target overdue and restarts resolution from the anchor", () => {
    const targets = helpdeskTargets({
      createdAt,
      resolutionAnchor: "2026-10-03T06:00:00.000Z",
      status: "open",
      firstResponseHours: 24,
      resolutionHours: 48,
      firstPublicReplyAt: null,
      now,
    });
    expect(targets.firstResponseDue).toBe("2026-10-02T06:00:00.000Z");
    expect(targets.firstResponseOverdue).toBe(true);
    expect(targets.resolutionDue).toBe("2026-10-05T06:00:00.000Z");
    expect(targets.resolutionOverdue).toBe(false);
  });
});

describe("helpdeskAttachmentMagicOk", () => {
  it("accepts pdf, png, and jpeg signatures inside the size cap", () => {
    expect(helpdeskAttachmentMagicOk("application/pdf", Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(helpdeskAttachmentMagicOk("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(true);
    expect(helpdeskAttachmentMagicOk("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(true);
    expect(helpdeskAttachmentMagicOk("image/gif", Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBe(false);
  });
});

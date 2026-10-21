import { describe, expect, it } from "vitest";

import {
  LINKED_STAFF_HIT_TTL_MS,
  LINKED_STAFF_MISS_TTL_MS,
  linkedStaffCacheTtlMs,
  shouldHealStaffUserId,
} from "@/lib/linked-staff-link";

describe("linkedStaffCacheTtlMs", () => {
  it("keeps successful links warm across serverless actions", () => {
    expect(linkedStaffCacheTtlMs(true)).toBe(LINKED_STAFF_HIT_TTL_MS);
  });

  it("does not retain a null miss (avoids poisoning /hr/me as unlinked)", () => {
    expect(linkedStaffCacheTtlMs(false)).toBe(LINKED_STAFF_MISS_TTL_MS);
    expect(linkedStaffCacheTtlMs(false)).toBe(0);
  });
});

describe("shouldHealStaffUserId", () => {
  it("heals when email or employee code / qid matched the login", () => {
    expect(shouldHealStaffUserId("email")).toBe(true);
    expect(shouldHealStaffUserId("employee_code")).toBe(true);
    expect(shouldHealStaffUserId("qid")).toBe(true);
  });

  it("does not heal on primary user_id hit or unique-name fallback", () => {
    expect(shouldHealStaffUserId("user_id")).toBe(false);
    expect(shouldHealStaffUserId("name")).toBe(false);
  });
});

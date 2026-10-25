import { describe, expect, it } from "vitest";

import { canReviewStaffSuggestions } from "@/lib/hr-suggestions";

describe("canReviewStaffSuggestions", () => {
  it("allows Admin seats with admin.view", () => {
    expect(canReviewStaffSuggestions(["ceo"])).toBe(true);
    expect(canReviewStaffSuggestions(["coo"])).toBe(true);
    expect(canReviewStaffSuggestions(["regional_ops"])).toBe(true);
  });

  it("allows Head of Operations by job title", () => {
    expect(canReviewStaffSuggestions(["technician"], { jobTitle: "Head of Operations" })).toBe(true);
    expect(canReviewStaffSuggestions(["cashier_host"], { jobTitle: "Head of Operations / FEC-IT" })).toBe(true);
  });

  it("denies managers, HR, and floor staff without Admin or HoO", () => {
    expect(canReviewStaffSuggestions(["hr"])).toBe(false);
    expect(canReviewStaffSuggestions(["branch_gm"])).toBe(false);
    expect(canReviewStaffSuggestions(["duty_manager"])).toBe(false);
    expect(canReviewStaffSuggestions(["tech_supervisor"])).toBe(false);
    expect(canReviewStaffSuggestions(["cashier_host"])).toBe(false);
    expect(canReviewStaffSuggestions(["cfo"])).toBe(false);
  });
});

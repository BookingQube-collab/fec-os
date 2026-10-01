import { describe, expect, it } from "vitest";

import { alignMasterValue, masterInUseMessage, masterLabelKey, normalizeMasterLabel } from "./people-masters";

describe("people master labels", () => {
  it("treats spacing and case as the same value", () => {
    expect(normalizeMasterLabel("  Crew   /  Attendant ")).toBe("Crew / Attendant");
    expect(masterLabelKey("Male")).toBe(masterLabelKey(" male "));
  });

  it("aligns a stored label to the saved master spelling", () => {
    expect(alignMasterValue("male", ["Female", "Male"])).toBe("Male");
    expect(alignMasterValue("Qatar", ["India", "Philippines"])).toBe("Qatar");
    expect(alignMasterValue("  ", ["Male"])).toBe("");
  });

  it("includes the current-staff count in the delete block", () => {
    expect(masterInUseMessage("Operations", 1)).toBe(
      'Cannot delete "Operations". 1 current staff member still uses it.',
    );
    expect(masterInUseMessage("Cashier", 4)).toBe(
      'Cannot delete "Cashier". 4 current staff still use it.',
    );
  });
});

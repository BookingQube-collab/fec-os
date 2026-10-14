import { describe, expect, it } from "vitest";

import {
  alignMasterValue,
  masterInUseMessage,
  masterLabelKey,
  matchNationalityChoice,
  missingMasterName,
  normalizeMasterLabel,
} from "./people-masters";

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

  it("maps a card nationality onto the one saved label that extends it", () => {
    expect(matchNationalityChoice("KENYA", ["India", "Kenyan"])).toBe("Kenyan");
    expect(matchNationalityChoice("Kenya", ["Kenya", "India"])).toBe("Kenya");
    expect(matchNationalityChoice("Oman", ["Romanian"])).toBe("Oman");
    expect(matchNationalityChoice("  ", ["Kenya"])).toBe("");
  });

  it("offers a new nationality only when the typed name is missing", () => {
    expect(missingMasterName("  ", ["India"])).toBeNull();
    expect(missingMasterName("   Kenya  ", ["Kenya"])).toBeNull();
    expect(missingMasterName("kenya", ["Kenya"])).toBeNull();
    expect(missingMasterName("Sri   Lanka", ["India"])).toBe("Sri Lanka");
    expect(missingMasterName("sri lanka", ["Sri  Lanka"])).toBeNull();
    expect(missingMasterName("Burundi", ["India", "Kenya"])).toBe("Burundi");
    expect(missingMasterName("x".repeat(121), [])).toBeNull();
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

import { describe, expect, it } from "vitest";

import {
  canManageSalaryCustomExtras,
  parseSalaryExtras,
  resolveSalaryExtras,
  salaryExtrasFromFoodOther,
  salaryPackageTotal,
  serializeSalaryExtras,
  sumSalaryExtras,
} from "./salary-package";

describe("salary package extras", () => {
  it("parses and serializes custom extras", () => {
    const parsed = parseSalaryExtras([
      { id: "a", title: "  Extra Allowance  ", amount_qar: 250.555 },
      { title: "", amount_qar: 100 },
      { id: "b", label: "Site", amountQar: 100 },
    ]);
    expect(parsed).toEqual([
      { id: "a", title: "Extra Allowance", amountQar: 250.56 },
      { id: "b", title: "Site", amountQar: 100 },
    ]);
    expect(serializeSalaryExtras(parsed)).toEqual([
      { id: "a", title: "Extra Allowance", amount_qar: 250.56 },
      { id: "b", title: "Site", amount_qar: 100 },
    ]);
  });

  it("sums extras into the package total with the fixed split", () => {
    const extras = parseSalaryExtras([
      { id: "1", title: "Food", amount_qar: 200 },
      { id: "2", title: "Phone", amount_qar: 50.5 },
    ]);
    expect(sumSalaryExtras(extras)).toBe(250.5);
    expect(
      salaryPackageTotal({
        basicQar: 2800,
        housingQar: 500,
        transportQar: 200,
        extras,
      }),
    ).toBe(3750.5);
    expect(salaryPackageTotal({ basicQar: 1000, housingQar: null, transportQar: null })).toBe(1000);
  });

  it("gates custom extras to HR, HOO, and Admin (CEO/COO)", () => {
    expect(canManageSalaryCustomExtras(["hr"])).toBe(true);
    expect(canManageSalaryCustomExtras(["ceo"])).toBe(true);
    expect(canManageSalaryCustomExtras(["coo"])).toBe(true);
    expect(canManageSalaryCustomExtras(["cashier_host"], "Head of Operations")).toBe(true);
    expect(canManageSalaryCustomExtras(["cfo"])).toBe(false);
    expect(canManageSalaryCustomExtras(["branch_gm"])).toBe(false);
    expect(canManageSalaryCustomExtras(["cashier_host"], "F&B Manager")).toBe(false);
  });

  it("merges legacy food/other allowances into extras for display and edit", () => {
    expect(
      resolveSalaryExtras([], {
        housing: 500,
        transportation: 400,
        food: 300,
        other: 400,
      }),
    ).toEqual([
      { id: "legacy-food", title: "Food", amountQar: 300 },
      { id: "legacy-other", title: "Other", amountQar: 400 },
    ]);
    expect(
      resolveSalaryExtras([{ id: "x", title: "Phone", amount_qar: 50 }], {
        food: 200,
        extras: [{ id: "y", title: "Site", amount_qar: 100 }],
      }),
    ).toEqual([
      { id: "x", title: "Phone", amountQar: 50 },
      { id: "y", title: "Site", amountQar: 100 },
      { id: "legacy-food", title: "Food", amountQar: 200 },
    ]);
    expect(salaryExtrasFromFoodOther(200, 0)).toEqual([{ id: "legacy-food", title: "Food", amountQar: 200 }]);
  });
});

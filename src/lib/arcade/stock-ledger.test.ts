import { describe, expect, it } from "vitest";

import { splitStock, stockValuation, transferStock } from "./stock-ledger";

describe("arcade stock ledger", () => {
  it("splits warehouse stock from the other sites", () => {
    expect(
      splitStock(
        [
          { locationId: "wh", onHand: 4 },
          { locationId: "site-a", onHand: 1.5 },
          { locationId: "site-b", onHand: 2 },
        ],
        "wh",
      ),
    ).toEqual({ warehouse: 4, sites: 3.5, total: 7.5 });
  });

  it("keeps every bin on sites when no warehouse is set", () => {
    expect(splitStock([{ locationId: "site-a", onHand: 2 }], null)).toEqual({
      warehouse: 0,
      sites: 2,
      total: 2,
    });
  });

  it("moves quantity and refuses a negative or same-site transfer", () => {
    expect(
      transferStock({
        fromOnHand: 5,
        toOnHand: 1,
        quantity: 2,
        fromLocationId: "wh",
        toLocationId: "site-a",
      }),
    ).toEqual({ fromOnHand: 3, toOnHand: 3 });
    expect(() =>
      transferStock({
        fromOnHand: 1,
        toOnHand: 0,
        quantity: 2,
        fromLocationId: "wh",
        toLocationId: "site-a",
      }),
    ).toThrow(/Insufficient stock/);
    expect(() =>
      transferStock({
        fromOnHand: 4,
        toOnHand: 0,
        quantity: 2,
        fromLocationId: "wh",
        toLocationId: "wh",
      }),
    ).toThrow(/different locations/);
    expect(() =>
      transferStock({
        fromOnHand: 4,
        toOnHand: 0,
        quantity: 3,
        reserved: 2,
        fromLocationId: "wh",
        toLocationId: "site-a",
      }),
    ).toThrow(/Insufficient stock/);
  });

  it("values priced units and leaves missing prices out of the total", () => {
    expect(
      stockValuation([
        { onHand: 2, unitCost: 10 },
        { onHand: 1, unitCost: null },
        { onHand: 0, unitCost: 99 },
      ]),
    ).toEqual({ value: 20, pricedQty: 2, unpricedQty: 1 });
  });
});

/**
 * Warehouse and site quantities share inventory_stock.
 * Valuation uses a stored unit cost. Missing prices stay unpriced.
 */

export type StockBin = {
  locationId: string;
  onHand: number;
};

export function splitStock(bins: readonly StockBin[], warehouseLocationId: string | null | undefined) {
  let warehouse = 0;
  let sites = 0;
  for (const bin of bins) {
    const qty = Number(bin.onHand);
    if (!Number.isFinite(qty) || qty === 0) continue;
    if (warehouseLocationId && bin.locationId === warehouseLocationId) warehouse += qty;
    else sites += qty;
  }
  return {
    warehouse: roundQty(warehouse),
    sites: roundQty(sites),
    total: roundQty(warehouse + sites),
  };
}

export function transferStock(input: {
  fromOnHand: number;
  toOnHand: number;
  quantity: number;
  fromLocationId: string;
  toLocationId: string;
  reserved?: number;
}): { fromOnHand: number; toOnHand: number } {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("Choose two different locations.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }
  if (input.quantity > input.fromOnHand) {
    throw new Error("Insufficient stock for this movement.");
  }
  const fromOnHand = roundQty(input.fromOnHand - input.quantity);
  const reserved = input.reserved ?? 0;
  if (fromOnHand < reserved) {
    throw new Error("Insufficient stock for this movement.");
  }
  return { fromOnHand, toOnHand: roundQty(input.toOnHand + input.quantity) };
}

export function stockValuation(lines: readonly { onHand: number; unitCost: number | null | undefined }[]) {
  let value = 0;
  let pricedQty = 0;
  let unpricedQty = 0;
  for (const line of lines) {
    const qty = Number(line.onHand);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const cost = line.unitCost;
    if (cost == null || !Number.isFinite(Number(cost))) {
      unpricedQty += qty;
      continue;
    }
    pricedQty += qty;
    value += qty * Number(cost);
  }
  return {
    value: Math.round(value * 100) / 100,
    pricedQty: roundQty(pricedQty),
    unpricedQty: roundQty(unpricedQty),
  };
}

function roundQty(value: number) {
  return Math.round(value * 100) / 100;
}

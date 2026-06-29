/** Column aliases accepted in inventory bulk-import CSV / Excel sheets. */
const COL = {
  sku: ["sku", "item sku", "product sku"],
  name: ["item name", "item", "name", "product name"],
  size: ["size", "variant"],
  branch: ["branch", "branch/location", "location", "location code", "branch code"],
  qty: ["quantity on hand", "quantity", "on hand", "qty", "stock"],
  reorder: ["reorder level", "reorder", "min stock", "reorder_level"],
  category: ["category"],
  unit: ["unit"],
} as const;

function pick(row: Record<string, string>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

export interface InventoryImportRow {
  row: number;
  sku: string;
  name: string;
  size: string | null;
  locationCode: string;
  quantityOnHand: number;
  reorderLevel: number | null;
  category: string;
  unit: string;
}

export interface InventoryImportPreview {
  rows: InventoryImportRow[];
  errors: { row: number; message: string }[];
}

export function buildInventorySampleCsv(): string {
  return [
    "SKU,Item name,Size,Branch/Location,Quantity on hand,Reorder level",
    "SOCK-S,Grip socks — Small,S,INF-CC,45,30",
    "SOCK-M,Grip socks — Medium,M,INF-CC,52,40",
    "SOCK-L,Grip socks — Large,L,INF-CC,38,35",
    "SOCK-XL,Grip socks — XL,XL,INF-CC,22,25",
    "CON-WIPE,Sanitizing wipes,,KDS-CC,15,10",
  ].join("\n");
}

export function parseInventoryImportRows(rawRows: Record<string, string>[]): InventoryImportPreview {
  const rows: InventoryImportRow[] = [];
  const errors: { row: number; message: string }[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const sku = pick(raw, COL.sku);
    const name = pick(raw, COL.name);
    const sizeRaw = pick(raw, COL.size);
    const locationCode = pick(raw, COL.branch).toUpperCase();
    const qtyRaw = pick(raw, COL.qty);
    const reorderRaw = pick(raw, COL.reorder);
    const category = pick(raw, COL.category) || "consumable";
    const unit = pick(raw, COL.unit) || "each";

    if (!sku && !name && !locationCode && !qtyRaw) return;

    if (!sku) {
      errors.push({ row: rowNum, message: "SKU is required" });
      return;
    }
    if (!name) {
      errors.push({ row: rowNum, message: "Item name is required" });
      return;
    }
    if (!locationCode) {
      errors.push({ row: rowNum, message: "Branch/Location code is required" });
      return;
    }
    if (!qtyRaw) {
      errors.push({ row: rowNum, message: "Quantity on hand is required" });
      return;
    }

    const quantityOnHand = Number(qtyRaw);
    if (!Number.isFinite(quantityOnHand) || quantityOnHand < 0) {
      errors.push({ row: rowNum, message: "Quantity on hand must be a non-negative number" });
      return;
    }

    let reorderLevel: number | null = null;
    if (reorderRaw) {
      reorderLevel = Number(reorderRaw);
      if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
        errors.push({ row: rowNum, message: "Reorder level must be a non-negative number" });
        return;
      }
    }

    rows.push({
      row: rowNum,
      sku: sku.toUpperCase(),
      name,
      size: sizeRaw ? sizeRaw.toUpperCase() : null,
      locationCode,
      quantityOnHand,
      reorderLevel,
      category,
      unit,
    });
  });

  return { rows, errors };
}

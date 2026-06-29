import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

export interface InventoryDashboardFilters {
  locationId?: string | null;
}

export interface InventoryDashboardKpis {
  total_skus: number;
  low_stock: number;
  out_of_stock: number;
  total_units: number;
}

export interface InventoryDashboardPayload {
  kpis: InventoryDashboardKpis;
  stock_by_location: Array<{ code: string; name: string; units: number; skus: number }>;
  stock_by_size: Array<{ size: string; units: number }>;
  stock_by_status: Array<{ status: string; count: number }>;
  reorder_alerts: Array<{
    item_id: string;
    sku: string;
    item_name: string;
    size: string | null;
    location_code: string;
    quantity_on_hand: number;
    reorder_level: number;
  }>;
  recent_movements: Array<{
    id: string;
    sku: string;
    item_name: string;
    size: string | null;
    location_code: string;
    movement_type: string;
    quantity: number;
    quantity_after: number;
    created_at: string;
  }>;
}

type StockRow = {
  id: string;
  item_id: string;
  location_id: string;
  quantity_on_hand: number;
};

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  size: string | null;
  category: string;
  reorder_level: number;
  active: boolean;
};

export async function fetchInventoryDashboard(
  context: AuthContext,
  filters: InventoryDashboardFilters = {},
): Promise<InventoryDashboardPayload> {
  const timer = createTimer("fetchInventoryDashboard", "inventory-dashboard");

  let locQ = context.supabase
    .from("locations")
    .select("id, code, name")
    .in("status", ["active", "maintenance"]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const locationIds = (locations ?? []).map((l) => l.id);
  const locById = new Map((locations ?? []).map((l) => [l.id, l]));

  if (!locationIds.length) {
    timer.end({ rowCount: 0 });
    return emptyDashboard();
  }

  const { data: stock, error: stockErr } = await context.supabase
    .from("inventory_stock")
    .select("id, item_id, location_id, quantity_on_hand")
    .in("location_id", locationIds);
  if (stockErr) throw stockErr;

  const stockRows = (stock ?? []) as StockRow[];
  const itemIds = [...new Set(stockRows.map((s) => s.item_id))];

  let items: ItemRow[] = [];
  if (itemIds.length) {
    const { data: itemRows, error: itemErr } = await context.supabase
      .from("inventory_items")
      .select("id, sku, name, size, category, reorder_level, active")
      .in("id", itemIds)
      .is("deleted_at", null);
    if (itemErr) throw itemErr;
    items = (itemRows ?? []) as ItemRow[];
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const activeStock = stockRows.filter((s) => itemById.get(s.item_id)?.active);

  let lowStock = 0;
  let outOfStock = 0;
  let totalUnits = 0;
  const skuSet = new Set<string>();
  const locUnits = new Map<string, { units: number; skus: Set<string> }>();
  const sizeUnits = new Map<string, number>();
  let okCount = 0;

  for (const s of activeStock) {
    const item = itemById.get(s.item_id);
    if (!item) continue;
    const onHand = Number(s.quantity_on_hand);
    const reorder = Number(item.reorder_level ?? 0);
    totalUnits += onHand;
    skuSet.add(item.id);

    const loc = locById.get(s.location_id);
    if (loc) {
      const bucket = locUnits.get(loc.id) ?? { units: 0, skus: new Set<string>() };
      bucket.units += onHand;
      bucket.skus.add(item.id);
      locUnits.set(loc.id, bucket);
    }

    if (item.size) {
      sizeUnits.set(item.size, (sizeUnits.get(item.size) ?? 0) + onHand);
    }

    if (onHand <= 0) outOfStock++;
    else if (onHand <= reorder) lowStock++;
    else okCount++;
  }

  const reorderAlerts = activeStock
    .map((s) => {
      const item = itemById.get(s.item_id)!;
      const loc = locById.get(s.location_id);
      const onHand = Number(s.quantity_on_hand);
      const reorder = Number(item.reorder_level ?? 0);
      return {
        item_id: s.item_id,
        sku: item.sku,
        item_name: item.name,
        size: item.size,
        location_code: loc?.code ?? "—",
        quantity_on_hand: onHand,
        reorder_level: reorder,
      };
    })
    .filter((r) => r.quantity_on_hand <= r.reorder_level)
    .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand)
    .slice(0, 20);

  const { data: movements, error: movErr } = await context.supabase
    .from("inventory_movements")
    .select("id, item_id, location_id, movement_type, quantity, quantity_after, created_at")
    .in("location_id", locationIds)
    .order("created_at", { ascending: false })
    .limit(15);
  if (movErr) throw movErr;

  const movItemIds = [...new Set((movements ?? []).map((m) => m.item_id))];
  let movItems: ItemRow[] = [];
  if (movItemIds.length) {
    const { data: mi, error: miErr } = await context.supabase
      .from("inventory_items")
      .select("id, sku, name, size, category, reorder_level, active")
      .in("id", movItemIds);
    if (miErr) throw miErr;
    movItems = (mi ?? []) as ItemRow[];
  }
  const movItemById = new Map(movItems.map((i) => [i.id, i]));

  const recentMovements = (movements ?? []).map((m) => {
    const item = movItemById.get(m.item_id);
    const loc = locById.get(m.location_id);
    return {
      id: m.id,
      sku: item?.sku ?? "—",
      item_name: item?.name ?? "—",
      size: item?.size ?? null,
      location_code: loc?.code ?? "—",
      movement_type: m.movement_type,
      quantity: Number(m.quantity),
      quantity_after: Number(m.quantity_after),
      created_at: String(m.created_at),
    };
  });

  const payload: InventoryDashboardPayload = {
    kpis: {
      total_skus: skuSet.size,
      low_stock: lowStock,
      out_of_stock: outOfStock,
      total_units: Math.round(totalUnits),
    },
    stock_by_location: (locations ?? []).map((l) => {
      const bucket = locUnits.get(l.id);
      return {
        code: l.code,
        name: l.name,
        units: Math.round(bucket?.units ?? 0),
        skus: bucket?.skus.size ?? 0,
      };
    }),
    stock_by_size: [...sizeUnits.entries()]
      .map(([size, units]) => ({ size, units: Math.round(units) }))
      .sort((a, b) => a.size.localeCompare(b.size)),
    stock_by_status: [
      { status: "ok", count: okCount },
      { status: "low", count: lowStock },
      { status: "out", count: outOfStock },
    ],
    reorder_alerts: reorderAlerts,
    recent_movements: recentMovements,
  };

  timer.end({ rowCount: activeStock.length });
  return payload;
}

function emptyDashboard(): InventoryDashboardPayload {
  return {
    kpis: { total_skus: 0, low_stock: 0, out_of_stock: 0, total_units: 0 },
    stock_by_location: [],
    stock_by_size: [],
    stock_by_status: [
      { status: "ok", count: 0 },
      { status: "low", count: 0 },
      { status: "out", count: 0 },
    ],
    reorder_alerts: [],
    recent_movements: [],
  };
}

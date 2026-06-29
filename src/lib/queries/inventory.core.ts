import type { AuthContext } from "@/lib/server/auth";

export async function fetchInventoryItems(context: AuthContext, activeOnly = true) {
  let q = context.supabase
    .from("inventory_items")
    .select("id, sku, name, category, unit, size, reorder_level, par_level, cost_per_unit, active")
    .is("deleted_at", null)
    .order("name");
  if (activeOnly) q = q.eq("active", true);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

export async function fetchInventoryStock(
  context: AuthContext,
  locationId?: string | null,
  filters?: { size?: string | null; status?: string },
) {
  let q = context.supabase
    .from("inventory_stock")
    .select("id, item_id, location_id, quantity_on_hand, quantity_reserved, last_counted_at");
  if (locationId) q = q.eq("location_id", locationId);
  const { data: stock, error } = await q;
  if (error) throw error;
  if (!stock?.length) return [];

  const itemIds = [...new Set(stock.map((s) => s.item_id))];
  const locIds = [...new Set(stock.map((s) => s.location_id))];
  const [{ data: items }, { data: locs }] = await Promise.all([
    context.supabase
      .from("inventory_items")
      .select("id, sku, name, unit, size, reorder_level, active")
      .in("id", itemIds)
      .is("deleted_at", null),
    context.supabase.from("locations").select("id, code, name").in("id", locIds),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  return stock
    .map((s) => {
      const item = itemMap.get(s.item_id);
      const loc = locMap.get(s.location_id);
      if (!item?.active) return null;
      const onHand = Number(s.quantity_on_hand);
      const reorder = Number(item?.reorder_level ?? 0);
      const belowReorder = onHand <= reorder;
      const stockStatus = onHand <= 0 ? "out" : belowReorder ? "low" : "ok";
      return {
        ...s,
        quantity_on_hand: onHand,
        sku: item?.sku ?? "—",
        item_name: item?.name ?? "—",
        size: item?.size ?? null,
        unit: item?.unit ?? "each",
        location_code: loc?.code ?? "—",
        location_name: loc?.name ?? "—",
        below_reorder: belowReorder,
        stock_status: stockStatus,
      };
    })
    .filter((row): row is NonNullable<typeof row> => {
      if (!row) return false;
      if (filters?.size && row.size !== filters.size) return false;
      if (filters?.status && filters.status !== "all" && row.stock_status !== filters.status) return false;
      return true;
    });
}

export async function fetchInventoryAlerts(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("inventory_stock")
    .select("id, item_id, location_id, quantity_on_hand");
  if (locationId) q = q.eq("location_id", locationId);
  const { data: stock, error } = await q;
  if (error) throw error;
  if (!stock?.length) return [];

  const itemIds = [...new Set(stock.map((s) => s.item_id))];
  const { data: items } = await context.supabase
    .from("inventory_items")
    .select("id, sku, name, size, reorder_level")
    .in("id", itemIds)
    .is("deleted_at", null)
    .eq("active", true);
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

  return stock
    .map((s) => {
      const item = itemMap.get(s.item_id);
      if (!item) return null;
      const onHand = Number(s.quantity_on_hand);
      const reorder = Number(item.reorder_level ?? 0);
      return {
        item_id: s.item_id,
        location_id: s.location_id,
        sku: item.sku,
        item_name: item.name,
        size: item.size,
        quantity_on_hand: onHand,
        reorder_level: reorder,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null && s.quantity_on_hand <= s.reorder_level);
}

"use server";

import { z } from "zod";

import type { InventoryImportRow } from "@/lib/inventory-import";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const MOVEMENT_TYPES = ["receive", "issue", "adjust", "transfer_in", "transfer_out", "count"] as const;

const ImportRowSchema = z.object({
  row: z.number().int().positive(),
  sku: z.string().min(2).max(50),
  name: z.string().min(2).max(200),
  size: z.string().max(20).nullable(),
  locationCode: z.string().min(2).max(20),
  quantityOnHand: z.number().min(0),
  reorderLevel: z.number().min(0).nullable(),
  category: z.string().max(50).default("consumable"),
  unit: z.string().max(20).default("each"),
});

export const listInventoryItems = createAuthenticatedAction(
  z.object({ activeOnly: z.boolean().default(true) }).default({}),
  async (data, context) => {
    let q = context.supabase
      .from("inventory_items")
      .select("id, sku, name, category, unit, size, reorder_level, par_level, cost_per_unit, active")
      .is("deleted_at", null)
      .order("name");
    if (data.activeOnly) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "inventory.view" } },
);

export const listInventoryStock = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    size: z.string().max(20).nullable().optional(),
    status: z.enum(["all", "low", "out", "ok"]).default("all"),
  }).default({}),
  async (data, context) => {
    let q = context.supabase
      .from("inventory_stock")
      .select("id, item_id, location_id, quantity_on_hand, quantity_reserved, last_counted_at");
    if (data.locationId) q = q.eq("location_id", data.locationId);
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
        if (data.size && row.size !== data.size) return false;
        if (data.status === "all") return true;
        return row.stock_status === data.status;
      });
  },
  { defaultInput: {}, auth: { capability: "inventory.view" } },
);

export const recordInventoryMovement = createAuthenticatedAction(
  z.object({
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    movementType: z.enum(MOVEMENT_TYPES),
    quantity: z.number().positive(),
    notes: z.string().max(500).optional(),
    referenceType: z.string().max(50).optional(),
    referenceId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);

    const { data: stock, error: sErr } = await context.supabase
      .from("inventory_stock")
      .select("id, quantity_on_hand")
      .eq("item_id", data.itemId)
      .eq("location_id", data.locationId)
      .maybeSingle();
    if (sErr) throw sErr;

    const before = Number(stock?.quantity_on_hand ?? 0);
    const delta =
      data.movementType === "issue" || data.movementType === "transfer_out"
        ? -data.quantity
        : data.quantity;
    const after = before + delta;
    if (after < 0) throw new Error("Insufficient stock for this movement.");

    if (stock?.id) {
      const { error: uErr } = await context.supabase
        .from("inventory_stock")
        .update({ quantity_on_hand: after, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await context.supabase.from("inventory_stock").insert({
        item_id: data.itemId,
        location_id: data.locationId,
        quantity_on_hand: after,
      });
      if (iErr) throw iErr;
    }

    const { error: mErr } = await context.supabase.from("inventory_movements").insert({
      item_id: data.itemId,
      location_id: data.locationId,
      movement_type: data.movementType,
      quantity: data.quantity,
      quantity_before: before,
      quantity_after: after,
      reference_type: data.referenceType ?? null,
      reference_id: data.referenceId ?? null,
      notes: data.notes ?? null,
      created_by: context.userId,
    });
    if (mErr) throw mErr;

    return { quantityAfter: after };
  },
  { auth: { anyCapability: ["inventory.move", "inventory.manage"] } },
);

export const upsertInventoryItem = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    sku: z.string().min(2).max(50),
    name: z.string().min(2).max(200),
    category: z.string().max(50).default("consumable"),
    unit: z.string().max(20).default("each"),
    size: z.string().max(20).nullable().optional(),
    reorderLevel: z.number().min(0).default(0),
    parLevel: z.number().min(0).nullable().optional(),
    costPerUnit: z.number().min(0).nullable().optional(),
    active: z.boolean().default(true),
  }),
  async (data, context) => {
    const row = {
      sku: data.sku.toUpperCase(),
      name: data.name,
      category: data.category,
      unit: data.unit,
      size: data.size?.toUpperCase() ?? null,
      reorder_level: data.reorderLevel,
      par_level: data.parLevel ?? null,
      cost_per_unit: data.costPerUnit ?? null,
      active: data.active,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("inventory_items").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("inventory_items")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "inventory.manage" } },
);

export const deleteInventoryItem = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("inventory_items")
      .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "inventory.manage" } },
);

export const upsertInventoryStock = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantityOnHand: z.number().min(0),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);

    const { data: existing, error: sErr } = await context.supabase
      .from("inventory_stock")
      .select("id, quantity_on_hand")
      .eq("item_id", data.itemId)
      .eq("location_id", data.locationId)
      .maybeSingle();
    if (sErr) throw sErr;

    const before = Number(existing?.quantity_on_hand ?? 0);
    const after = data.quantityOnHand;

    if (existing?.id) {
      const { error } = await context.supabase
        .from("inventory_stock")
        .update({ quantity_on_hand: after, updated_at: new Date().toISOString(), last_counted_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("inventory_stock").insert({
        item_id: data.itemId,
        location_id: data.locationId,
        quantity_on_hand: after,
        last_counted_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    if (before !== after) {
      const { error: mErr } = await context.supabase.from("inventory_movements").insert({
        item_id: data.itemId,
        location_id: data.locationId,
        movement_type: "adjust",
        quantity: Math.abs(after - before),
        quantity_before: before,
        quantity_after: after,
        notes: "Manual stock adjustment",
        created_by: context.userId,
      });
      if (mErr) throw mErr;
    }

    return { quantityAfter: after };
  },
  { auth: { anyCapability: ["inventory.move", "inventory.manage"] } },
);

export const deleteInventoryStock = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error: fErr } = await context.supabase
      .from("inventory_stock")
      .select("id, item_id, location_id, quantity_on_hand")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!row) throw new Error("Stock record not found.");
    await assertLocationAccess(context, row.location_id);

    const { error } = await context.supabase.from("inventory_stock").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "inventory.manage" } },
);

export const importInventoryRows = createAuthenticatedAction(
  z.object({ rows: z.array(ImportRowSchema).min(1).max(5000) }),
  async (data, context) => {
    const errors: { row: number; message: string }[] = [];
    let imported = 0;

    const { data: locations, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code");
    if (locErr) throw locErr;
    const locByCode = new Map((locations ?? []).map((l) => [l.code.toUpperCase(), l.id]));

    for (const row of data.rows as InventoryImportRow[]) {
      const locationId = locByCode.get(row.locationCode.toUpperCase());
      if (!locationId) {
        errors.push({ row: row.row, message: `Unknown branch code: ${row.locationCode}` });
        continue;
      }

      try {
        await assertLocationAccess(context, locationId);
      } catch {
        errors.push({ row: row.row, message: `No access to branch ${row.locationCode}` });
        continue;
      }

      const { data: existingItem } = await context.supabase
        .from("inventory_items")
        .select("id")
        .eq("sku", row.sku)
        .is("deleted_at", null)
        .maybeSingle();

      let itemId = existingItem?.id;
      if (!itemId) {
        const { data: inserted, error: insErr } = await context.supabase
          .from("inventory_items")
          .insert({
            sku: row.sku,
            name: row.name,
            category: row.category,
            unit: row.unit,
            size: row.size,
            reorder_level: row.reorderLevel ?? 0,
            active: true,
          })
          .select("id")
          .single();
        if (insErr) {
          errors.push({ row: row.row, message: insErr.message });
          continue;
        }
        itemId = inserted.id;
      } else if (row.reorderLevel != null) {
        await context.supabase
          .from("inventory_items")
          .update({ reorder_level: row.reorderLevel, updated_at: new Date().toISOString() })
          .eq("id", itemId);
      }

      const { data: existingStock } = await context.supabase
        .from("inventory_stock")
        .select("id, quantity_on_hand")
        .eq("item_id", itemId)
        .eq("location_id", locationId)
        .maybeSingle();

      const before = Number(existingStock?.quantity_on_hand ?? 0);
      const after = row.quantityOnHand;

      if (existingStock?.id) {
        const { error: uErr } = await context.supabase
          .from("inventory_stock")
          .update({
            quantity_on_hand: after,
            last_counted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingStock.id);
        if (uErr) {
          errors.push({ row: row.row, message: uErr.message });
          continue;
        }
      } else {
        const { error: sErr } = await context.supabase.from("inventory_stock").insert({
          item_id: itemId,
          location_id: locationId,
          quantity_on_hand: after,
          last_counted_at: new Date().toISOString(),
        });
        if (sErr) {
          errors.push({ row: row.row, message: sErr.message });
          continue;
        }
      }

      if (before !== after) {
        await context.supabase.from("inventory_movements").insert({
          item_id: itemId,
          location_id: locationId,
          movement_type: "count",
          quantity: Math.abs(after - before) || after,
          quantity_before: before,
          quantity_after: after,
          notes: "Bulk sheet import",
          created_by: context.userId,
        });
      }

      imported++;
    }

    return { imported, errors };
  },
  { auth: { capability: "inventory.import" } },
);

export const getInventoryAlerts = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }).default({}),
  async (data, context) => {
    let q = context.supabase
      .from("inventory_stock")
      .select("id, item_id, location_id, quantity_on_hand");
    if (data.locationId) q = q.eq("location_id", data.locationId);
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
  },
  { defaultInput: {}, auth: { capability: "inventory.view" } },
);

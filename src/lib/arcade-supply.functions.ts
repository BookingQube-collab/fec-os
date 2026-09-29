"use server";

import { z } from "zod";

import { applyArcadeWorkbookPlan, type ArcadeDb } from "@/lib/arcade/apply-workbook";
import { matchImportMachine, nextPartSupplyStatus, patchSupplierCase, stockStatus, type PartStatus } from "@/lib/arcade/domain";
import { buildMonthlyArcadeReport, buildSupplierPerformance, buildWeeklyArcadeReport } from "@/lib/arcade/reports";
import { weekBounds } from "@/lib/arcade/domain";
import {
  CaseInput,
  DamageInput,
  DocumentInput,
  ImportInput,
  InstallationInput,
  PageQuery,
  PartInput,
  PartSupplyInput,
  WorkbookPlanInput,
} from "@/lib/arcade/schemas";
import { canUserDo } from "@/lib/rbac";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

function range(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export const listArcadeSuppliers = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase
      .from("vendors")
      .select("id, name, category, contact_person, phone, email, active, notes", { count: "exact" })
      .order("name");
    if (data.q && data.q.trim().length >= 2) query = query.ilike("name", `%${data.q.trim().replace(/[%_]/g, "")}%`);
    const { from, to } = range(data.page, data.pageSize);
    const { data: vendors, error, count } = await query.range(from, to);
    if (error) throw error;
    const ids = (vendors ?? []).map((vendor) => vendor.id);
    const { data: profiles } = ids.length
      ? await context.supabase.from("arcade_vendor_profiles").select("*").in("vendor_id", ids)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.vendor_id, profile]));
    return {
      rows: (vendors ?? []).map((vendor) => ({ ...vendor, profile: profileMap.get(vendor.id) ?? null })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const getArcadeSupplier = createAuthenticatedAction(
  z.object({ vendorId: z.string().uuid() }),
  async (data, context) => {
    const [{ data: vendor, error }, { data: profile }, { data: machines }, { data: cases }] = await Promise.all([
      context.supabase.from("vendors").select("id, name, category, contact_person, phone, email, notes, active").eq("id", data.vendorId).single(),
      context.supabase.from("arcade_vendor_profiles").select("*").eq("vendor_id", data.vendorId).maybeSingle(),
      context.supabase.from("arcade_machines").select("id, name, asset_code, location_id, status, warranty_expires_on").eq("vendor_id", data.vendorId).limit(200),
      context.supabase.from("arcade_supplier_cases").select("id, case_number, status, problem, machine_id, location_id, created_at, first_response_at, resolved_at, troubleshooting_done").eq("vendor_id", data.vendorId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (error) throw error;
    const performance = buildSupplierPerformance({
      now: new Date().toISOString(),
      vendors: [{ id: vendor.id, name: vendor.name }],
      machines: (machines ?? []).map((machine) => ({
        vendorId: data.vendorId,
        status: machine.status,
        warrantyExpiresOn: machine.warranty_expires_on,
      })),
      cases: (cases ?? []).map((item) => ({
        vendorId: data.vendorId,
        status: item.status,
        openedAt: item.created_at,
        firstResponseAt: item.first_response_at,
        resolvedAt: item.resolved_at,
      })),
    })[0];
    return { vendor, profile, machines: machines ?? [], cases: cases ?? [], performance };
  },
  { auth: { capability: "arcade.view" } },
);

export const saveArcadeVendorProfile = createAuthenticatedAction(
  z.object({
    vendorId: z.string().uuid(),
    country: z.string().max(80).optional().nullable(),
    whatsapp: z.string().max(40).optional().nullable(),
    website: z.string().max(200).optional().nullable(),
    technicalContact: z.string().max(120).optional().nullable(),
    technicalPhone: z.string().max(40).optional().nullable(),
    salesContact: z.string().max(120).optional().nullable(),
    salesPhone: z.string().max(40).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    warrantyTerms: z.string().max(2000).optional().nullable(),
    typicalLeadDays: z.number().int().min(0).max(365).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  }),
  async (data, context) => {
    const payload = {
      vendor_id: data.vendorId,
      country: data.country ?? null,
      whatsapp: data.whatsapp ?? null,
      website: data.website ?? null,
      technical_contact: data.technicalContact ?? null,
      technical_phone: data.technicalPhone ?? null,
      sales_contact: data.salesContact ?? null,
      sales_phone: data.salesPhone ?? null,
      address: data.address ?? null,
      warranty_terms: data.warrantyTerms ?? null,
      typical_lead_days: data.typicalLeadDays ?? null,
      notes: data.notes ?? null,
      updated_by: context.userId,
    };
    const { error } = await context.supabase.from("arcade_vendor_profiles").upsert(payload);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { anyCapability: ["arcade.manage", "arcade.assign"] } },
);

export const listSupplierCases = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase
      .from("arcade_supplier_cases")
      .select("id, case_number, vendor_id, machine_id, location_id, fault_id, status, problem, next_follow_up_on, warranty_status, created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.machineId) query = query.eq("machine_id", data.machineId);
    if (data.status) query = query.eq("status", data.status);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const getSupplierCase = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase.from("arcade_supplier_cases").select("*").eq("id", data.id).single();
    if (error) throw error;
    if (row.location_id) await assertLocationAccess(context, row.location_id);
    const { data: updates } = await context.supabase.from("arcade_supplier_case_updates").select("*").eq("case_id", data.id).order("created_at");
    return { case: row, updates: updates ?? [] };
  },
  { auth: { capability: "arcade.view" } },
);

export const saveSupplierCase = createAuthenticatedAction(
  CaseInput,
  async (data, context) => {
    if (data.locationId) await assertLocationAccess(context, data.locationId);
    if (data.id) {
      const { data: existing, error: readError } = await context.supabase.from("arcade_supplier_cases").select("*").eq("id", data.id).single();
      if (readError) throw readError;
      const patched = patchSupplierCase(
        {
          troubleshootingDone: existing.troubleshooting_done ?? "",
          partsTested: existing.parts_tested ?? "",
          technicianFindings: existing.technician_findings ?? "",
          supplierResponse: existing.supplier_response ?? "",
          updates: [],
        },
        {
          troubleshootingDone: data.troubleshootingDone ?? undefined,
          partsTested: data.partsTested ?? undefined,
          technicianFindings: data.technicianFindings ?? undefined,
          supplierResponse: data.supplierResponse ?? undefined,
        },
      );
      const { data: row, error } = await context.supabase
        .from("arcade_supplier_cases")
        .update({
          problem: data.problem,
          troubleshooting_done: patched.troubleshootingDone || existing.troubleshooting_done,
          parts_tested: patched.partsTested || existing.parts_tested,
          technician_findings: patched.technicianFindings || existing.technician_findings,
          supplier_response: patched.supplierResponse || existing.supplier_response,
          next_follow_up_on: data.nextFollowUpOn ?? null,
          warranty_status: data.warrantyStatus ?? null,
          status: data.status,
          last_contact_at: data.updateBody ? new Date().toISOString() : existing.last_contact_at,
          first_response_at: data.supplierResponse && !existing.first_response_at ? new Date().toISOString() : existing.first_response_at,
          resolved_at: data.status === "RESOLVED" || data.status === "CLOSED" ? new Date().toISOString() : existing.resolved_at,
          updated_by: context.userId,
        })
        .eq("id", data.id)
        .select("id, case_number")
        .single();
      if (error) throw error;
      if (data.updateBody?.trim()) {
        await context.supabase.from("arcade_supplier_case_updates").insert({
          case_id: data.id,
          location_id: existing.location_id,
          body: data.updateBody.trim(),
          created_by: context.userId,
        });
      }
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("arcade_supplier_cases")
      .insert({
        vendor_id: data.vendorId,
        machine_id: data.machineId ?? null,
        location_id: data.locationId ?? null,
        fault_id: data.faultId ?? null,
        problem: data.problem,
        troubleshooting_done: data.troubleshootingDone ?? null,
        parts_tested: data.partsTested ?? null,
        technician_findings: data.technicianFindings ?? null,
        supplier_response: data.supplierResponse ?? null,
        next_follow_up_on: data.nextFollowUpOn ?? null,
        warranty_status: data.warrantyStatus ?? null,
        status: data.status,
        technician_staff_id: data.technicianStaffId ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, case_number")
      .single();
    if (error) throw error;
    if (data.updateBody?.trim()) {
      await context.supabase.from("arcade_supplier_case_updates").insert({
        case_id: row.id,
        location_id: data.locationId ?? null,
        body: data.updateBody.trim(),
        created_by: context.userId,
      });
    }
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const listSpareParts = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_spare_parts").select("*", { count: "exact" }).order("name");
    if (data.status) query = query.eq("supply_status", data.status);
    if (data.q && data.q.trim().length >= 2) {
      const token = data.q.trim().replace(/[%_]/g, "");
      query = query.or(`name.ilike.%${token}%,part_code.ilike.%${token}%,part_number.ilike.%${token}%`);
    }
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    const itemIds = (rows ?? []).map((row) => row.inventory_item_id).filter((id): id is string => Boolean(id));
    const { data: stock } = itemIds.length
      ? await context.supabase.from("inventory_stock").select("item_id, location_id, quantity_on_hand").in("item_id", itemIds)
      : { data: [] };
    return { rows: rows ?? [], stock: stock ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveSparePart = createAuthenticatedAction(
  PartInput,
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "arcade.purchase")) {
      throw new Error("Purchasing changes require operations approval");
    }
    await assertLocationAccess(context, data.warehouseLocationId);
    let inventoryItemId: string | null = null;
    if (!data.id) {
      const { data: item, error: itemError } = await context.supabase
        .from("inventory_items")
        .insert({
          sku: data.partCode.toUpperCase(),
          name: data.name,
          category: "arcade_spare",
          unit: "each",
          reorder_level: data.reorderLevel,
          cost_per_unit: data.unitCost ?? null,
          notes: data.notes ?? null,
          active: true,
        })
        .select("id")
        .single();
      if (itemError) throw new Error(`Inventory item was not created. ${itemError.message}`);
      inventoryItemId = item.id;
      if (data.openingQty > 0) {
        await context.supabase.from("inventory_stock").insert({
          item_id: item.id,
          location_id: data.warehouseLocationId,
          quantity_on_hand: data.openingQty,
        });
      } else {
        await context.supabase.from("inventory_stock").insert({
          item_id: item.id,
          location_id: data.warehouseLocationId,
          quantity_on_hand: 0,
        });
      }
    }
    const status = stockStatus(data.openingQty, data.minStock);
    const payload = {
      part_code: data.partCode.toUpperCase(),
      name: data.name,
      category: data.category,
      manufacturer: data.manufacturer ?? null,
      vendor_id: data.vendorId ?? null,
      part_number: data.partNumber ?? null,
      min_stock: data.minStock,
      reorder_level: data.reorderLevel,
      warehouse_location_id: data.warehouseLocationId,
      unit_cost: data.unitCost ?? null,
      spec: data.spec ?? null,
      notes: data.notes ?? null,
      supply_status: status,
      updated_by: context.userId,
    };
    const query = data.id
      ? context.supabase.from("arcade_spare_parts").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_spare_parts").insert({
          ...payload,
          inventory_item_id: inventoryItemId,
          created_by: context.userId,
        });
    const { data: row, error } = await query.select("id, part_code, inventory_item_id").single();
    if (error) throw error;
    if (data.machineIds.length) {
      await context.supabase.from("arcade_part_machines").insert(data.machineIds.map((machineId) => ({ part_id: row.id, machine_id: machineId })));
    }
    return row;
  },
  { auth: { capability: "arcade.purchase" } },
);

export const requestSparePart = createAuthenticatedAction(
  z.object({
    partId: z.string().uuid().optional().nullable(),
    machineId: z.string().uuid().optional().nullable(),
    faultId: z.string().uuid().optional().nullable(),
    locationId: z.string().uuid(),
    technicianStaffId: z.string().uuid().optional().nullable(),
    description: z.string().trim().min(3).max(500),
    qty: z.number().positive(),
    notes: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("arcade_part_requests")
      .insert({
        part_id: data.partId ?? null,
        machine_id: data.machineId ?? null,
        fault_id: data.faultId ?? null,
        location_id: data.locationId,
        technician_staff_id: data.technicianStaffId ?? null,
        description: data.description,
        qty: data.qty,
        status: "REQUESTED",
        notes: data.notes ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (data.partId) {
      await context.supabase.from("arcade_spare_parts").update({ supply_status: "REQUESTED", requested_qty: data.qty, updated_by: context.userId }).eq("id", data.partId).in("supply_status", ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "RECEIVED"]);
    }
    if (data.faultId) {
      await context.supabase.from("arcade_faults").update({ status: "WAITING_PART", updated_by: context.userId }).eq("id", data.faultId).in("status", ["DIAGNOSING", "UNDER_REPAIR", "REPORTED"]);
      if (data.machineId) {
        await context.supabase.from("arcade_machines").update({ status: "WAITING_PART", updated_by: context.userId }).eq("id", data.machineId);
      }
    }
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const updatePartSupply = createAuthenticatedAction(
  PartSupplyInput,
  async (data, context) => {
    const { data: part, error } = await context.supabase.from("arcade_spare_parts").select("supply_status, min_stock, inventory_item_id").eq("id", data.id).single();
    if (error) throw error;
    const next = nextPartSupplyStatus(data.supplyStatus as PartStatus, 0, Number(part.min_stock));
    const { error: updateError } = await context.supabase.from("arcade_spare_parts").update({
      supply_status: data.supplyStatus === "RECEIVED" ? next : data.supplyStatus,
      ordered_qty: data.orderedQty,
      eta: data.eta ?? null,
      last_purchase_price: data.lastPurchasePrice ?? null,
      updated_by: context.userId,
    }).eq("id", data.id);
    if (updateError) throw updateError;
    return { ok: true };
  },
  { auth: { capability: "arcade.purchase" } },
);

export const receiveSparePart = createAuthenticatedAction(
  z.object({
    partId: z.string().uuid(),
    locationId: z.string().uuid(),
    qty: z.number().positive(),
    requestId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: part, error } = await context.supabase.from("arcade_spare_parts").select("*").eq("id", data.partId).single();
    if (error) throw error;
    if (!part.inventory_item_id) throw new Error("This part is not linked to inventory stock");
    const { data: stock } = await context.supabase.from("inventory_stock").select("id, quantity_on_hand").eq("item_id", part.inventory_item_id).eq("location_id", data.locationId).maybeSingle();
    const before = Number(stock?.quantity_on_hand ?? 0);
    const after = before + data.qty;
    if (stock?.id) {
      await context.supabase.from("inventory_stock").update({ quantity_on_hand: after, updated_at: new Date().toISOString() }).eq("id", stock.id);
    } else {
      await context.supabase.from("inventory_stock").insert({ item_id: part.inventory_item_id, location_id: data.locationId, quantity_on_hand: after });
    }
    await context.supabase.from("inventory_movements").insert({
      item_id: part.inventory_item_id,
      location_id: data.locationId,
      movement_type: "receive",
      quantity: data.qty,
      quantity_before: before,
      quantity_after: after,
      reference_type: "arcade_part",
      reference_id: part.id,
      created_by: context.userId,
    });
    const status = stockStatus(after, Number(part.min_stock));
    await context.supabase.from("arcade_spare_parts").update({
      supply_status: status,
      received_qty: Number(part.received_qty) + data.qty,
      updated_by: context.userId,
    }).eq("id", part.id);
    if (data.requestId) {
      await context.supabase.from("arcade_part_requests").update({ status: "RECEIVED", updated_by: context.userId }).eq("id", data.requestId);
    }
    return { onHand: after, status };
  },
  { auth: { capability: "arcade.purchase" } },
);

export const useSparePart = createAuthenticatedAction(
  z.object({
    partId: z.string().uuid(),
    locationId: z.string().uuid(),
    machineId: z.string().uuid(),
    faultId: z.string().uuid().optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
    qty: z.number().positive(),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: part, error } = await context.supabase.from("arcade_spare_parts").select("id, name, inventory_item_id").eq("id", data.partId).single();
    if (error) throw error;
    if (!part.inventory_item_id) throw new Error("This part is not linked to inventory stock");
    const { data: usageId, error: rpcError } = await context.supabase.rpc("arcade_consume_part", {
      p_item_id: part.inventory_item_id,
      p_location_id: data.locationId,
      p_qty: data.qty,
      p_machine_id: data.machineId,
      p_fault_id: data.faultId ?? null,
      p_part_id: part.id,
      p_staff_id: data.staffId ?? null,
      p_notes: data.notes ?? null,
    });
    if (rpcError) throw rpcError;
    if (data.faultId) {
      const { data: fault } = await context.supabase.from("arcade_faults").select("parts_used").eq("id", data.faultId).single();
      const line = `${part.name} x ${data.qty}`;
      const partsUsed = fault?.parts_used ? `${fault.parts_used}; ${line}` : line;
      await context.supabase.from("arcade_faults").update({ parts_used: partsUsed, updated_by: context.userId }).eq("id", data.faultId);
    }
    return { usageId };
  },
  { auth: { capability: "arcade.operate" } },
);

export const listArcadeDocuments = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_documents").select("*", { count: "exact" }).order("title");
    if (data.machineId) query = query.eq("machine_id", data.machineId);
    if (data.q && data.q.trim().length >= 2) {
      const token = data.q.trim().replace(/[%_]/g, "");
      query = query.or(`title.ilike.%${token}%,notes.ilike.%${token}%,model.ilike.%${token}%,error_code.ilike.%${token}%,part_hint.ilike.%${token}%,manufacturer.ilike.%${token}%`);
    }
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveArcadeDocument = createAuthenticatedAction(
  DocumentInput,
  async (data, context) => {
    const payload = {
      vendor_id: data.vendorId ?? null,
      manufacturer: data.manufacturer ?? null,
      machine_id: data.machineId ?? null,
      model: data.model ?? null,
      location_id: data.locationId ?? null,
      doc_type: data.docType,
      title: data.title,
      notes: data.notes ?? null,
      error_code: data.errorCode ?? null,
      fault_category: data.faultCategory ?? null,
      part_hint: data.partHint ?? null,
      external_url: data.externalUrl ?? null,
    };
    const query = data.id
      ? context.supabase.from("arcade_documents").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_documents").insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("id").single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const listDamageReports = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_damage_reports").select("*", { count: "exact" }).order("reported_on", { ascending: false });
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.machineId) query = query.eq("machine_id", data.machineId);
    if (data.status === "needs_mapping") query = query.eq("needs_mapping", true);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    const list = rows ?? [];
    const machineIds = [...new Set(list.map((row) => row.machine_id).filter((id): id is string => Boolean(id)))];
    const { data: machines } = machineIds.length
      ? await context.supabase.from("arcade_machines").select("id, name, asset_code").in("id", machineIds)
      : { data: [] };
    const names = new Map((machines ?? []).map((machine) => [machine.id, machine]));
    return {
      rows: list.map((row) => ({
        ...row,
        machine_name: row.machine_id ? names.get(row.machine_id)?.name ?? null : null,
        asset_code: row.machine_id ? names.get(row.machine_id)?.asset_code ?? null : null,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveDamageReport = createAuthenticatedAction(
  DamageInput,
  async (data, context) => {
    if (data.locationId) await assertLocationAccess(context, data.locationId);
    const needsMapping = !data.machineId;
    const payload = {
      machine_id: data.machineId ?? null,
      location_id: data.locationId ?? null,
      reported_on: data.reportedOn ?? new Date().toISOString().slice(0, 10),
      reported_by_staff_id: data.reportedByStaffId ?? null,
      damage_type: data.damageType,
      description: data.description,
      cause: data.cause ?? null,
      customer_caused: data.customerCaused,
      staff_caused: data.staffCaused,
      accidental: data.accidental,
      estimated_cost: data.estimatedCost ?? null,
      parts_required: data.partsRequired ?? null,
      supplier_assistance: data.supplierAssistance,
      operational: data.operational,
      corrective_action: data.correctiveAction ?? null,
      preventive_action: data.preventiveAction ?? null,
      needs_mapping: needsMapping,
      updated_by: context.userId,
    };
    const query = data.id
      ? context.supabase.from("arcade_damage_reports").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_damage_reports").insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("id, needs_mapping").single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const listInstallations = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_installations").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.status) query = query.eq("status", data.status);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveInstallation = createAuthenticatedAction(
  InstallationInput,
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const payload = {
      machine_id: data.machineId ?? null,
      vendor_id: data.vendorId ?? null,
      location_id: data.locationId,
      delivery_on: data.deliveryOn ?? null,
      installed_on: data.installedOn ?? null,
      technician_staff_id: data.technicianStaffId ?? null,
      supplier_technician: data.supplierTechnician ?? null,
      checks: data.checks,
      issues: data.issues ?? null,
      final_acceptance: data.finalAcceptance ?? null,
      status: data.status,
      updated_by: context.userId,
    };
    const query = data.id
      ? context.supabase.from("arcade_installations").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_installations").insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("id, status").single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const importArcadeRows = createAuthenticatedAction(
  ImportInput,
  async (data, context) => {
    const { data: machines, error } = await context.supabase.from("arcade_machines").select("id, asset_code, name, location_id").limit(2000);
    if (error) throw error;
    const locIds = [...new Set((machines ?? []).map((machine) => machine.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code").in("id", locIds)
      : { data: [] };
    const codes = new Map((locs ?? []).map((loc) => [loc.id, loc.code]));
    const catalog = (machines ?? []).map((machine) => ({
      id: machine.id,
      assetCode: machine.asset_code,
      name: machine.name,
      locationCode: codes.get(machine.location_id) ?? null,
    }));
    const results: { externalKey: string | null; needsMapping: boolean; reason?: string; machineId?: string }[] = [];
    for (const row of data.rows) {
      const match = matchImportMachine(row, catalog);
      if ("needsMapping" in match) {
        await context.supabase.from("arcade_import_queue").insert({
          source: data.source,
          external_key: row.externalKey ?? null,
          kind: row.kind,
          payload: row.payload,
          needs_mapping: true,
          mapping_reason: match.reason,
          created_by: context.userId,
        });
        results.push({ externalKey: row.externalKey ?? null, needsMapping: true, reason: match.reason });
        continue;
      }
      await context.supabase.from("arcade_import_queue").insert({
        source: data.source,
        external_key: row.externalKey ?? null,
        kind: row.kind,
        payload: row.payload,
        needs_mapping: false,
        machine_id: match.machineId,
        created_by: context.userId,
      });
      results.push({ externalKey: row.externalKey ?? null, needsMapping: false, machineId: match.machineId });
    }
    return { results };
  },
  { auth: { capability: "arcade.manage" } },
);

export const listImportQueue = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_import_queue").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (data.status === "needs_mapping") query = query.eq("needs_mapping", true);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.manage" } },
);

export const getArcadeWeeklyReport = createAuthenticatedAction(
  z.object({ anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({}),
  async (data, context) => {
    const bounds = weekBounds(data.anchor ?? new Date().toISOString().slice(0, 10));
    const [{ data: sites }, { data: locs }, { data: faults }, pmCompleted, pmOverdue, usages] = await Promise.all([
      context.supabase.from("arcade_site_health").select("*"),
      context.supabase.from("locations").select("id, name"),
      context.supabase.from("arcade_faults").select("id, ticket_number, location_id, machine_id, status, severity, category, description, reported_at, resolved_at, is_repeat").gte("reported_at", `${bounds.start}T00:00:00Z`).lte("reported_at", `${bounds.end}T23:59:59Z`).limit(200),
      context.supabase.from("arcade_pm_records").select("id", { count: "exact", head: true }).eq("confirmed", true).gte("performed_on", bounds.start).lte("performed_on", bounds.end),
      context.supabase.from("arcade_machines").select("id", { count: "exact", head: true }).eq("active", true).lt("next_pm_on", bounds.start),
      context.supabase.from("arcade_part_usages").select("qty, unit_cost").gte("used_on", bounds.start).lte("used_on", bounds.end),
    ]);
    const names = new Map((locs ?? []).map((loc) => [loc.id, loc.name]));
    const machineIds = [...new Set((faults ?? []).map((fault) => fault.machine_id))];
    const { data: machines } = machineIds.length
      ? await context.supabase.from("arcade_machines").select("id, name").in("id", machineIds)
      : { data: [] };
    const machineNames = new Map((machines ?? []).map((machine) => [machine.id, machine.name]));
    const list = faults ?? [];
    return buildWeeklyArcadeReport({
      weekStart: bounds.start,
      weekEnd: bounds.end,
      generatedAt: new Date().toISOString(),
      sites: (sites ?? []).map((site) => ({
        locationId: site.location_id,
        siteName: names.get(site.location_id) ?? site.location_id,
        active: site.active_machines,
        working: site.working,
        down: site.down,
        underRepair: site.under_repair,
        underObservation: site.under_observation,
        waitingPart: site.waiting_part,
        waitingSupplier: site.waiting_supplier,
        pmDue: site.pm_due,
        pmOverdue: site.pm_overdue,
      })),
      opened: list.length,
      resolved: list.filter((fault) => fault.resolved_at).length,
      pending: list.filter((fault) => fault.status !== "RESOLVED" && fault.status !== "CLOSED").length,
      waitingParts: list.filter((fault) => fault.status === "WAITING_PART").length,
      waitingSuppliers: list.filter((fault) => fault.status === "WAITING_SUPPLIER").length,
      repeatFaults: list.filter((fault) => fault.is_repeat).length,
      pmCompleted: pmCompleted.count ?? 0,
      pmOverdue: pmOverdue.count ?? 0,
      partsConsumed: (usages.data ?? []).reduce((sum, row) => sum + Number(row.qty), 0),
      partsCost: (usages.data ?? []).reduce((sum, row) => sum + Number(row.qty) * Number(row.unit_cost ?? 0), 0),
      faults: list.map((fault) => ({
        ticketNumber: fault.ticket_number ?? fault.id,
        site: names.get(fault.location_id) ?? fault.location_id,
        machine: machineNames.get(fault.machine_id) ?? fault.machine_id,
        status: fault.status,
        severity: fault.severity,
        category: fault.category,
        summary: fault.description,
      })),
    });
  },
  { defaultInput: {}, auth: { capability: "arcade.reports" } },
);

export const getArcadeMonthlyReport = createAuthenticatedAction(
  z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).default({}),
  async (data, context) => {
    const now = new Date();
    const month = data.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [year, mon] = month.split("-").map(Number);
    const start = `${month}-01`;
    const endDate = new Date(Date.UTC(year!, mon!, 0));
    const end = endDate.toISOString().slice(0, 10);
    const prev = new Date(Date.UTC(year!, mon! - 2, 1));
    const prevStart = prev.toISOString().slice(0, 10);
    const prevEnd = new Date(Date.UTC(year!, mon! - 1, 0)).toISOString().slice(0, 10);
    const [{ data: sites }, { data: faults }, { data: usages }, { data: cases }, pmCompleted, machines] = await Promise.all([
      context.supabase.from("arcade_site_health").select("active_machines, working"),
      context.supabase.from("arcade_faults").select("id, machine_id, location_id, category, status, severity, description, reported_at, resolved_at, is_repeat, downtime_started_at, downtime_ended_at").gte("reported_at", `${prevStart}T00:00:00Z`).lte("reported_at", `${end}T23:59:59Z`).limit(500),
      context.supabase.from("arcade_part_usages").select("machine_id, qty, unit_cost, used_on").gte("used_on", start).lte("used_on", end),
      context.supabase.from("arcade_supplier_cases").select("created_at, first_response_at, status").gte("created_at", `${start}T00:00:00Z`),
      context.supabase.from("arcade_pm_records").select("id", { count: "exact", head: true }).eq("confirmed", true).gte("performed_on", start).lte("performed_on", end),
      context.supabase.from("arcade_machines").select("id, name, location_id"),
    ]);
    const { data: locs } = await context.supabase.from("locations").select("id, name");
    const locNames = new Map((locs ?? []).map((loc) => [loc.id, loc.name]));
    const machineNames = new Map((machines.data ?? []).map((machine) => [machine.id, machine]));
    const active = (sites ?? []).reduce((sum, site) => sum + site.active_machines, 0);
    const working = (sites ?? []).reduce((sum, site) => sum + site.working, 0);
    const overdue = await context.supabase.from("arcade_machines").select("id", { count: "exact", head: true }).eq("active", true).lt("next_pm_on", start);
    return buildMonthlyArcadeReport({
      periodStart: start,
      periodEnd: end,
      previousPeriodStart: prevStart,
      previousPeriodEnd: prevEnd,
      now: now.toISOString(),
      activeMachines: active,
      workingMachines: working,
      pmCompleted: pmCompleted.count ?? 0,
      pmOverdue: overdue.count ?? 0,
      faults: (faults ?? []).map((fault) => {
        const machine = machineNames.get(fault.machine_id);
        return {
          id: fault.id,
          machineId: fault.machine_id,
          machineName: machine?.name ?? fault.machine_id,
          siteName: locNames.get(fault.location_id) ?? fault.location_id,
          category: fault.category,
          status: fault.status,
          severity: fault.severity,
          reportedAt: fault.reported_at,
          resolvedAt: fault.resolved_at,
          summary: fault.description,
          isRepeat: fault.is_repeat,
          downtimeStartedAt: fault.downtime_started_at,
          downtimeEndedAt: fault.downtime_ended_at,
        };
      }),
      partUsages: (usages ?? []).map((row) => ({
        machineId: row.machine_id,
        quantity: Number(row.qty),
        cost: Number(row.qty) * Number(row.unit_cost ?? 0),
        usedOn: row.used_on,
      })),
      supplierCases: (cases ?? []).map((row) => ({
        openedOn: row.created_at,
        firstResponseAt: row.first_response_at,
        status: row.status,
      })),
    });
  },
  { defaultInput: {}, auth: { capability: "arcade.reports" } },
);

export const listPartRequests = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_part_requests").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.status) query = query.eq("status", data.status);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    const list = rows ?? [];
    const machineIds = [...new Set(list.map((row) => row.machine_id).filter((id): id is string => Boolean(id)))];
    const { data: machines } = machineIds.length
      ? await context.supabase.from("arcade_machines").select("id, name").in("id", machineIds)
      : { data: [] };
    const names = new Map((machines ?? []).map((machine) => [machine.id, machine.name]));
    return {
      rows: list.map((row) => ({ ...row, machine_name: row.machine_id ? names.get(row.machine_id) ?? null : null })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const applyArcadeWorkbook = createAuthenticatedAction(
  WorkbookPlanInput,
  async (data, context) => applyArcadeWorkbookPlan(context.supabase as unknown as ArcadeDb, data, context.userId),
  { auth: { capability: "arcade.manage" } },
);

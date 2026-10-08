"use server";

import { z } from "zod";

import { buildAlertDrafts, firstCoverByLocation, normalizeGamePayment, operationalPercent, searchToken, siteAvailability } from "@/lib/arcade/domain";
import { MachineInput, PageQuery, UploadInput } from "@/lib/arcade/schemas";
import { canUserDo } from "@/lib/rbac";
import { assertLocationAccess } from "@/lib/server/authorize";
import { applyStoredTrainingRules } from "@/lib/training/execute-rules";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { validateBase64Size } from "@/lib/server/upload-validation";

const UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function range(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

function gamePaymentColumns(data: {
  id?: string;
  supplierName?: string | null;
  amountPaid?: number | null;
  paidCurrency?: string | null;
  paidOn?: string | null;
}) {
  const touched =
    data.supplierName !== undefined ||
    data.amountPaid !== undefined ||
    data.paidCurrency !== undefined ||
    data.paidOn !== undefined;
  if (data.id && !touched) return {};
  const payment = normalizeGamePayment({
    supplierName: data.supplierName,
    amountPaid: data.amountPaid,
    currency: data.paidCurrency,
    paidOn: data.paidOn,
  });
  return {
    supplier_name: payment.supplierName,
    amount_paid: payment.amountPaid,
    paid_currency: payment.currency,
    paid_on: payment.paidOn,
  };
}

async function staffForUser(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, job_title, location_id, user_id")
    .eq("user_id", context.userId)
    .limit(1)
    .maybeSingle();
  return data;
}

function flags(context: AuthContext) {
  const roles = context.roles ?? [];
  return {
    canOperate: canUserDo(roles, "arcade.operate"),
    canAssign: canUserDo(roles, "arcade.assign"),
    canClose: canUserDo(roles, "arcade.close"),
    canPurchase: canUserDo(roles, "arcade.purchase"),
    canManage: canUserDo(roles, "arcade.manage"),
    canReport: canUserDo(roles, "arcade.reports"),
  };
}

export const getArcadeContext = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const staff = await staffForUser(context);
    const { data: technicians, error } = await context.supabase
      .from("staff")
      .select("id, full_name, job_title, location_id")
      .eq("status", "active")
      .order("full_name")
      .limit(400);
    if (error) throw error;
    return { staff, technicians: technicians ?? [], ...flags(context) };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

const SITE_HEALTH_COLUMNS =
  "location_id, active_machines, working, down, under_repair, under_observation, waiting_part, waiting_supplier, out_of_service, pm_overdue, pm_due" as const;

const DASHBOARD_PREVIEW = 8;
const SITE_COVER_LIMIT = 300;

export const getArcadeDashboard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().optional().nullable() }).default({}),
  async (data, context) => {
    const locationId = data.locationId ?? null;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const pmSoon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const pmSince = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    let sites = context.supabase.from("arcade_site_health").select(SITE_HEALTH_COLUMNS);
    let critical = context.supabase
      .from("arcade_machines")
      .select("id, name, asset_code, location_id, status")
      .eq("status", "DOWN")
      .eq("active", true)
      .order("name")
      .limit(DASHBOARD_PREVIEW);
    let pmDue = context.supabase
      .from("arcade_machines")
      .select("id, name, asset_code, location_id, next_pm_on, status")
      .eq("active", true)
      .not("next_pm_on", "is", null)
      .lte("next_pm_on", pmSoon)
      .order("next_pm_on")
      .limit(DASHBOARD_PREVIEW);
    let aged = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, status, description")
      .lt("reported_at", weekAgo)
      .not("status", "in", "(RESOLVED,CLOSED)")
      .order("reported_at")
      .limit(DASHBOARD_PREVIEW);
    let waitingSupplier = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, status, description")
      .eq("status", "WAITING_SUPPLIER")
      .order("reported_at")
      .limit(DASHBOARD_PREVIEW);
    let waitingPart = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, status, description")
      .eq("status", "WAITING_PART")
      .order("reported_at")
      .limit(DASHBOARD_PREVIEW);
    let repeats = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, category, repeat_count")
      .eq("is_repeat", true)
      .not("status", "in", "(RESOLVED,CLOSED)")
      .order("reported_at", { ascending: false })
      .limit(DASHBOARD_PREVIEW);
    let resolved = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, category")
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(DASHBOARD_PREVIEW);
    if (locationId) {
      sites = sites.eq("location_id", locationId);
      critical = critical.eq("location_id", locationId);
      pmDue = pmDue.eq("location_id", locationId);
      aged = aged.eq("location_id", locationId);
      waitingSupplier = waitingSupplier.eq("location_id", locationId);
      waitingPart = waitingPart.eq("location_id", locationId);
      repeats = repeats.eq("location_id", locationId);
      resolved = resolved.eq("location_id", locationId);
    }

    const [siteRes, faultRes, criticalRes, agedRes, waitingSupplierRes, waitingPartRes, repeatsRes, pmDueRes, resolvedRes, pmCompletedRes] =
      await Promise.all([
        sites,
        context.supabase.from("arcade_fault_kpis").select("open_faults, repeat_faults").limit(1),
        critical,
        aged,
        waitingSupplier,
        waitingPart,
        repeats,
        pmDue,
        resolved,
        context.supabase.from("arcade_pm_records").select("id", { count: "exact", head: true }).eq("confirmed", true).gte("performed_on", pmSince),
      ]);
    if (siteRes.error) throw siteRes.error;
    const rows = siteRes.data ?? [];
    const active = rows.reduce((sum, row) => sum + row.active_machines, 0);
    const working = rows.reduce((sum, row) => sum + row.working, 0);
    const down = rows.reduce((sum, row) => sum + row.down, 0);
    const kpis = faultRes.data?.[0];
    const pmOverdue = rows.reduce((sum, row) => sum + row.pm_overdue, 0);
    const pmCompleted = pmCompletedRes.count ?? 0;
    const pmCompliance = pmCompleted + pmOverdue > 0 ? Math.round((pmCompleted / (pmCompleted + pmOverdue)) * 1000) / 10 : null;

    return {
      kpis: {
        total: active,
        working,
        down,
        underRepair: rows.reduce((sum, row) => sum + row.under_repair, 0),
        underObservation: rows.reduce((sum, row) => sum + row.under_observation, 0),
        waitingPart: rows.reduce((sum, row) => sum + row.waiting_part, 0),
        waitingSupplier: rows.reduce((sum, row) => sum + row.waiting_supplier, 0),
        outOfService: rows.reduce((sum, row) => sum + row.out_of_service, 0),
        pmDue: rows.reduce((sum, row) => sum + row.pm_due, 0),
        pmOverdue,
        openFaults: kpis?.open_faults ?? 0,
        repeatFaults: kpis?.repeat_faults ?? 0,
        operationalPercent: operationalPercent(working, active),
        pmCompliance,
      },
      sites: rows.map((row) => ({
        ...row,
        availability: siteAvailability({ working: row.working, active: row.active_machines }),
      })),
      critical: criticalRes.data ?? [],
      aged: agedRes.data ?? [],
      waitingSupplier: waitingSupplierRes.data ?? [],
      waitingPart: waitingPartRes.data ?? [],
      repeats: repeatsRes.data ?? [],
      pmDue: pmDueRes.data ?? [],
      resolved: resolvedRes.data ?? [],
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const getArcadeSiteBoard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().optional().nullable() }).default({}),
  async (data, context) => {
    const locationId = data.locationId ?? null;
    let health = context.supabase.from("arcade_site_health").select(SITE_HEALTH_COLUMNS);
    let covers = context.supabase
      .from("arcade_machines")
      .select("location_id, photo_path")
      .eq("active", true)
      .not("photo_path", "is", null)
      .order("location_id")
      .order("name")
      .limit(locationId ? 1 : SITE_COVER_LIMIT);
    if (locationId) {
      health = health.eq("location_id", locationId);
      covers = covers.eq("location_id", locationId);
    }
    const [healthRes, coverRes] = await Promise.all([health, covers]);
    if (healthRes.error) throw healthRes.error;
    return {
      sites: (healthRes.data ?? []).map((row) => ({
        ...row,
        availability: siteAvailability({ working: row.working, active: row.active_machines }),
      })),
      covers: coverRes.error ? {} : firstCoverByLocation(coverRes.data ?? []),
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const listArcadeMachines = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    const token = data.q ? searchToken(data.q) : null;
    let query = context.supabase
      .from("arcade_machines")
      .select("id, asset_code, name, game_category, location_id, zone, unit_number, manufacturer, model, serial_number, status, photo_path, technician_staff_id, vendor_id, supplier_name, amount_paid, paid_currency, paid_on, next_pm_on, last_fault_at, last_repair_at, last_fix_at, last_fix_summary, last_fix_status, last_fix_technician_staff_id, warranty_expires_on, active", { count: "exact" })
      .order("name");
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.status) query = query.eq("status", data.status);
    if (token) {
      query = query.or(`name.ilike.%${token}%,asset_code.ilike.%${token}%,serial_number.ilike.%${token}%,model.ilike.%${token}%,supplier_name.ilike.%${token}%`);
    }
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const getArcadeMachine = createAuthenticatedAction(
  z.object({ id: z.string().uuid().optional(), assetCode: z.string().min(3).max(40).optional() }),
  async (data, context) => {
    let query = context.supabase.from("arcade_machines").select("*");
    query = data.id ? query.eq("id", data.id) : query.eq("asset_code", data.assetCode ?? "");
    const { data: machine, error } = await query.maybeSingle();
    if (error) throw error;
    if (!machine) throw new Error("Machine not found");
    await assertLocationAccess(context, machine.location_id);
    const [faults, pm, parts, cases, docs, damage, installs, timeline] = await Promise.all([
      context.supabase.from("arcade_faults").select("id, ticket_number, status, severity, category, reported_at, is_repeat, repeat_count, description").eq("machine_id", machine.id).order("reported_at", { ascending: false }).limit(25),
      context.supabase.from("arcade_pm_records").select("id, performed_on, confirmed, next_pm_on, issues_found, technician_staff_id").eq("machine_id", machine.id).order("performed_on", { ascending: false }).limit(25),
      context.supabase.from("arcade_part_usages").select("id, part_id, qty, used_on, fault_id, unit_cost").eq("machine_id", machine.id).order("used_on", { ascending: false }).limit(25),
      context.supabase.from("arcade_supplier_cases").select("id, case_number, status, problem, vendor_id, created_at").eq("machine_id", machine.id).order("created_at", { ascending: false }).limit(25),
      context.supabase.from("arcade_documents").select("id, title, doc_type, model, manufacturer, error_code, external_url, file_name, storage_path").eq("machine_id", machine.id).order("title").limit(25),
      context.supabase.from("arcade_damage_reports").select("id, reported_on, damage_type, description, estimated_cost, needs_mapping").eq("machine_id", machine.id).order("reported_on", { ascending: false }).limit(25),
      context.supabase.from("arcade_installations").select("id, status, installed_on, delivery_on, vendor_id").eq("machine_id", machine.id).order("created_at", { ascending: false }).limit(10),
      context.supabase.from("arcade_status_history").select("id, previous_status, new_status, notes, created_at, entity_type").eq("machine_id", machine.id).order("created_at", { ascending: false }).limit(40),
    ]);
    return {
      machine,
      faults: faults.data ?? [],
      pm: pm.data ?? [],
      parts: parts.data ?? [],
      cases: cases.data ?? [],
      documents: docs.data ?? [],
      damage: damage.data ?? [],
      installations: installs.data ?? [],
      timeline: timeline.data ?? [],
    };
  },
  { auth: { capability: "arcade.view" } },
);

export const saveArcadeMachine = createAuthenticatedAction(
  MachineInput,
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const payload = {
      asset_code: data.assetCode.toUpperCase(),
      name: data.name,
      game_category: data.gameCategory,
      location_id: data.locationId,
      area_id: data.areaId ?? null,
      zone: data.zone ?? null,
      unit_number: data.unitNumber ?? null,
      manufacturer: data.manufacturer ?? null,
      vendor_id: data.vendorId ?? null,
      model: data.model ?? null,
      serial_number: data.serialNumber ?? null,
      installed_on: data.installedOn ?? null,
      purchased_on: data.purchasedOn ?? null,
      warranty_start: data.warrantyStart ?? null,
      warranty_expires_on: data.warrantyExpiresOn ?? null,
      machine_cost: data.machineCost ?? null,
      ...gamePaymentColumns(data),
      status: data.status,
      technician_staff_id: data.technicianStaffId ?? null,
      power_requirement: data.powerRequirement ?? null,
      network_requirement: data.networkRequirement ?? null,
      ip_address: data.ipAddress ?? null,
      software_version: data.softwareVersion ?? null,
      controller_pcb: data.controllerPcb ?? null,
      card_rfid_interface: data.cardRfidInterface ?? null,
      notes: data.notes ?? null,
      next_pm_on: data.nextPmOn ?? null,
      updated_by: context.userId,
    };
    if (!data.id) {
      if (!canUserDo(context.roles ?? [], "arcade.manage")) {
        throw new Error("Creating a machine requires admin master-data access");
      }
      const { data: row, error } = await context.supabase
        .from("arcade_machines")
        .insert({ ...payload, created_by: context.userId })
        .select("id, asset_code")
        .single();
      if (error) throw error;
      if (data.technicianStaffId) {
        await applyStoredTrainingRules(context, {
          trigger: "MACHINE_ASSIGNMENT",
          staffId: data.technicianStaffId,
          entityId: row.id,
        });
      }
      return row;
    }
    if (data.technicianStaffId) {
      const { data: current, error: currentError } = await context.supabase
        .from("arcade_machines")
        .select("technician_staff_id")
        .eq("id", data.id)
        .maybeSingle();
      if (currentError) throw currentError;
      const willAssign =
        canUserDo(context.roles ?? [], "arcade.manage") || canUserDo(context.roles ?? [], "arcade.assign");
      if (willAssign && current?.technician_staff_id !== data.technicianStaffId) {
        await applyStoredTrainingRules(context, {
          trigger: "MACHINE_ASSIGNMENT",
          staffId: data.technicianStaffId,
          entityId: data.id,
        });
      }
    }
    const patch = canUserDo(context.roles ?? [], "arcade.manage")
      ? payload
      : {
          status: data.status,
          notes: data.notes ?? null,
          software_version: data.softwareVersion ?? null,
          ip_address: data.ipAddress ?? null,
          controller_pcb: data.controllerPcb ?? null,
          technician_staff_id: canUserDo(context.roles ?? [], "arcade.assign") ? data.technicianStaffId ?? null : undefined,
          updated_by: context.userId,
        };
    const { data: row, error } = await context.supabase
      .from("arcade_machines")
      .update(patch)
      .eq("id", data.id)
      .select("id, asset_code")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { anyCapability: ["arcade.operate", "arcade.manage"] } },
);

export const searchArcade = createAuthenticatedAction(
  z.object({ q: z.string().min(2).max(80) }),
  async (data, context) => {
    const token = searchToken(data.q);
    if (!token) return { machines: [], faults: [], parts: [], documents: [], cases: [] };
    const like = `%${token}%`;
    const [machines, faults, parts, documents, cases] = await Promise.all([
      context.supabase.from("arcade_machines").select("id, asset_code, name, location_id, status, serial_number, model").or(`name.ilike.${like},asset_code.ilike.${like},serial_number.ilike.${like},model.ilike.${like}`).limit(8),
      context.supabase.from("arcade_faults").select("id, ticket_number, description, category, status, machine_id, location_id").or(`ticket_number.ilike.${like},description.ilike.${like},category.ilike.${like}`).limit(8),
      context.supabase.from("arcade_spare_parts").select("id, part_code, name, part_number, supply_status").or(`name.ilike.${like},part_code.ilike.${like},part_number.ilike.${like}`).limit(8),
      context.supabase.from("arcade_documents").select("id, title, doc_type, model, error_code, machine_id, notes").or(`title.ilike.${like},notes.ilike.${like},error_code.ilike.${like},model.ilike.${like},part_hint.ilike.${like}`).limit(8),
      context.supabase.from("arcade_supplier_cases").select("id, case_number, problem, status, machine_id").or(`case_number.ilike.${like},problem.ilike.${like},troubleshooting_done.ilike.${like}`).limit(8),
    ]);
    const machineIds = (machines.data ?? []).map((row) => row.id);
    const [linkedFaults, linkedDocs, linkedCases] = machineIds.length
      ? await Promise.all([
          context.supabase.from("arcade_faults").select("id, ticket_number, description, category, status, machine_id, location_id").in("machine_id", machineIds).limit(8),
          context.supabase.from("arcade_documents").select("id, title, doc_type, model, error_code, machine_id, notes").in("machine_id", machineIds).limit(8),
          context.supabase.from("arcade_supplier_cases").select("id, case_number, problem, status, machine_id").in("machine_id", machineIds).limit(8),
        ])
      : [];
    const merge = <T extends { id: string }>(primary: T[] | null, extra: T[] | null) => {
      const seen = new Set((primary ?? []).map((row) => row.id));
      return [...(primary ?? []), ...(extra ?? []).filter((row) => !seen.has(row.id))].slice(0, 8);
    };
    return {
      machines: machines.data ?? [],
      faults: merge(faults.data, linkedFaults?.data ?? []),
      parts: parts.data ?? [],
      documents: merge(documents.data, linkedDocs?.data ?? []),
      cases: merge(cases.data, linkedCases?.data ?? []),
    };
  },
  { auth: { capability: "arcade.view" } },
);

export const uploadArcadeFile = createAuthenticatedAction(
  UploadInput,
  async (data, context) => {
    if (!UPLOAD_MIME.has(data.contentType)) throw new Error(`Unsupported file type: ${data.contentType}`);
    validateBase64Size(data.dataBase64, data.contentType.startsWith("video/") ? 25 * 1024 * 1024 : 12 * 1024 * 1024);
    if (data.locationId) await assertLocationAccess(context, data.locationId);
    const path = `${data.locationId ?? "shared"}/${data.entityType}/${data.entityId}/${Date.now()}-${data.filename.replace(/[^\w.\-]+/g, "_")}`;
    const bytes = Uint8Array.from(atob(data.dataBase64), (char) => char.charCodeAt(0));
    const { error: upErr } = await context.supabase.storage.from("arcade-technical").upload(path, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    if (upErr) throw upErr;
    const { error } = await context.supabase.from("arcade_attachments").insert({
      location_id: data.locationId ?? null,
      entity_type: data.entityType,
      entity_id: data.entityId,
      kind: data.kind,
      storage_path: path,
      file_name: data.filename,
      mime_type: data.contentType,
      created_by: context.userId,
    });
    if (error) throw error;
    if (data.entityType === "machine" && data.kind === "photo") {
      await context.supabase.from("arcade_machines").update({ photo_path: path, updated_by: context.userId }).eq("id", data.entityId).is("photo_path", null);
    }
    if (data.entityType === "document") {
      await context.supabase.from("arcade_documents").update({ storage_path: path, file_name: data.filename, mime_type: data.contentType }).eq("id", data.entityId);
    }
    return { path };
  },
  { auth: { capability: "arcade.operate" } },
);

export const getArcadeFileUrl = createAuthenticatedAction(
  z.object({ path: z.string().min(1).max(500) }),
  async (data, context) => {
    const { data: signed, error } = await context.supabase.storage.from("arcade-technical").createSignedUrl(data.path, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  },
  { auth: { capability: "arcade.view" } },
);

export const getArcadeFileUrls = createAuthenticatedAction(
  z.object({ paths: z.array(z.string().min(1).max(500)).min(1).max(60) }),
  async (data, context) => {
    const paths = [...new Set(data.paths)].slice(0, 60);
    const { data: signed, error } = await context.supabase.storage.from("arcade-technical").createSignedUrls(paths, 600);
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl && !row.error) urls[row.path] = row.signedUrl;
    }
    return { urls };
  },
  { auth: { capability: "arcade.view" } },
);

export const listArcadeAttachments = createAuthenticatedAction(
  z.object({ entityType: z.string().min(2).max(40), entityId: z.string().uuid() }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("arcade_attachments")
      .select("id, kind, storage_path, file_name, mime_type, created_at")
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "arcade.view" } },
);

export const syncArcadeAlerts = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const today = new Date().toISOString().slice(0, 10);
    const [machines, faults, cases, parts, checks] = await Promise.all([
      context.supabase.from("arcade_machines").select("id, name, status, warranty_expires_on, next_pm_on").eq("active", true).limit(200),
      context.supabase.from("arcade_faults").select("id, ticket_number, machine_id, status, severity, reported_at, is_repeat").not("status", "in", "(RESOLVED,CLOSED)").limit(100),
      context.supabase.from("arcade_supplier_cases").select("id, case_number, status, next_follow_up_on").not("status", "in", "(RESOLVED,CLOSED)").limit(80),
      context.supabase.from("arcade_spare_parts").select("id, name, min_stock, supply_status, eta, inventory_item_id").limit(80),
      context.supabase.from("arcade_observation_checks").select("observation_id, result, checked_on").order("checked_on", { ascending: false }).limit(80),
    ]);
    const stockIds = (parts.data ?? []).map((part) => part.inventory_item_id).filter((id): id is string => Boolean(id));
    const { data: stock } = stockIds.length
      ? await context.supabase.from("inventory_stock").select("item_id, quantity_on_hand").in("item_id", stockIds)
      : { data: [] };
    const onHand = new Map<string, number>();
    for (const row of stock ?? []) onHand.set(row.item_id, (onHand.get(row.item_id) ?? 0) + Number(row.quantity_on_hand));
    const byObs = new Map<string, Array<"PASS" | "ISSUE_FOUND">>();
    for (const check of checks.data ?? []) {
      const list = byObs.get(check.observation_id) ?? [];
      if (list.length < 2) list.push(check.result === "ISSUE_FOUND" ? "ISSUE_FOUND" : "PASS");
      byObs.set(check.observation_id, list);
    }
    const failed = [...byObs.entries()].filter(([, results]) => results.filter((result) => result === "ISSUE_FOUND").length >= 2).map(([id]) => id);
    const drafts = buildAlertDrafts({
      now: new Date().toISOString(),
      machines: (machines.data ?? []).map((machine) => ({
        id: machine.id,
        name: machine.name,
        status: machine.status,
        warrantyExpiresOn: machine.warranty_expires_on,
        nextPmOn: machine.next_pm_on,
      })),
      faults: (faults.data ?? []).map((fault) => ({
        id: fault.id,
        ticketNumber: fault.ticket_number ?? fault.id,
        machineId: fault.machine_id,
        status: fault.status,
        severity: fault.severity,
        reportedAt: fault.reported_at,
        isRepeat: fault.is_repeat,
      })),
      cases: (cases.data ?? []).map((item) => ({
        id: item.id,
        caseNumber: item.case_number ?? item.id,
        status: item.status,
        nextFollowUpOn: item.next_follow_up_on,
      })),
      parts: (parts.data ?? []).map((part) => ({
        id: part.id,
        name: part.name,
        onHand: part.inventory_item_id ? onHand.get(part.inventory_item_id) ?? 0 : 0,
        minimum: Number(part.min_stock),
        supplyStatus: part.supply_status,
        eta: part.eta,
      })),
      observationFailedIds: failed,
    }).slice(0, 12);

    let created = 0;
    for (const draft of drafts) {
      const { error: fireError } = await context.supabase.from("arcade_alert_fires").insert({
        user_id: context.userId,
        rule_key: draft.rule,
        entity_id: draft.entityId,
        fired_on: today,
      });
      if (fireError) continue;
      const { data: note, error } = await context.supabase
        .from("notifications")
        .insert({
          user_id: context.userId,
          category: "arcade",
          title: draft.title,
          severity: draft.severity,
          action_url: draft.href,
          source_type: draft.rule,
          source_id: draft.entityId,
        })
        .select("id")
        .single();
      if (error) continue;
      created += 1;
      await context.supabase.from("arcade_alert_fires").update({ notification_id: note.id }).eq("user_id", context.userId).eq("rule_key", draft.rule).eq("entity_id", draft.entityId).eq("fired_on", today);
    }
    return { created };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

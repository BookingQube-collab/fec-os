"use server";

import { z } from "zod";

import {
  AMC_ATTACHMENT_TYPES,
  AMC_CATEGORIES,
  AMC_CONTRACT_STATUSES,
  AMC_FREQUENCIES,
  AMC_PAYMENT_STATUSES,
  AMC_SERVICE_STATUSES,
  generatePlannedServiceDates,
} from "@/lib/amc/constants";
import { assertLocationAccess } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const FilterSchema = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    region: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    vendor: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    dueThisWeek: z.boolean().optional(),
    dueThisMonth: z.boolean().optional(),
    expiringSoon: z.boolean().optional(),
    overdueOnly: z.boolean().optional(),
    activeOnly: z.boolean().optional(),
    search: z.string().max(100).optional(),
  })
  .default({});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type AmcContractDedupeKey = {
  id: string;
  location_id: string;
  category: string;
  vendor_name: string;
  contract_ref?: string | null;
  updated_at?: string | null;
};

type AmcDashboardContractRow = AmcContractDedupeKey & {
  vendor_contact_person: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  contract_start_date: string;
  contract_end_date: string;
  service_frequency: string;
  contract_value: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
  internal_owner: string | null;
  remarks: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  scope_of_work: string | null;
};

/** Keep one row per location + category + vendor; prefer E3-AMC-* contract_ref. */
function dedupeAmcContracts<T extends AmcContractDedupeKey>(contracts: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of contracts) {
    const key = `${c.location_id}\0${c.category}\0${c.vendor_name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(c);
    groups.set(key, bucket);
  }

  const result: T[] = [];
  for (const items of groups.values()) {
    if (items.length === 1) {
      result.push(items[0]);
      continue;
    }
    const winner = [...items].sort((a, b) => {
      const aE3 = a.contract_ref?.startsWith("E3-AMC-") ? 0 : a.contract_ref ? 1 : 2;
      const bE3 = b.contract_ref?.startsWith("E3-AMC-") ? 0 : b.contract_ref ? 1 : 2;
      if (aE3 !== bE3) return aE3 - bE3;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    })[0];
    result.push(winner);
  }
  return result;
}

async function refreshOverdue(context: { supabase: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>["supabase"] }) {
  const todayStr = today();
  await context.supabase
    .from("amc_service_schedules")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("planned_date", todayStr);
}

type AmcScheduleRow = {
  id: string;
  contract_id: string;
  service_number: number;
  visit_label: string | null;
  planned_date: string;
  actual_service_date: string | null;
  status: string;
  verification_status: string;
  internal_notes: string | null;
};

type AmcPaymentLineRow = {
  id: string;
  contract_id: string;
  label: string;
  percent: number | null;
  amount: number;
  due_date: string;
  paid: boolean;
  paid_date: string | null;
};

function effectiveScheduleStatus(status: string, plannedDate: string, todayStr: string): string {
  if (status === "pending" && plannedDate < todayStr) return "overdue";
  return status;
}

export const getAmcDashboard = createAuthenticatedAction(
  FilterSchema,
  async (data, context) => {
    const { fetchAmcDashboard } = await import("@/lib/queries/amc-dashboard.core");
    return fetchAmcDashboard(context, data);
  },
  { defaultInput: {}, auth: { capability: "amc.view" } },
);

export const listAmcContracts = createAuthenticatedAction(
  FilterSchema,
  async (data, context) => {
    const dash = await getAmcDashboard(data);
    return dash.contracts;
  },
  { defaultInput: {}, auth: { capability: "amc.view" } },
);

export const getAmcContract = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    await refreshOverdue(context);
    const { data: contract, error } = await context.supabase
      .from("amc_contracts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    await assertLocationAccess(context, contract.location_id);

    const [{ data: location }, { data: schedules }, { data: attachments }] = await Promise.all([
      context.supabase.from("locations").select("id, code, name, region, city").eq("id", contract.location_id).single(),
      context.supabase
        .from("amc_service_schedules")
        .select("*")
        .eq("contract_id", data.id)
        .order("service_number"),
      context.supabase.from("amc_attachments").select("*").eq("contract_id", data.id).order("uploaded_at", { ascending: false }),
    ]);

    const daysLeft = Math.ceil(
      (new Date(contract.contract_end_date).getTime() - Date.now()) / 86400000,
    );

    return {
      ...contract,
      contract_value: Number(contract.contract_value),
      paid_amount: Number(contract.paid_amount),
      outstanding_amount: Number(contract.outstanding_amount),
      location,
      schedules: schedules ?? [],
      attachments: attachments ?? [],
      days_left: daysLeft,
    };
  },
  { auth: { capability: "amc.view" } },
);

const ContractInput = z.object({
  locationId: z.string().uuid(),
  category: z.enum(AMC_CATEGORIES),
  vendorName: z.string().min(1).max(200),
  vendorContactPerson: z.string().max(200).optional(),
  vendorPhone: z.string().max(50).optional(),
  vendorEmail: z.string().email().optional().or(z.literal("")),
  vendorId: z.string().uuid().optional(),
  contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contractEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceFrequency: z.enum(AMC_FREQUENCIES),
  contractValue: z.number().min(0),
  paidAmount: z.number().min(0).default(0),
  status: z.enum(AMC_CONTRACT_STATUSES).default("active"),
  internalOwner: z.string().uuid().optional(),
  scopeOfWork: z.string().max(2000).optional(),
  remarks: z.string().max(2000).optional(),
  regenerateSchedule: z.boolean().default(true),
});

export const createAmcContract = createAuthenticatedAction(
  ContractInput,
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);

    const { data: row, error } = await context.supabase
      .from("amc_contracts")
      .insert({
        location_id: data.locationId,
        category: data.category,
        vendor_name: data.vendorName,
        vendor_contact_person: data.vendorContactPerson ?? null,
        vendor_phone: data.vendorPhone ?? null,
        vendor_email: data.vendorEmail || null,
        vendor_id: data.vendorId ?? null,
        contract_start_date: data.contractStartDate,
        contract_end_date: data.contractEndDate,
        service_frequency: data.serviceFrequency,
        contract_value: data.contractValue,
        paid_amount: data.paidAmount,
        status: data.status,
        internal_owner: data.internalOwner ?? context.userId,
        scope_of_work: data.scopeOfWork ?? null,
        remarks: data.remarks ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (data.regenerateSchedule) {
      await regenerateSchedulesForContract(context, row.id, data.contractStartDate, data.contractEndDate, data.serviceFrequency);
    }

    return { id: row.id };
  },
  { auth: { capability: "amc.manage" } },
);

export const updateAmcContract = createAuthenticatedAction(
  ContractInput.extend({ id: z.string().uuid(), regenerateSchedule: z.boolean().default(false) }),
  async (data, context) => {
    const { data: existing } = await context.supabase
      .from("amc_contracts")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (!existing) throw new Error("Contract not found");
    await assertLocationAccess(context, existing.location_id);

    const { error } = await context.supabase
      .from("amc_contracts")
      .update({
        location_id: data.locationId,
        category: data.category,
        vendor_name: data.vendorName,
        vendor_contact_person: data.vendorContactPerson ?? null,
        vendor_phone: data.vendorPhone ?? null,
        vendor_email: data.vendorEmail || null,
        vendor_id: data.vendorId ?? null,
        contract_start_date: data.contractStartDate,
        contract_end_date: data.contractEndDate,
        service_frequency: data.serviceFrequency,
        contract_value: data.contractValue,
        paid_amount: data.paidAmount,
        status: data.status,
        internal_owner: data.internalOwner ?? null,
        scope_of_work: data.scopeOfWork ?? null,
        remarks: data.remarks ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;

    if (data.regenerateSchedule) {
      await context.supabase.from("amc_service_schedules").delete().eq("contract_id", data.id);
      await regenerateSchedulesForContract(context, data.id, data.contractStartDate, data.contractEndDate, data.serviceFrequency);
    }

    return { ok: true };
  },
  { auth: { capability: "amc.manage" } },
);

async function regenerateSchedulesForContract(
  context: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>,
  contractId: string,
  start: string,
  end: string,
  frequency: (typeof AMC_FREQUENCIES)[number],
) {
  const dates = generatePlannedServiceDates(start, end, frequency);
  if (!dates.length) return;

  const rows = dates.map((planned_date, i) => ({
    contract_id: contractId,
    service_number: i + 1,
    planned_date,
    status: "pending",
  }));

  const { error } = await context.supabase.from("amc_service_schedules").insert(rows);
  if (error) throw error;

  await syncContractServiceDates(context, contractId);
}

async function syncContractServiceDates(
  context: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>,
  contractId: string,
) {
  const { data: schedules } = await context.supabase
    .from("amc_service_schedules")
    .select("planned_date, actual_service_date, status")
    .eq("contract_id", contractId);

  const lastDone = (schedules ?? [])
    .filter((s) => s.status === "done" && s.actual_service_date)
    .map((s) => s.actual_service_date as string)
    .sort()
    .pop();

  const nextPending = (schedules ?? [])
    .filter((s) => ["pending", "overdue"].includes(s.status))
    .map((s) => s.planned_date)
    .sort()[0];

  await context.supabase
    .from("amc_contracts")
    .update({
      last_service_date: lastDone ?? null,
      next_service_date: nextPending ?? null,
    })
    .eq("id", contractId);
}

export const markAmcServiceDone = createAuthenticatedAction(
  z.object({
    scheduleId: z.string().uuid(),
    actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    vendorRemarks: z.string().max(1000).optional(),
    internalNotes: z.string().max(1000).optional(),
  }),
  async (data, context) => {
    const actual = data.actualDate ?? today();
    const { data: sched, error: fErr } = await context.supabase
      .from("amc_service_schedules")
      .select("contract_id")
      .eq("id", data.scheduleId)
      .single();
    if (fErr) throw fErr;

    const { data: contract } = await context.supabase
      .from("amc_contracts")
      .select("location_id")
      .eq("id", sched.contract_id)
      .single();
    if (contract) await assertLocationAccess(context, contract.location_id);

    const { error } = await context.supabase
      .from("amc_service_schedules")
      .update({
        status: "done",
        actual_service_date: actual,
        vendor_remarks: data.vendorRemarks ?? null,
        internal_notes: data.internalNotes ?? null,
        verification_status: "pending",
      })
      .eq("id", data.scheduleId);
    if (error) throw error;

    await syncContractServiceDates(context, sched.contract_id);
    return { ok: true };
  },
  { auth: { capability: "amc.manage" } },
);

export const rescheduleAmcService = createAuthenticatedAction(
  z.object({
    scheduleId: z.string().uuid(),
    plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    internalNotes: z.string().max(1000).optional(),
  }),
  async (data, context) => {
    const { data: sched } = await context.supabase
      .from("amc_service_schedules")
      .select("contract_id")
      .eq("id", data.scheduleId)
      .single();
    if (!sched) throw new Error("Schedule not found");

    const { error } = await context.supabase
      .from("amc_service_schedules")
      .update({
        planned_date: data.plannedDate,
        status: "rescheduled",
        internal_notes: data.internalNotes ?? null,
      })
      .eq("id", data.scheduleId);
    if (error) throw error;

    await syncContractServiceDates(context, sched.contract_id);
    return { ok: true };
  },
  { auth: { capability: "amc.manage" } },
);

export const recordAmcPayment = createAuthenticatedAction(
  z.object({
    contractId: z.string().uuid(),
    amount: z.number().positive(),
    notes: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { data: contract, error: fErr } = await context.supabase
      .from("amc_contracts")
      .select("location_id, paid_amount, remarks")
      .eq("id", data.contractId)
      .single();
    if (fErr) throw fErr;
    await assertLocationAccess(context, contract.location_id);

    const newPaid = Number(contract.paid_amount) + data.amount;
    const noteLine = data.notes ? `\n[Payment ${today()}] +QAR ${data.amount}: ${data.notes}` : `\n[Payment ${today()}] +QAR ${data.amount}`;

    const { error } = await context.supabase
      .from("amc_contracts")
      .update({
        paid_amount: newPaid,
        remarks: (contract.remarks ?? "") + noteLine,
      })
      .eq("id", data.contractId);
    if (error) throw error;
    return { paid_amount: newPaid };
  },
  { auth: { capability: "amc.manage" } },
);

export const verifyAmcService = createAuthenticatedAction(
  z.object({
    scheduleId: z.string().uuid(),
    verificationStatus: z.enum(["verified", "rejected", "pending"]).default("verified"),
  }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("amc_service_schedules")
      .update({
        verification_status: data.verificationStatus,
        verified_by: context.userId,
      })
      .eq("id", data.scheduleId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "amc.verify" } },
);

export const uploadAmcAttachment = createAuthenticatedAction(
  z.object({
    contractId: z.string().uuid(),
    serviceScheduleId: z.string().uuid().optional(),
    attachmentType: z.enum(AMC_ATTACHMENT_TYPES).default("other"),
    filename: z.string().min(1).max(200),
    dataBase64: z.string().min(10).max(10_000_000),
    contentType: z.string().max(100).default("application/pdf"),
  }),
  async (data, context) => {
    validateUploadMime(data.contentType, data.contentType.startsWith("image/") ? "image" : "document");
    validateBase64Size(data.dataBase64, 10 * 1024 * 1024);

    const { data: contract } = await context.supabase
      .from("amc_contracts")
      .select("location_id")
      .eq("id", data.contractId)
      .single();
    if (!contract) throw new Error("Contract not found");
    await assertLocationAccess(context, contract.location_id);

    const folder = data.serviceScheduleId ?? "contract";
    const path = `${contract.location_id}/${data.contractId}/${folder}/${data.attachmentType}-${Date.now()}-${data.filename}`;
    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));

    const { error: upErr } = await context.supabase.storage
      .from("amc-documents")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw upErr;

    await context.supabase.from("amc_attachments").insert({
      contract_id: data.contractId,
      service_schedule_id: data.serviceScheduleId ?? null,
      attachment_type: data.attachmentType,
      file_name: data.filename,
      file_path: path,
      file_mime: data.contentType,
      uploaded_by: context.userId,
    });

    return { path };
  },
  { auth: { capability: "amc.manage" } },
);

export const listAmcRenewals = createAuthenticatedAction(
  z.object({ days: z.number().int().min(1).max(365).default(30) }).default({}),
  async (data, context) => {
    const { fetchAmcRenewals } = await import("@/lib/queries/amc-queries.core");
    return fetchAmcRenewals(context, data.days);
  },
  { defaultInput: {}, auth: { capability: "amc.view" } },
);

export const listAmcSchedule = createAuthenticatedAction(
  FilterSchema,
  async (data, context) => {
    await refreshOverdue(context);
    let cq = context.supabase.from("amc_contracts").select("id, location_id, category, vendor_name");
    if (data.locationId) cq = cq.eq("location_id", data.locationId);
    const { data: contracts } = await cq;
    const ids = (contracts ?? []).map((c) => c.id);
    if (!ids.length) return [];

    let sq = context.supabase
      .from("amc_service_schedules")
      .select("*")
      .in("contract_id", ids)
      .order("planned_date");
    if (data.overdueOnly) sq = sq.eq("status", "overdue");

    const { data: schedules, error } = await sq;
    if (error) throw error;

    const contractMap = new Map((contracts ?? []).map((c) => [c.id, c]));
    return (schedules ?? []).map((s) => ({
      ...s,
      contract: contractMap.get(s.contract_id),
    }));
  },
  { defaultInput: {}, auth: { capability: "amc.view" } },
);

export const exportAmcDashboardCsv = createAuthenticatedAction(
  FilterSchema,
  async (data, context) => {
    const dash = await getAmcDashboard(data);
    const header =
      "region,site_code,site_name,category,vendor,start_date,end_date,days_left,status,payment_status,value,paid,outstanding,frequency,next_service";
    const lines = dash.contracts.map((c) =>
      [
        c.region,
        c.location_code,
        c.location_name,
        c.category,
        c.vendor_name,
        c.contract_start_date,
        c.contract_end_date,
        c.days_left,
        c.status,
        c.payment_status,
        c.contract_value,
        c.paid_amount,
        c.outstanding_amount,
        c.service_frequency,
        c.next_service_date ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    );
    return {
      filename: `amc-dashboard-${today()}.csv`,
      csv: [header, ...lines].join("\n"),
    };
  },
  { defaultInput: {}, auth: { capability: "amc.view" } },
);

export const importAmcContractsCsv = createAuthenticatedAction(
  z.object({
    rows: z.array(
      z.object({
        siteCode: z.string().min(2),
        category: z.enum(AMC_CATEGORIES),
        vendorName: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        frequency: z.enum(AMC_FREQUENCIES),
        value: z.number().min(0),
        paid: z.number().min(0).default(0),
      }),
    ),
  }),
  async (data, context) => {
    const codes = [...new Set(data.rows.map((r) => r.siteCode))];
    const { data: locs } = await context.supabase.from("locations").select("id, code").in("code", codes);
    const codeMap = new Map((locs ?? []).map((l) => [l.code, l.id]));

    let created = 0;
    for (const row of data.rows) {
      const locId = codeMap.get(row.siteCode);
      if (!locId) continue;
      await assertLocationAccess(context, locId);
      const { data: inserted, error } = await context.supabase
        .from("amc_contracts")
        .insert({
          location_id: locId,
          category: row.category,
          vendor_name: row.vendorName,
          contract_start_date: row.startDate,
          contract_end_date: row.endDate,
          service_frequency: row.frequency,
          contract_value: row.value,
          paid_amount: row.paid,
          status: "active",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) continue;
      await regenerateSchedulesForContract(context, inserted.id, row.startDate, row.endDate, row.frequency);
      created += 1;
    }
    return { created };
  },
  { auth: { capability: "amc.manage" } },
);

export const listAmcSites = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("locations")
      .select("id, code, name, region, city, status")
      .in("code", ["KDS-CC", "KDS-DM", "INF-CC", "UA-DM", "CB-VM", "CB-DSM", "CAR-AP"])
      .eq("status", "active")
      .order("region")
      .order("code");
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "amc.view" } },
);

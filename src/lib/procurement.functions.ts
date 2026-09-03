"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";
import { isEditablePrStatus, resolvePrActions } from "@/lib/procurement/actions";
import {
  addNamedAmount,
  amountOf,
  emptyPipeline,
  isOpenStatus,
  isPendingMine,
  isUrgentPriority,
  isWatchStatus,
  monthStartIso,
  pipelineKeyForStatus,
  sortActionQueue,
  sortOverdue,
  todayIso,
  topNamed,
  toListRow,
  type PrHeaderRow,
} from "@/lib/procurement/dashboard";
import { departmentPathName } from "@/lib/departments";
import {
  computeDepartmentBudgetCheck,
  departmentBudgetYear,
  isDeptBudgetCountStatus,
  yearOfPrDate,
  type DepartmentBudgetCheck,
} from "@/lib/procurement/department-budget";
import {
  isExecApprovalRole,
  resolveApprovalRoute,
  statusForStep,
  STEP_CAPABILITY,
  type ApprovalStepRole,
  type DoaBand,
  type DoaSettings,
} from "@/lib/procurement/routing";
import {
  callPurchaseRequisitionAiDraft,
  PR_AI_FOCUSES,
  type PrVendorHistoryHint,
} from "@/lib/procurement/ai-request-draft";
import { eventDisplayName, uniqueEventProjectNames } from "@/lib/procurement/event-link";
import {
  PR_ATTACHMENT_BUCKET,
  PR_ATTACHMENT_MIMES,
  PR_MAX_FILE_BYTES,
  PR_MAX_FILES,
} from "@/lib/procurement/constants";
import { defaultMilestones, roundMoney } from "@/lib/procurement/milestones";
import { notifyPurchaseRequisitionEvent } from "@/lib/notifications/action-notify";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMimeList } from "@/lib/server/upload-validation";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";
import {
  matchLocationFromNotes,
  type MaintenanceLocationOption,
} from "@/lib/maintenance/ai-request-draft";

const PR_STATUSES = [
  "draft",
  "submitted",
  "dept_review",
  "gm_review",
  "ceo_review",
  "finance_review",
  "procurement_review",
  "approved",
  "rejected",
  "returned",
  "on_hold",
  "po_created",
  "cancelled",
] as const;

const LineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  qty: z.number().positive(),
  unit: z.string().max(20).default("ea"),
  unit_price: z.number().min(0),
  preferred_vendor_id: z.string().uuid().nullable().optional(),
  remarks: z.string().max(500).optional().nullable(),
});

const MilestoneInputSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().min(0),
  due_date: z.string().optional().nullable(),
  due_timing: z.string().max(120).optional().nullable(),
  conditions: z.string().max(1000).optional().nullable(),
});

const AttachmentInputSchema = z.object({
  file_name: z.string().min(1).max(200),
  file_mime: z.string().max(120).optional().nullable(),
  doc_type: z.enum(["quotation", "scope", "comparison", "clearance", "other"]).default("other"),
  data_base64: z.string().min(10).max(16_000_000),
});

const HeaderSchema = z.object({
  department_id: z.string().uuid().nullable().optional(),
  cost_center: z.string().max(80).optional().nullable(),
  location_id: z.string().uuid(),
  project_name: z.string().max(200).optional().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  request_type: z.enum(["goods", "services", "mixed"]).default("goods"),
  spend_type: z.enum(["opex", "capex"]).default("opex"),
  priority: z.enum(["low", "normal", "high", "emergency"]).default("normal"),
  required_by: z.string().optional().nullable(),
  justification: z.string().min(3).max(4000),
  title: z.string().max(200).optional().nullable(),
  purpose_category: z.string().max(80).optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  estimated_exposure: z.number().min(0).optional().nullable(),
  payment_structure: z.enum(["full_advance", "milestones", "post_delivery"]).optional(),
  payment_notes: z.string().max(2000).optional().nullable(),
  attachment_path: z.string().max(500).optional().nullable(),
  attachment_name: z.string().max(200).optional().nullable(),
  milestones: z.array(MilestoneInputSchema).optional(),
  files: z.array(AttachmentInputSchema).max(PR_MAX_FILES).optional(),
});

async function writePrAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    prId?: string | null;
    locationId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await context.supabase.from("pr_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    pr_id: entry.prId ?? null,
    location_id: entry.locationId ?? null,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
    metadata: (entry.metadata ?? {}) as Json,
  });
}

async function loadDoa(context: AuthContext): Promise<{ bands: DoaBand[]; settings: DoaSettings }> {
  const [{ data: bands }, { data: settingsRow }] = await Promise.all([
    context.supabase
      .from("pr_doa_matrix")
      .select(
        "band_code, label, min_amount, max_amount, require_dept_head, require_gm, require_ceo, require_finance",
      )
      .eq("active", true)
      .order("sort_order"),
    context.supabase
      .from("pr_doa_settings")
      .select(
        "price_variance_pct_threshold, force_ceo_on_price_variance, force_ceo_on_budget_exception",
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return {
    bands: (bands ?? []).map((b) => ({
      band_code: b.band_code,
      label: b.label,
      min_amount: Number(b.min_amount),
      max_amount: b.max_amount == null ? null : Number(b.max_amount),
      require_dept_head: b.require_dept_head,
      require_gm: b.require_gm,
      require_ceo: b.require_ceo,
      require_finance: b.require_finance,
    })),
    settings: {
      price_variance_pct_threshold: Number(settingsRow?.price_variance_pct_threshold ?? 15),
      force_ceo_on_price_variance: settingsRow?.force_ceo_on_price_variance ?? true,
      force_ceo_on_budget_exception: settingsRow?.force_ceo_on_budget_exception ?? true,
    },
  };
}

async function lookupStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, department, location_id, staff_departments(department_id)")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const links = (data.staff_departments ?? []) as Array<{ department_id: string }>;
  return {
    id: data.id as string,
    full_name: data.full_name as string,
    department: (data.department as string | null) ?? null,
    location_id: (data.location_id as string | null) ?? null,
    department_id: links[0]?.department_id ?? null,
  };
}

type PriceLine = {
  item_id?: string | null;
  name: string;
  category?: string | null;
  unit_price: number;
};

async function computePriceVariance(context: AuthContext, lines: PriceLine[]) {
  let maxVariance: number | null = null;
  let compared = 0;

  for (const line of lines) {
    let histQuery = context.supabase
      .from("proc_price_history")
      .select("unit_price")
      .order("recorded_at", { ascending: false })
      .limit(1);
    if (line.item_id) histQuery = histQuery.eq("item_id", line.item_id);
    else histQuery = histQuery.ilike("item_name", line.name);

    const { data } = await histQuery.maybeSingle();
    if (!data) continue;
    const hist = Number(data.unit_price);
    if (!hist) continue;
    compared += 1;
    const pct = ((Number(line.unit_price) - hist) / hist) * 100;
    if (maxVariance == null || pct > maxVariance) maxVariance = pct;
  }

  if (compared === 0) {
    return {
      label: "Insufficient historical data",
      pct: null as number | null,
      flag: false,
    };
  }
  return {
    label: `${maxVariance! >= 0 ? "+" : ""}${maxVariance!.toFixed(1)}% vs last purchase`,
    pct: maxVariance,
    flag: maxVariance != null && maxVariance > 0,
  };
}

async function loadDepartmentSpent(
  context: AuthContext,
  year: number,
  excludePrId?: string | null,
): Promise<Map<string, number>> {
  const { data, error } = await context.supabase
    .from("purchase_requisitions")
    .select("id, department_id, total_amount, status, submitted_at, requested_at, created_at")
    .not("department_id", "is", null);
  if (error) throw error;
  const spent = new Map<string, number>();
  for (const row of data ?? []) {
    if (excludePrId && row.id === excludePrId) continue;
    if (!isDeptBudgetCountStatus(String(row.status))) continue;
    const prYear = yearOfPrDate(
      (row.submitted_at as string | null) ??
        (row.requested_at as string | null) ??
        (row.created_at as string | null),
      year,
    );
    if (prYear !== year) continue;
    const deptId = row.department_id as string;
    spent.set(deptId, (spent.get(deptId) ?? 0) + Number(row.total_amount ?? 0));
  }
  return spent;
}

async function computeBudgetStatus(
  context: AuthContext,
  departmentId: string | null | undefined,
  prTotal: number,
  excludePrId?: string | null,
): Promise<DepartmentBudgetCheck> {
  const year = departmentBudgetYear();
  if (!departmentId) {
    return computeDepartmentBudgetCheck({ year, budgetAmount: null, spent: 0, requested: prTotal });
  }
  const [{ data: budget }, spentMap] = await Promise.all([
    context.supabase
      .from("department_budgets")
      .select("amount")
      .eq("department_id", departmentId)
      .eq("year", year)
      .maybeSingle(),
    loadDepartmentSpent(context, year, excludePrId),
  ]);
  return computeDepartmentBudgetCheck({
    year,
    budgetAmount: budget == null ? null : Number(budget.amount),
    spent: spentMap.get(departmentId) ?? 0,
    requested: prTotal,
  });
}

async function loadDepartmentBudgetOverview(context: AuthContext, year = departmentBudgetYear()) {
  const [{ data: depts }, { data: budgets }, spent] = await Promise.all([
    context.supabase
      .from("master_departments")
      .select("id, name, parent_id, sort_order, active")
      .order("sort_order")
      .order("name"),
    context.supabase.from("department_budgets").select("id, department_id, year, amount").eq("year", year),
    loadDepartmentSpent(context, year),
  ]);
  const byId = new Map(
    (depts ?? []).map((d) => [d.id as string, { name: d.name as string, parent_id: (d.parent_id as string | null) ?? null }]),
  );
  const budgetByDept = new Map((budgets ?? []).map((b) => [b.department_id as string, b]));
  return (depts ?? []).map((d) => {
    const cap = budgetByDept.has(d.id) ? Number(budgetByDept.get(d.id)!.amount) : null;
    const deptSpent = spent.get(d.id) ?? 0;
    const check = computeDepartmentBudgetCheck({
      year,
      budgetAmount: cap,
      spent: deptSpent,
      requested: 0,
    });
    return {
      id: d.id as string,
      department_id: d.id as string,
      name: d.name as string,
      path_name: departmentPathName(
        { id: d.id as string, name: d.name as string, parent_id: (d.parent_id as string | null) ?? null },
        byId,
      ),
      parent_id: (d.parent_id as string | null) ?? null,
      active: Boolean(d.active),
      year,
      amount: cap,
      spent: check.spent,
      remaining: check.remaining,
    };
  });
}

async function applyDepartmentBudgetIncrease(
  context: AuthContext,
  opts: { departmentId: string; year: number; amount: number; prId: string },
) {
  if (!opts.departmentId || opts.amount <= 0) return;
  const { data: existing, error: findErr } = await context.supabase
    .from("department_budgets")
    .select("id, amount")
    .eq("department_id", opts.departmentId)
    .eq("year", opts.year)
    .maybeSingle();
  if (findErr) throw findErr;
  let budgetId: string;
  if (existing) {
    const { error } = await context.supabase
      .from("department_budgets")
      .update({ amount: Number(existing.amount) + opts.amount, updated_by: context.userId })
      .eq("id", existing.id);
    if (error) throw error;
    budgetId = existing.id as string;
  } else {
    const { data: created, error } = await context.supabase
      .from("department_budgets")
      .insert({
        department_id: opts.departmentId,
        year: opts.year,
        amount: opts.amount,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    budgetId = created.id as string;
  }
  const { error: incErr } = await context.supabase.from("department_budget_increases").insert({
    department_id: opts.departmentId,
    budget_id: budgetId,
    year: opts.year,
    amount: opts.amount,
    pr_id: opts.prId,
    acted_by: context.userId,
  });
  if (incErr) throw incErr;
}

async function resolveDepartmentNames(context: AuthContext, deptIds: string[]) {
  if (!deptIds.length) return new Map<string, string>();
  const { data } = await context.supabase
    .from("master_departments")
    .select("id, name, parent_id");
  const byId = new Map(
    (data ?? []).map((d) => [d.id as string, { name: d.name as string, parent_id: (d.parent_id as string | null) ?? null }]),
  );
  const names = new Map<string, string>();
  for (const id of deptIds) {
    const row = byId.get(id);
    names.set(id, row ? departmentPathName({ id, name: row.name, parent_id: row.parent_id }, byId) : "—");
  }
  return names;
}

async function replaceLines(
  context: AuthContext,
  prId: string,
  lines: z.infer<typeof LineSchema>[],
) {
  await context.supabase.from("pr_lines").delete().eq("pr_id", prId);
  if (!lines.length) return;
  const { error } = await context.supabase.from("pr_lines").insert(
    lines.map((line, idx) => ({
      pr_id: prId,
      line_no: idx + 1,
      item_id: line.item_id ?? null,
      name: line.name,
      description: line.description ?? null,
      category: line.category ?? null,
      qty: line.qty,
      unit: line.unit ?? "ea",
      unit_price: line.unit_price,
      preferred_vendor_id: line.preferred_vendor_id ?? null,
      remarks: line.remarks ?? null,
    })),
  );
  if (error) throw error;
}

function sanitizePrFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "file";
}

async function replaceMilestones(
  context: AuthContext,
  prId: string,
  structure: "full_advance" | "milestones" | "post_delivery",
  total: number,
  requiredBy: string | null | undefined,
  incoming?: z.infer<typeof MilestoneInputSchema>[],
) {
  const rows =
    incoming && incoming.length
      ? incoming
      : defaultMilestones(structure, total, requiredBy).map((row) => ({
          title: row.title,
          amount: row.amount,
          due_date: row.due_date || null,
          due_timing: row.due_timing,
          conditions: row.conditions,
        }));
  await context.supabase.from("pr_payment_milestones").delete().eq("pr_id", prId);
  const { error } = await context.supabase.from("pr_payment_milestones").insert(
    rows.map((row, idx) => ({
      pr_id: prId,
      line_no: idx + 1,
      title: row.title,
      amount: roundMoney(row.amount),
      due_date: row.due_date || null,
      due_timing: row.due_timing ?? null,
      conditions: row.conditions ?? null,
      status: "pending",
    })),
  );
  if (error) throw error;
}

async function storePrAttachments(
  context: AuthContext,
  prId: string,
  files: z.infer<typeof AttachmentInputSchema>[],
) {
  for (const file of files) {
    validateBase64Size(file.data_base64, PR_MAX_FILE_BYTES);
    const mime = file.file_mime || "application/octet-stream";
    validateUploadMimeList(mime, [...PR_ATTACHMENT_MIMES]);
    const safe = sanitizePrFileName(file.file_name);
    const path = `${prId}/${Date.now()}-${safe}`;
    const buffer = Buffer.from(file.data_base64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from(PR_ATTACHMENT_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) throw upErr;
    const { error } = await context.supabase.from("pr_attachments").insert({
      pr_id: prId,
      file_name: file.file_name,
      file_path: path,
      file_mime: mime,
      doc_type: file.doc_type,
      file_size: buffer.length,
      uploaded_by: context.userId,
    });
    if (error) throw error;
  }
}

async function signedPrAttachmentUrl(context: AuthContext, filePath: string): Promise<string | null> {
  if (!filePath || filePath.startsWith("local:")) return null;
  const { data, error } = await context.supabase.storage
    .from(PR_ATTACHMENT_BUCKET)
    .createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

async function buildAndStoreSteps(
  context: AuthContext,
  prId: string,
  steps: ApprovalStepRole[],
) {
  const { error: delErr } = await context.supabase.from("pr_approval_steps").delete().eq("pr_id", prId);
  if (delErr) throw delErr;
  const { error } = await context.supabase.from("pr_approval_steps").insert(
    steps.map((role, idx) => ({
      pr_id: prId,
      step_order: idx + 1,
      step_role: role,
      status: "pending",
    })),
  );
  if (error) throw error;
}

export const getProcurementOptions = createAuthenticatedActionNoInput(
  async (context) => {
    const staff = await lookupStaff(context);
    const [{ data: locations }, { data: departments }, { data: vendors }, { data: items }] =
      await Promise.all([
        context.supabase.from("locations").select("id, code, name").order("name"),
        context.supabase
          .from("master_departments")
          .select("id, name, parent_id")
          .eq("active", true)
          .order("sort_order"),
        context.supabase
          .from("vendors")
          .select("id, name, entity_type, compliance_status, compliance_deadline, amc_status")
          .eq("active", true)
          .order("name"),
        context.supabase
          .from("proc_items")
          .select("id, sku, name, category, unit")
          .eq("active", true)
          .order("name"),
      ]);
    const year = departmentBudgetYear();
    const budgets = await loadDepartmentBudgetOverview(context, year);
    const byId = new Map(
      (departments ?? []).map((d) => [
        d.id as string,
        { name: d.name as string, parent_id: (d.parent_id as string | null) ?? null },
      ]),
    );
    return {
      staff,
      locations: locations ?? [],
      departments: (departments ?? []).map((d) => ({
        id: d.id as string,
        name: d.name as string,
        parent_id: (d.parent_id as string | null) ?? null,
        path_name: departmentPathName(
          { id: d.id as string, name: d.name as string, parent_id: (d.parent_id as string | null) ?? null },
          byId,
        ),
      })),
      vendors: vendors ?? [],
      items: items ?? [],
      budget_year: year,
      budgets,
    };
  },
  { auth: { capability: "procurement.view" } },
);

async function loadPrVendorHistory(
  context: AuthContext,
  vendors: Array<{ id: string; name: string }>,
): Promise<PrVendorHistoryHint[]> {
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const merged = new Map<string, PrVendorHistoryHint>();
  const remember = (row: PrVendorHistoryHint) => {
    if (!row.vendor_id || !vendorName.has(row.vendor_id)) return;
    const key = `${row.vendor_id}:${normalizeHistoryKey(row.item_id ?? row.item_name)}`;
    const existing = merged.get(key);
    if (!existing || (row.supplied_on ?? "") > (existing.supplied_on ?? "")) {
      merged.set(key, { ...row, vendor_name: vendorName.get(row.vendor_id) ?? row.vendor_name });
    }
  };

  try {
    const { data: lineRows, error: lineErr } = await context.supabase
      .from("pr_lines")
      .select("item_id, name, category, preferred_vendor_id, unit_price, pr_id")
      .not("preferred_vendor_id", "is", null)
      .limit(200);
    if (!lineErr && lineRows?.length) {
      const prIds = [...new Set(lineRows.map((r) => r.pr_id).filter(Boolean))];
      const headers = new Map<string, { pr_number: string | null; supplied_on: string | null }>();
      if (prIds.length) {
        const { data: prRows } = await context.supabase
          .from("purchase_requisitions")
          .select("id, pr_number, requested_at, created_at")
          .in("id", prIds);
        for (const pr of prRows ?? []) {
          headers.set(pr.id, {
            pr_number: pr.pr_number,
            supplied_on: (pr.requested_at ?? pr.created_at ?? null)?.toString().slice(0, 10) ?? null,
          });
        }
      }
      for (const row of lineRows) {
        const header = headers.get(row.pr_id);
        remember({
          item_id: (row.item_id as string | null) ?? null,
          item_name: String(row.name ?? ""),
          category: (row.category as string | null) ?? null,
          vendor_id: String(row.preferred_vendor_id),
          vendor_name: vendorName.get(String(row.preferred_vendor_id)) ?? "",
          unit_price: row.unit_price == null ? null : Number(row.unit_price),
          pr_number: header?.pr_number ?? null,
          supplied_on: header?.supplied_on ?? null,
        });
      }
    }
  } catch {
    /* optional history — heuristic draft still works */
  }

  try {
    const { data: prices } = await context.supabase
      .from("proc_price_history")
      .select("item_id, item_name, category, unit_price, vendor_id, recorded_at")
      .not("vendor_id", "is", null)
      .order("recorded_at", { ascending: false })
      .limit(80);
    for (const p of prices ?? []) {
      remember({
        item_id: (p.item_id as string | null) ?? null,
        item_name: String(p.item_name ?? ""),
        category: (p.category as string | null) ?? null,
        vendor_id: String(p.vendor_id),
        vendor_name: vendorName.get(String(p.vendor_id)) ?? "",
        unit_price: p.unit_price == null ? null : Number(p.unit_price),
        pr_number: null,
        supplied_on: (p.recorded_at as string | null)?.slice(0, 10) ?? null,
      });
    }
  } catch {
    /* price history is optional */
  }

  return [...merged.values()].sort((a, b) => (b.supplied_on ?? "").localeCompare(a.supplied_on ?? ""));
}

function normalizeHistoryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const aiDraftPurchaseRequisition = createAuthenticatedAction(
  z.object({
    notes: z.string().min(3).max(4000),
    location_id: z.string().uuid().optional().nullable(),
    focus: z.enum(PR_AI_FOCUSES).optional(),
  }),
  async (data, context) => {
    const staff = await lookupStaff(context).catch(() => null);
    const emptyLocs: MaintenanceLocationOption[] = [];
    let available_locations = emptyLocs;
    let departments: Array<{ id: string; name: string }> = [];
    let available_vendors: Array<{ id: string; name: string }> = [];
    let items: Array<{ id: string; sku: string | null; name: string; category: string; unit: string }> = [];
    let prices: Array<{
      item_id: string | null;
      item_name: string | null;
      category: string | null;
      unit_price: number;
      vendor_id: string | null;
    }> = [];
    let vendor_history: PrVendorHistoryHint[] = [];

    try {
      const [locationsRes, departmentsRes, vendorsRes, itemsRes, pricesRes] = await Promise.all([
        context.supabase.from("locations").select("id, code, name, region").order("name"),
        context.supabase
          .from("master_departments")
          .select("id, name")
          .eq("active", true)
          .order("sort_order"),
        context.supabase.from("vendors").select("id, name").eq("active", true).order("name"),
        context.supabase
          .from("proc_items")
          .select("id, sku, name, category, unit")
          .eq("active", true)
          .order("name"),
        context.supabase
          .from("proc_price_history")
          .select("item_id, item_name, category, unit_price, vendor_id")
          .order("recorded_at", { ascending: false })
          .limit(80),
      ]);

      available_locations = (locationsRes.data ?? []).map((l) => ({
        id: l.id as string,
        code: l.code as string,
        name: l.name as string,
        region: (l.region as string | null) ?? null,
      }));
      departments = departmentsRes.data ?? [];
      available_vendors = (vendorsRes.data ?? []).map((v) => ({ id: v.id, name: v.name }));
      items = itemsRes.error ? [] : (itemsRes.data ?? []);
      prices = (pricesRes.error ? [] : (pricesRes.data ?? [])).map((p) => ({
        item_id: p.item_id,
        item_name: p.item_name,
        category: p.category,
        unit_price: Number(p.unit_price),
        vendor_id: (p.vendor_id as string | null) ?? null,
      }));
    } catch {
      /* catalogs are optional for a heuristic draft */
    }

    const fromNotes = matchLocationFromNotes(data.notes, available_locations);
    const resolvedLocationId = fromNotes?.id ?? data.location_id ?? staff?.location_id ?? null;
    if (resolvedLocationId) {
      try {
        await assertLocationAccess(context, resolvedLocationId);
      } catch {
        /* keep drafting on the requested site */
      }
    }

    const loc =
      available_locations.find((l) => l.id === resolvedLocationId) ??
      available_locations[0] ??
      (resolvedLocationId
        ? { id: resolvedLocationId, code: "SITE", name: "Selected site", region: null }
        : null);
    if (!loc) throw new Error("Select a site or mention one in the notes (e.g. Urban Arena)");

    const deptName = staff?.department_id
      ? departments.find((d) => d.id === staff.department_id)?.name ?? staff.department
      : staff?.department;

    try {
      vendor_history = await loadPrVendorHistory(context, available_vendors);
    } catch {
      vendor_history = [];
    }

    const draft = await callPurchaseRequisitionAiDraft({
      notes: data.notes,
      focus: data.focus,
      location_id: loc.id,
      location_code: loc.code,
      location_name: loc.name,
      staff_department_id: staff?.department_id ?? null,
      staff_department_name: deptName ?? null,
      available_locations,
      available_departments: departments.map((d) => ({ id: d.id, name: d.name })),
      available_vendors,
      available_items: items,
      recent_prices: prices,
      vendor_history,
    });

    if (draft.fields.location_id) {
      try {
        await assertLocationAccess(context, draft.fields.location_id);
      } catch {
        draft.fields.location_id = loc.id;
        draft.fields.location_code = loc.code;
        draft.fields.location_name = loc.name;
      }
    }

    return draft;
  },
  { auth: { capability: "procurement.create" } },
);

async function fetchInChunks<T>(
  ids: string[],
  load: (chunk: string[]) => Promise<T[]>,
  size = 200,
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(...(await load(ids.slice(i, i + size))));
  }
  return out;
}

export const getProcurementDashboard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }).default({}),
  async (data, context) => {
    const today = todayIso();
    const periodStart = monthStartIso();
    const roles = (context.roles ?? []) as AppRole[];

    let q = context.supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, requested_at, requested_by, department_id, location_id, justification, title, purpose_category, vendor_id, total_amount, status, current_step_role, required_by, priority, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(800);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as PrHeaderRow[];
    const prIds = list.map((r) => r.id);

    const locIds = [...new Set(list.map((r) => r.location_id))];
    const deptIds = [...new Set(list.map((r) => r.department_id).filter(Boolean))] as string[];
    const userIds = [...new Set(list.map((r) => r.requested_by))];

    const [locs, depts, staff, lineRows, approvedPeriodIds] = await Promise.all([
      locIds.length
        ? context.supabase.from("locations").select("id, name").in("id", locIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      deptIds.length
        ? resolveDepartmentNames(context, deptIds).then((map) => ({
            data: [...map.entries()].map(([id, name]) => ({ id, name })),
          }))
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      userIds.length
        ? context.supabase.from("staff").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] }),
      fetchInChunks(prIds, async (chunk) => {
        const { data: lines, error: lineErr } = await context.supabase
          .from("pr_lines")
          .select("pr_id, preferred_vendor_id, line_total")
          .in("pr_id", chunk);
        if (lineErr) throw lineErr;
        return lines ?? [];
      }),
      (async (): Promise<Set<string> | null> => {
        try {
          const { data: hist, error: histErr } = await context.supabase
            .from("pr_approval_history")
            .select("pr_id")
            .eq("to_status", "approved")
            .gte("created_at", `${periodStart}T00:00:00`);
          if (histErr) return null;
          return new Set((hist ?? []).map((h) => h.pr_id).filter(Boolean));
        } catch {
          return null;
        }
      })(),
    ]);

    const locMap = new Map((locs.data ?? []).map((l) => [l.id, l.name]));
    const deptMap = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
    const staffMap = new Map(
      (staff.data ?? []).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]),
    );

    const vendorIds = [
      ...new Set(lineRows.map((l) => l.preferred_vendor_id).filter(Boolean)),
    ] as string[];
    const { data: vendorRows } = vendorIds.length
      ? await context.supabase.from("vendors").select("id, name").in("id", vendorIds)
      : { data: [] as { id: string; name: string }[] };
    const vendorMap = new Map((vendorRows ?? []).map((v) => [v.id, v.name]));

    const vendorByPr = new Map<string, { id: string; name: string; amount: number }>();
    const vendorSpend = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    const prsWithVendor = new Set<string>();
    for (const line of lineRows) {
      const vendorId = line.preferred_vendor_id as string | null;
      if (!vendorId) continue;
      const lineAmt = Number(line.line_total ?? 0);
      const name = vendorMap.get(vendorId) ?? vendorId;
      const current = vendorByPr.get(line.pr_id);
      if (!current || lineAmt > current.amount) {
        vendorByPr.set(line.pr_id, { id: vendorId, name, amount: lineAmt });
      }
      if (!prsWithVendor.has(`${line.pr_id}:${vendorId}`)) {
        prsWithVendor.add(`${line.pr_id}:${vendorId}`);
        addNamedAmount(vendorSpend, vendorId, name, 0);
      }
      const bucket = vendorSpend.get(vendorId);
      if (bucket) bucket.amount += lineAmt;
    }

    const pipeline = emptyPipeline();
    const spendByDepartment = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    const spendBySite = new Map<string, { id: string | null; name: string; count: number; amount: number }>();

    let value = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let returned = 0;
    let drafts = 0;
    let overdue = 0;
    let urgent = 0;
    let pendingMine = 0;
    let approvedThisPeriod = 0;
    let requestedValue = 0;
    let approvedValue = 0;
    let orderedValue = 0;
    let requestedValuePeriod = 0;
    let approvedValuePeriod = 0;
    let orderedValuePeriod = 0;

    const needsActionSrc: PrHeaderRow[] = [];
    const overdueSrc: PrHeaderRow[] = [];
    const urgentSrc: PrHeaderRow[] = [];

    for (const row of list) {
      const amt = amountOf(row);
      value += amt;
      if (row.status !== "cancelled") requestedValue += amt;
      if (row.status === "approved" || row.status === "po_created") {
        approved += 1;
        approvedValue += amt;
      }
      if (row.status === "po_created") {
        orderedValue += amt;
        if ((row.requested_at ?? "") >= periodStart) orderedValuePeriod += amt;
      }
      if (row.status === "draft") drafts += 1;
      if (row.status === "rejected") rejected += 1;
      if (row.status === "returned") returned += 1;
      if (isOpenStatus(row.status)) pending += 1;
      if (row.status !== "cancelled" && (row.requested_at ?? "") >= periodStart) {
        requestedValuePeriod += amt;
      }
      if (
        (row.status === "approved" || row.status === "po_created") &&
        (row.requested_at ?? "") >= periodStart
      ) {
        approvedValuePeriod += amt;
      }
      const approvedThisMonth =
        approvedPeriodIds != null
          ? approvedPeriodIds.has(row.id)
          : (row.status === "approved" || row.status === "po_created") &&
            (row.requested_at ?? "") >= periodStart;
      if (approvedThisMonth) approvedThisPeriod += 1;

      const pipeKey = pipelineKeyForStatus(row.status);
      if (pipeKey) {
        const step = pipeline.find((s) => s.key === pipeKey);
        if (step) {
          step.count += 1;
          step.amount += amt;
        }
      }

      if (row.status !== "cancelled") {
        addNamedAmount(
          spendByDepartment,
          row.department_id,
          row.department_id ? (deptMap.get(row.department_id) ?? "—") : "—",
          amt,
        );
        addNamedAmount(spendBySite, row.location_id, locMap.get(row.location_id) ?? "—", amt);
      }

      if (isPendingMine(row, context.userId, roles)) {
        pendingMine += 1;
        needsActionSrc.push(row);
      }
      if (isWatchStatus(row.status) && row.required_by && row.required_by < today) {
        overdue += 1;
        overdueSrc.push(row);
      }
      if (isUrgentPriority(row.priority) && !["approved", "rejected", "cancelled", "po_created"].includes(row.status)) {
        urgent += 1;
        urgentSrc.push(row);
      }
    }

    const namesFor = (row: PrHeaderRow) => ({
      requester: staffMap.get(row.requested_by) ?? "User",
      department: row.department_id ? (deptMap.get(row.department_id) ?? "—") : "—",
      location: locMap.get(row.location_id) ?? "—",
      vendor: vendorByPr.get(row.id)?.name ?? null,
    });
    const actor = { userId: context.userId, roles };

    return {
      total: list.length,
      value,
      pending,
      approved,
      rejected,
      overdue,
      open: pending,
      drafts,
      pendingMine,
      approvedThisPeriod,
      returned,
      urgent,
      requestedValue,
      approvedValue,
      orderedValue,
      requestedValuePeriod,
      approvedValuePeriod,
      orderedValuePeriod,
      periodStart,
      pipeline,
      spendByDepartment: topNamed(spendByDepartment),
      spendBySite: topNamed(spendBySite),
      vendors: topNamed(vendorSpend),
      needsAction: sortActionQueue(needsActionSrc.map((r) => toListRow(r, namesFor(r), today, actor))).slice(0, 8),
      recent: list.slice(0, 10).map((r) => toListRow(r, namesFor(r), today, actor)),
      overdueList: sortOverdue(overdueSrc.map((r) => toListRow(r, namesFor(r), today, actor))).slice(0, 8),
      urgentList: sortActionQueue(urgentSrc.map((r) => toListRow(r, namesFor(r), today, actor))).slice(0, 8),
    };
  },
  { defaultInput: {}, auth: { capability: "procurement.view" } },
);

export const listPurchaseRequisitions = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      status: z.enum(PR_STATUSES).nullable().optional(),
      minAmount: z.number().nullable().optional(),
      maxAmount: z.number().nullable().optional(),
      mine: z.boolean().optional(),
      pendingMine: z.boolean().optional(),
      eventId: z.string().uuid().nullable().optional(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, requested_at, requested_by, department_id, location_id, justification, title, purpose_category, vendor_id, total_amount, status, current_step_role, required_by, priority, created_at, event_id, project_name, over_budget, excess_amount, budget_increase_pending",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.eventId) q = q.eq("event_id", data.eventId);
    if (data.status) q = q.eq("status", data.status);
    if (data.minAmount != null) q = q.gte("total_amount", data.minAmount);
    if (data.maxAmount != null) q = q.lte("total_amount", data.maxAmount);
    if (data.mine) q = q.eq("requested_by", context.userId);

    const { data: rows, error } = await q;
    if (error) throw error;
    let list = rows ?? [];

    if (data.eventId) {
      const { data: linkedEvent } = await context.supabase
        .from("events")
        .select("id, name, event_name, event_number")
        .eq("id", data.eventId)
        .maybeSingle();
      const names = linkedEvent ? uniqueEventProjectNames(linkedEvent) : [];
      if (names.length) {
        let nameQ = context.supabase
          .from("purchase_requisitions")
          .select(
            "id, pr_number, requested_at, requested_by, department_id, location_id, justification, title, purpose_category, vendor_id, total_amount, status, current_step_role, required_by, priority, created_at, event_id, project_name, over_budget, excess_amount, budget_increase_pending",
          )
          .is("event_id", null)
          .in("project_name", names)
          .order("created_at", { ascending: false })
          .limit(100);
        if (data.locationId) nameQ = nameQ.eq("location_id", data.locationId);
        if (data.status) nameQ = nameQ.eq("status", data.status);
        if (data.minAmount != null) nameQ = nameQ.gte("total_amount", data.minAmount);
        if (data.maxAmount != null) nameQ = nameQ.lte("total_amount", data.maxAmount);
        if (data.mine) nameQ = nameQ.eq("requested_by", context.userId);
        const { data: named, error: nameErr } = await nameQ;
        if (nameErr) throw nameErr;
        const seen = new Set(list.map((r) => r.id));
        for (const row of named ?? []) {
          if (!seen.has(row.id)) list.push(row);
        }
      }
    }

    if (data.pendingMine) {
      const roles = (context.roles ?? []) as AppRole[];
      list = list.filter((r) =>
        resolvePrActions({
          status: r.status,
          currentStepRole: r.current_step_role,
          requestedBy: r.requested_by,
          userId: context.userId,
          roles,
        }).canAct,
      );
    }

    const locIds = [...new Set(list.map((r) => r.location_id))];
    const deptIds = [...new Set(list.map((r) => r.department_id).filter(Boolean))] as string[];
    const userIds = [...new Set(list.map((r) => r.requested_by))];

    const [{ data: locs }, { data: depts }, { data: staff }] = await Promise.all([
      locIds.length
        ? context.supabase.from("locations").select("id, name").in("id", locIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      deptIds.length
        ? resolveDepartmentNames(context, deptIds).then((map) => ({
            data: [...map.entries()].map(([id, name]) => ({ id, name })),
          }))
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      userIds.length
        ? context.supabase.from("staff").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] }),
    ]);

    const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));
    const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name]));
    const staffMap = new Map(
      (staff ?? []).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]),
    );

    const prIds = list.map((r) => r.id);
    const lineRows = await fetchInChunks(prIds, async (chunk) => {
      const { data: lines, error: lineErr } = await context.supabase
        .from("pr_lines")
        .select("pr_id, preferred_vendor_id, line_total")
        .in("pr_id", chunk);
      if (lineErr) throw lineErr;
      return lines ?? [];
    });
    const headerVendorIds = [...new Set(list.map((r) => (r as { vendor_id?: string | null }).vendor_id).filter(Boolean))] as string[];
    const vendorIds = [
      ...new Set([
        ...headerVendorIds,
        ...lineRows.map((l) => l.preferred_vendor_id).filter(Boolean),
      ]),
    ] as string[];
    const { data: vendorRows } = vendorIds.length
      ? await context.supabase.from("vendors").select("id, name").in("id", vendorIds)
      : { data: [] as { id: string; name: string }[] };
    const vendorMap = new Map((vendorRows ?? []).map((v) => [v.id, v.name]));
    const vendorByPr = new Map<string, { name: string; amount: number }>();
    for (const row of list) {
      const headerVendor = (row as { vendor_id?: string | null }).vendor_id;
      if (headerVendor && vendorMap.has(headerVendor)) {
        vendorByPr.set(row.id, { name: vendorMap.get(headerVendor)!, amount: Number(row.total_amount ?? 0) });
      }
    }
    for (const line of lineRows) {
      if (vendorByPr.has(line.pr_id)) continue;
      const vendorId = line.preferred_vendor_id as string | null;
      if (!vendorId) continue;
      const name = vendorMap.get(vendorId);
      if (!name) continue;
      const lineAmt = Number(line.line_total ?? 0);
      const current = vendorByPr.get(line.pr_id);
      if (!current || lineAmt > current.amount) {
        vendorByPr.set(line.pr_id, { name, amount: lineAmt });
      }
    }

    const eventIds = [...new Set(list.map((r) => r.event_id).filter(Boolean))] as string[];
    const { data: eventRows } = eventIds.length
      ? await context.supabase
          .from("events")
          .select("id, event_number, name, event_name")
          .in("id", eventIds)
      : { data: [] as { id: string; event_number: string | null; name: string; event_name: string | null }[] };
    const eventMap = new Map(
      (eventRows ?? []).map((event) => [event.id, { id: event.id, label: eventDisplayName(event) }]),
    );

    const roles = (context.roles ?? []) as AppRole[];
    return list.map((r) => {
      const flags = resolvePrActions({
        status: r.status,
        currentStepRole: r.current_step_role,
        requestedBy: r.requested_by,
        userId: context.userId,
        roles,
      });
      const linked = r.event_id ? eventMap.get(r.event_id) : null;
      return {
        ...r,
        total_amount: Number(r.total_amount),
        location_name: locMap.get(r.location_id) ?? "—",
        department_name: r.department_id ? (deptMap.get(r.department_id) ?? "—") : "—",
        requester_name: staffMap.get(r.requested_by) ?? "User",
        vendor_name: vendorByPr.get(r.id)?.name ?? null,
        project_name: r.project_name ?? null,
        event_id: r.event_id ?? null,
        event_label: linked?.label ?? null,
        purpose: (r.title as string | null)?.trim() || (r.justification ?? "").slice(0, 80),
        title: (r.title as string | null) ?? null,
        purpose_category: (r.purpose_category as string | null) ?? null,
        canAct: flags.canAct,
        canReissue: flags.canReissue,
        canEdit: flags.canEdit,
        isOwner: flags.isOwner,
      };
    });
  },
  { defaultInput: {}, auth: { capability: "procurement.view" } },
);

export const getPurchaseRequisition = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: pr, error } = await context.supabase
      .from("purchase_requisitions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: lines }, { data: steps }, { data: history }, { data: attachments }, { data: milestones }, { data: location }, { data: dept }] =
      await Promise.all([
        context.supabase.from("pr_lines").select("*").eq("pr_id", data.id).order("line_no"),
        context.supabase.from("pr_approval_steps").select("*").eq("pr_id", data.id).order("step_order"),
        context.supabase
          .from("pr_approval_history")
          .select("*")
          .eq("pr_id", data.id)
          .order("created_at", { ascending: true }),
        context.supabase.from("pr_attachments").select("*").eq("pr_id", data.id).order("created_at"),
        context.supabase.from("pr_payment_milestones").select("*").eq("pr_id", data.id).order("line_no"),
        context.supabase.from("locations").select("id, name").eq("id", pr.location_id).maybeSingle(),
        pr.department_id
          ? resolveDepartmentNames(context, [pr.department_id as string]).then((map) => ({
              data: { id: pr.department_id as string, name: map.get(pr.department_id as string) ?? "—" },
            }))
          : Promise.resolve({ data: null }),
      ]);

    const lineRows = lines ?? [];
    const vendorId =
      ((pr.vendor_id as string | null) ??
        (lineRows.find((l) => l.preferred_vendor_id)?.preferred_vendor_id as string | null)) ||
      null;
    const actorIds = [
      ...new Set(
        [
          pr.requested_by as string,
          ...(history ?? []).map((h) => h.actor_id as string | null),
          ...(steps ?? []).map((s) => s.acted_by as string | null),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];

    const [variance, budget, vendorRes, actorsRes] = await Promise.all([
      computePriceVariance(
        context,
        lineRows.map((l) => ({
          item_id: l.item_id,
          name: l.name,
          category: l.category,
          unit_price: Number(l.unit_price),
        })),
      ),
      computeBudgetStatus(context, pr.department_id, Number(pr.total_amount), pr.id),
      vendorId
        ? context.supabase
            .from("vendors")
            .select(
              "id, name, contact_person, phone, email, amc_status, payment_terms, notes, category, active, entity_type, engagement_type, compliance_deadline, compliance_status",
            )
            .eq("id", vendorId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      actorIds.length
        ? context.supabase.from("staff").select("user_id, full_name").in("user_id", actorIds)
        : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] }),
    ]);

    const roles = (context.roles ?? []) as AppRole[];
    const { canAct, canEdit, canReissue, canCancel, isOwner, isLocked } = resolvePrActions({
      status: pr.status,
      currentStepRole: pr.current_step_role,
      requestedBy: pr.requested_by,
      userId: context.userId,
      roles,
    });

    const actorNames: Record<string, string> = {};
    for (const row of actorsRes.data ?? []) {
      if (row.user_id) actorNames[row.user_id] = row.full_name;
    }

    const linkedEventId = (pr.event_id as string | null) ?? null;
    const { data: linkedEvent } = linkedEventId
      ? await context.supabase
          .from("events")
          .select("id, event_number, name, event_name")
          .eq("id", linkedEventId)
          .maybeSingle()
      : { data: null };

    const vendor = vendorRes.data
      ? {
          id: vendorRes.data.id as string,
          name: vendorRes.data.name as string,
          contact_person: (vendorRes.data.contact_person as string | null) ?? null,
          phone: (vendorRes.data.phone as string | null) ?? null,
          email: (vendorRes.data.email as string | null) ?? null,
          amc_status: (vendorRes.data.amc_status as string | null) ?? null,
          payment_terms: (vendorRes.data.payment_terms as string | null) ?? null,
          notes: (vendorRes.data.notes as string | null) ?? null,
          category: (vendorRes.data.category as string | null) ?? null,
          active: Boolean(vendorRes.data.active),
          entity_type: (vendorRes.data.entity_type as string | null) ?? "company",
          engagement_type: (vendorRes.data.engagement_type as string | null) ?? null,
          compliance_deadline: (vendorRes.data.compliance_deadline as string | null) ?? null,
          compliance_status: (vendorRes.data.compliance_status as string | null) ?? "unassessed",
        }
      : null;

    const attachmentRows = await Promise.all(
      (attachments ?? []).map(async (file) => ({
        ...file,
        url: await signedPrAttachmentUrl(context, file.file_path as string),
      })),
    );

    const canClearMilestones =
      ["approved", "po_created"].includes(pr.status as string) &&
      (isOwner || canUserDo(roles, "procurement.finance") || canUserDo(roles, "procurement.configure"));

    return {
      header: {
        ...pr,
        total_amount: Number(pr.total_amount),
        estimated_exposure: pr.estimated_exposure != null ? Number(pr.estimated_exposure) : Number(pr.total_amount),
        location_name: location?.name ?? "—",
        department_name: dept?.name ?? "—",
        requester_name: actorNames[pr.requested_by] ?? "User",
      },
      lines: lineRows.map((l) => ({
        ...l,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        line_total: Number(l.line_total),
      })),
      steps: steps ?? [],
      history: history ?? [],
      attachments: attachmentRows,
      milestones: (milestones ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        paid_amount: Number(row.paid_amount ?? 0),
      })),
      vendor,
      actorNames,
      budget,
      event: linkedEvent
        ? {
            id: linkedEvent.id as string,
            event_number: (linkedEvent.event_number as string | null) ?? null,
            name: eventDisplayName(linkedEvent),
          }
        : null,
      variance,
      canAct,
      canEdit,
      canReissue,
      canCancel,
      isOwner,
      isLocked,
      canClearMilestones,
    };
  },
  { auth: { capability: "procurement.view" } },
);

export const savePurchaseRequisition = createAuthenticatedAction(
  HeaderSchema.extend({
    id: z.string().uuid().optional(),
    submit: z.boolean().optional(),
    lines: z.array(LineSchema).min(1),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const staff = await lookupStaff(context);
    const emergency = data.priority === "emergency";
    let eventId = data.event_id ?? null;
    let projectName = data.project_name ?? null;
    if (eventId) {
      const { data: linkedEvent, error: eventErr } = await context.supabase
        .from("events")
        .select("id, name, event_name, event_number, location_id")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (eventErr) throw eventErr;
      if (!linkedEvent) throw new ForbiddenError("Event not found");
      await assertLocationAccess(context, linkedEvent.location_id as string);
      if (!projectName?.trim()) {
        projectName = linkedEvent.event_name || linkedEvent.name || linkedEvent.event_number;
      }
    }

    const paymentStructure = data.payment_structure ?? "post_delivery";
    const header = {
      requested_by: context.userId,
      requester_staff_id: staff?.id ?? null,
      department_id: data.department_id ?? null,
      cost_center: data.cost_center ?? null,
      location_id: data.location_id,
      project_name: projectName,
      event_id: eventId,
      request_type: data.request_type,
      spend_type: data.spend_type,
      priority: data.priority,
      emergency,
      required_by: data.required_by || null,
      justification: data.justification,
      title: data.title?.trim() || null,
      purpose_category: data.purpose_category ?? null,
      vendor_id: data.vendor_id ?? null,
      estimated_exposure: data.estimated_exposure ?? null,
      payment_structure: paymentStructure,
      payment_notes: data.payment_notes ?? null,
    };

    let prId = data.id ?? null;
    if (prId) {
      const { data: existing, error } = await context.supabase
        .from("purchase_requisitions")
        .select("id, requested_by, status")
        .eq("id", prId)
        .single();
      if (error) throw error;
      if (existing.requested_by !== context.userId) {
        throw new ForbiddenError("Only the requester can edit this PR");
      }
      if (!isEditablePrStatus(existing.status)) {
        throw new ForbiddenError("PR cannot be edited in the current status");
      }
      const { error: updErr } = await context.supabase
        .from("purchase_requisitions")
        .update({
          ...header,
          status: existing.status === "draft" ? "draft" : existing.status,
        })
        .eq("id", prId);
      if (updErr) throw updErr;
    } else {
      const { data: created, error } = await context.supabase
        .from("purchase_requisitions")
        .insert({ ...header, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      prId = created.id;
    }

    await replaceLines(context, prId, data.lines);

    const lineTotal = data.lines.reduce((sum, line) => sum + roundMoney(line.qty * line.unit_price), 0);
    const exposure = data.estimated_exposure ?? lineTotal;
    await replaceMilestones(
      context,
      prId,
      paymentStructure,
      exposure,
      data.required_by,
      data.milestones,
    );

    if (data.files?.length) {
      await storePrAttachments(context, prId, data.files);
    } else if (data.attachment_path) {
      await context.supabase.from("pr_attachments").insert({
        pr_id: prId,
        file_name: data.attachment_name || "attachment",
        file_path: data.attachment_path,
        uploaded_by: context.userId,
      });
    }

    let submittedBudget: { over_budget: boolean; excess_amount: number } | null = null;
    if (data.submit) {
      submittedBudget = await submitPrInternal(context, prId);
    }

    await writePrAudit(context, {
      action: data.submit ? "pr.submit" : data.id ? "pr.update" : "pr.create",
      entityType: "purchase_requisitions",
      entityId: prId,
      prId,
      locationId: data.location_id,
      after: header,
    });

    return {
      id: prId,
      over_budget: submittedBudget?.over_budget ?? false,
      excess_amount: submittedBudget?.excess_amount ?? 0,
    };
  },
  { auth: { capability: "procurement.create" } },
);

export const lookupEventForPr = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context) => {
    const { data: event, error } = await context.supabase
      .from("events")
      .select("id, event_number, name, event_name, location_id, venue_name, client_name")
      .eq("id", data.eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!event) return null;
    await assertLocationAccess(context, event.location_id as string);
    return {
      id: event.id as string,
      event_number: (event.event_number as string | null) ?? null,
      name: (event.event_name as string | null) || (event.name as string),
      project_name: (event.event_name as string | null) || (event.name as string),
      location_id: event.location_id as string,
      venue_name: (event.venue_name as string | null) ?? null,
      client_name: (event.client_name as string | null) ?? null,
      label: eventDisplayName(event),
    };
  },
  { auth: { capability: "procurement.create" } },
);

async function submitPrInternal(context: AuthContext, prId: string) {
  const { data: pr, error } = await context.supabase
    .from("purchase_requisitions")
    .select("*")
    .eq("id", prId)
    .single();
  if (error) throw error;
  if (pr.requested_by !== context.userId) {
    throw new ForbiddenError("Only the requester can submit this PR");
  }
  if (!isEditablePrStatus(pr.status)) {
    throw new ForbiddenError("PR cannot be submitted in the current status");
  }
  const isResubmit = pr.status !== "draft";

  const { data: lines } = await context.supabase.from("pr_lines").select("*").eq("pr_id", prId);
  if (!lines?.length) throw new Error("Add at least one line item");

  const { bands, settings } = await loadDoa(context);
  const variance = await computePriceVariance(
    context,
    lines.map((l) => ({
      item_id: l.item_id,
      name: l.name,
      unit_price: Number(l.unit_price),
    })),
  );
  const budget = await computeBudgetStatus(
    context,
    pr.department_id,
    Number(pr.total_amount),
    prId,
  );
  const route = resolveApprovalRoute({
    amount: Number(pr.total_amount),
    emergency: Boolean(pr.emergency),
    priceVariancePct: variance.pct,
    budgetException: budget.exception || budget.overBudget,
    bands,
    settings,
  });
  await buildAndStoreSteps(context, prId, route);
  const first = route[0] ?? "finance";

  let prNumber = pr.pr_number;
  if (!prNumber) {
    const { data: num, error: numErr } = await context.supabase.rpc("next_pr_number");
    if (numErr) throw numErr;
    prNumber = num as string;
  }

  const nextStatus = statusForStep(first);
  const { error: updErr } = await context.supabase
    .from("purchase_requisitions")
    .update({
      pr_number: prNumber,
      status: nextStatus,
      current_step_role: first,
      submitted_at: new Date().toISOString(),
      budget_exception: budget.exception || budget.overBudget,
      over_budget: budget.overBudget,
      excess_amount: budget.excessAmount,
      budget_increase_pending: false,
      price_variance_flag: Boolean(variance.flag && variance.pct != null && variance.pct > settings.price_variance_pct_threshold),
    })
    .eq("id", prId);
  if (updErr) throw updErr;

  const { error: histErr } = await context.supabase.from("pr_approval_history").insert({
    pr_id: prId,
    action: isResubmit ? "resubmitted" : "submitted",
    from_status: pr.status,
    to_status: nextStatus,
    actor_id: context.userId,
    comments: isResubmit ? null : pr.justification,
    metadata: {
      route,
      emergency: pr.emergency,
      resubmit: isResubmit,
      over_budget: budget.overBudget,
      excess_amount: budget.excessAmount,
    } as Json,
  });
  if (histErr) throw histErr;

  await notifyPurchaseRequisitionEvent({
    prId,
    prNumber,
    locationId: pr.location_id,
    requesterId: context.userId,
    actorId: context.userId,
    justification: pr.justification,
    priority: pr.priority,
    kind: isResubmit ? "resubmitted" : "submitted",
    nextStepRole: first,
  });

  return { over_budget: budget.overBudget, excess_amount: budget.excessAmount };
}

export const actOnPurchaseRequisition = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "reject", "return", "hold", "resume", "cancel", "reissue"]),
    comments: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const comments = (data.comments ?? "").trim();
    if (["reject", "return", "hold"].includes(data.action) && comments.length < 3) {
      throw new Error("Comments are required for this action.");
    }

    const { data: pr, error } = await context.supabase
      .from("purchase_requisitions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    await assertLocationAccess(context, pr.location_id);

    const roles = (context.roles ?? []) as AppRole[];
    const fromStatus = pr.status;

    if (data.action === "cancel") {
      if (pr.requested_by !== context.userId && !canUserDo(roles, "procurement.configure")) {
        throw new ForbiddenError("Only the requester can cancel this PR");
      }
      await context.supabase
        .from("purchase_requisitions")
        .update({ status: "cancelled", current_step_role: null })
        .eq("id", data.id);
      await context.supabase.from("pr_approval_history").insert({
        pr_id: data.id,
        action: "cancelled",
        from_status: fromStatus,
        to_status: "cancelled",
        actor_id: context.userId,
        comments,
      });
      await writePrAudit(context, {
        action: "pr.cancel",
        entityType: "purchase_requisitions",
        entityId: data.id,
        prId: data.id,
        locationId: pr.location_id,
      });
      return { id: data.id, status: "cancelled" };
    }

    if (data.action === "resume") {
      if (pr.status !== "on_hold") throw new Error("PR is not on hold");
      const { data: pending } = await context.supabase
        .from("pr_approval_steps")
        .select("step_role")
        .eq("pr_id", data.id)
        .eq("status", "pending")
        .order("step_order")
        .limit(1)
        .maybeSingle();
      const role = (pending?.step_role as ApprovalStepRole | undefined) ?? "finance";
      await context.supabase
        .from("purchase_requisitions")
        .update({ status: statusForStep(role), current_step_role: role, hold_reason: null })
        .eq("id", data.id);
      await context.supabase.from("pr_approval_history").insert({
        pr_id: data.id,
        action: "resumed",
        from_status: fromStatus,
        to_status: statusForStep(role),
        actor_id: context.userId,
        comments,
      });
      return { id: data.id, status: statusForStep(role) };
    }

    if (data.action === "reissue") {
      if (!["rejected", "returned"].includes(pr.status)) {
        throw new Error("Only rejected or returned PRs can be reissued");
      }
      if (pr.requested_by !== context.userId && !canUserDo(roles, "procurement.configure")) {
        throw new ForbiddenError("Only the requester can reissue this PR");
      }
      const { error: stepDelErr } = await context.supabase.from("pr_approval_steps").delete().eq("pr_id", data.id);
      if (stepDelErr) throw stepDelErr;
      await context.supabase
        .from("purchase_requisitions")
        .update({
          status: "draft",
          current_step_role: null,
          hold_reason: null,
          over_budget: false,
          excess_amount: 0,
          budget_increase_pending: false,
        })
        .eq("id", data.id);
      await context.supabase.from("pr_approval_history").insert({
        pr_id: data.id,
        action: "reissued",
        from_status: fromStatus,
        to_status: "draft",
        actor_id: context.userId,
        comments: comments || "Reissued after rejection",
      });
      await writePrAudit(context, {
        action: "pr.reissue",
        entityType: "purchase_requisitions",
        entityId: data.id,
        prId: data.id,
        locationId: pr.location_id,
      });
      return { id: data.id, status: "draft" };
    }

    if (pr.requested_by === context.userId) {
      throw new ForbiddenError("You cannot approve your own requisition.");
    }

    const { data: currentStep } = await context.supabase
      .from("pr_approval_steps")
      .select("*")
      .eq("pr_id", data.id)
      .eq("status", "pending")
      .order("step_order")
      .limit(1)
      .maybeSingle();
    if (!currentStep) throw new Error("No pending approval step");

    const stepRole = currentStep.step_role as ApprovalStepRole;
    const cap = STEP_CAPABILITY[stepRole] as Capability;
    if (!canUserDo(roles, cap)) {
      throw new ForbiddenError(`Forbidden: missing capability ${cap}`);
    }

    if (data.action === "hold") {
      await context.supabase
        .from("purchase_requisitions")
        .update({ status: "on_hold", hold_reason: comments })
        .eq("id", data.id);
      await context.supabase.from("pr_approval_history").insert({
        pr_id: data.id,
        step_id: currentStep.id,
        action: "held",
        from_status: fromStatus,
        to_status: "on_hold",
        actor_id: context.userId,
        comments,
      });
      return { id: data.id, status: "on_hold" };
    }

    if (data.action === "reject" || data.action === "return") {
      const toStatus = data.action === "reject" ? "rejected" : "returned";
      await context.supabase
        .from("pr_approval_steps")
        .update({
          status: "rejected",
          acted_by: context.userId,
          acted_at: new Date().toISOString(),
          comments,
        })
        .eq("id", currentStep.id);
      await context.supabase
        .from("purchase_requisitions")
        .update({ status: toStatus, current_step_role: null })
        .eq("id", data.id);
      await context.supabase.from("pr_approval_history").insert({
        pr_id: data.id,
        step_id: currentStep.id,
        action: data.action === "reject" ? "rejected" : "returned",
        from_status: fromStatus,
        to_status: toStatus,
        actor_id: context.userId,
        comments,
      });
      await writePrAudit(context, {
        action: `pr.${data.action}`,
        entityType: "purchase_requisitions",
        entityId: data.id,
        prId: data.id,
        locationId: pr.location_id,
        metadata: { comments },
      });
      await notifyPurchaseRequisitionEvent({
        prId: data.id,
        prNumber: pr.pr_number,
        locationId: pr.location_id,
        requesterId: pr.requested_by,
        actorId: context.userId,
        justification: comments || pr.justification,
        priority: pr.priority,
        kind: data.action === "reject" ? "rejected" : "returned",
      });
      return { id: data.id, status: toStatus };
    }

    await context.supabase
      .from("pr_approval_steps")
      .update({
        status: "approved",
        acted_by: context.userId,
        acted_at: new Date().toISOString(),
        comments: comments || null,
      })
      .eq("id", currentStep.id);

    const { data: nextStep } = await context.supabase
      .from("pr_approval_steps")
      .select("*")
      .eq("pr_id", data.id)
      .eq("status", "pending")
      .order("step_order")
      .limit(1)
      .maybeSingle();

    const overBudget = Boolean(pr.over_budget || pr.budget_exception);
    const excessAmount = Number(pr.excess_amount ?? 0);
    let budgetIncreasePending = Boolean(pr.budget_increase_pending);
    let excessRequested = false;
    let budgetIncreased = false;
    const execStep = isExecApprovalRole(stepRole);
    const isFirstStep = Number(currentStep.step_order) === 1;
    if (overBudget && excessAmount > 0 && pr.department_id) {
      const laterExec = Boolean(nextStep && isExecApprovalRole(nextStep.step_role as string));
      if (execStep && (budgetIncreasePending || isFirstStep)) {
        await applyDepartmentBudgetIncrease(context, {
          departmentId: pr.department_id as string,
          year: yearOfPrDate(
            (pr.submitted_at as string | null) ?? (pr.requested_at as string | null),
          ),
          amount: excessAmount,
          prId: data.id,
        });
        budgetIncreased = true;
        budgetIncreasePending = false;
      } else if (!execStep) {
        if (laterExec) {
          budgetIncreasePending = true;
          excessRequested = true;
        } else {
          await applyDepartmentBudgetIncrease(context, {
            departmentId: pr.department_id as string,
            year: yearOfPrDate(
              (pr.submitted_at as string | null) ?? (pr.requested_at as string | null),
            ),
            amount: excessAmount,
            prId: data.id,
          });
          budgetIncreased = true;
          budgetIncreasePending = false;
          excessRequested = true;
        }
      }
    }

    const toStatus = nextStep ? statusForStep(nextStep.step_role as ApprovalStepRole) : "approved";
    await context.supabase
      .from("purchase_requisitions")
      .update({
        status: toStatus,
        current_step_role: nextStep ? nextStep.step_role : null,
        budget_increase_pending: budgetIncreasePending,
      })
      .eq("id", data.id);

    await context.supabase.from("pr_approval_history").insert({
      pr_id: data.id,
      step_id: currentStep.id,
      action: "approved",
      from_status: fromStatus,
      to_status: toStatus,
      actor_id: context.userId,
      comments: comments || null,
      metadata: {
        excess_requested: excessRequested,
        budget_increased: budgetIncreased,
        excess_amount: excessAmount,
      } as Json,
    });

    if (!nextStep) {
      const { data: approvedLines } = await context.supabase
        .from("pr_lines")
        .select("item_id, name, category, unit_price, preferred_vendor_id")
        .eq("pr_id", data.id);
      if (approvedLines?.length) {
        await context.supabase.from("proc_price_history").insert(
          approvedLines.map((l) => ({
            item_id: l.item_id,
            item_name: l.name,
            category: l.category,
            vendor_id: l.preferred_vendor_id,
            unit_price: l.unit_price,
            source: "pr_approved",
            source_id: data.id,
            recorded_by: context.userId,
          })),
        );
      }
    }

    await writePrAudit(context, {
      action: "pr.approve",
      entityType: "purchase_requisitions",
      entityId: data.id,
      prId: data.id,
      locationId: pr.location_id,
      after: { toStatus, budgetIncreased, budgetIncreasePending },
    });

    await notifyPurchaseRequisitionEvent({
      prId: data.id,
      prNumber: pr.pr_number,
      locationId: pr.location_id,
      requesterId: pr.requested_by,
      actorId: context.userId,
      justification: pr.justification,
      priority: pr.priority,
      kind: nextStep ? "next_approval" : "approved",
      nextStepRole: nextStep ? nextStep.step_role : null,
    });

    return { id: data.id, status: toStatus };
  },
  {
    auth: {
      anyCapability: [
        "procurement.approve_dept",
        "procurement.approve_gm",
        "procurement.approve_ceo",
        "procurement.finance",
        "procurement.create",
        "procurement.configure",
      ],
    },
  },
);

export const getProcurementConfig = createAuthenticatedActionNoInput(
  async (context) => {
    const { bands, settings } = await loadDoa(context);
    const { data: rows } = await context.supabase
      .from("pr_doa_matrix")
      .select(
        "id, band_code, label, min_amount, max_amount, require_dept_head, require_gm, require_ceo, require_finance, sort_order, active",
      )
      .order("sort_order");
    const department_budgets = await loadDepartmentBudgetOverview(context);
    return {
      department_budgets,
      bands: (rows ?? []).map((b) => ({
        id: b.id,
        band_code: b.band_code,
        label: b.label,
        min_amount: Number(b.min_amount),
        max_amount: b.max_amount == null ? null : Number(b.max_amount),
        require_dept_head: b.require_dept_head,
        require_gm: b.require_gm,
        require_ceo: b.require_ceo,
        require_finance: b.require_finance,
        sort_order: b.sort_order,
        active: b.active,
      })),
      settings,
    };
  },
  { auth: { capability: "procurement.view" } },
);

export const saveProcurementConfig = createAuthenticatedAction(
  z.object({
    bands: z.array(
      z.object({
        id: z.string().uuid(),
        min_amount: z.number().min(0),
        max_amount: z.number().min(0).nullable(),
        require_dept_head: z.boolean(),
        require_gm: z.boolean(),
        require_ceo: z.boolean(),
      }),
    ),
    settings: z.object({
      price_variance_pct_threshold: z.number().min(0).max(500),
      force_ceo_on_price_variance: z.boolean(),
      force_ceo_on_budget_exception: z.boolean(),
    }),
  }),
  async (data, context) => {
    for (const band of data.bands) {
      const { error } = await context.supabase
        .from("pr_doa_matrix")
        .update({
          min_amount: band.min_amount,
          max_amount: band.max_amount,
          require_dept_head: band.require_dept_head,
          require_gm: band.require_gm,
          require_ceo: band.require_ceo,
          require_finance: true,
          updated_by: context.userId,
        })
        .eq("id", band.id);
      if (error) throw error;
    }
    const { error } = await context.supabase
      .from("pr_doa_settings")
      .update({
        ...data.settings,
        finance_always_required: true,
        updated_by: context.userId,
      })
      .eq("id", 1);
    if (error) throw error;
    await writePrAudit(context, {
      action: "pr.config.update",
      entityType: "pr_doa_matrix",
      after: data,
    });
    return { ok: true };
  },
  { auth: { capability: "procurement.configure" } },
);

export const recordPrMilestone = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    action: z.enum(["clear", "pay"]),
    paid_amount: z.number().min(0).optional(),
    evidence_note: z.string().min(3).max(1000),
  }),
  async (data, context) => {
    const { data: milestone, error } = await context.supabase
      .from("pr_payment_milestones")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const { data: pr, error: prErr } = await context.supabase
      .from("purchase_requisitions")
      .select("id, status, requested_by, location_id, total_amount")
      .eq("id", milestone.pr_id)
      .single();
    if (prErr) throw prErr;
    await assertLocationAccess(context, pr.location_id);

    if (!["approved", "po_created"].includes(pr.status as string)) {
      throw new Error("Milestones can be cleared only after the PR is approved.");
    }

    const roles = (context.roles ?? []) as AppRole[];
    const allowed =
      pr.requested_by === context.userId ||
      canUserDo(roles, "procurement.finance") ||
      canUserDo(roles, "procurement.configure");
    if (!allowed) throw new ForbiddenError("You cannot record clearance on this PR.");

    if (data.action === "clear") {
      const { error: updErr } = await context.supabase
        .from("pr_payment_milestones")
        .update({
          status: "cleared",
          cleared_at: new Date().toISOString(),
          cleared_by: context.userId,
          evidence_note: data.evidence_note,
        })
        .eq("id", data.id);
      if (updErr) throw updErr;
    } else {
      const payAmt = roundMoney(data.paid_amount ?? Number(milestone.amount));
      if (payAmt > Number(milestone.amount) + 0.009) {
        throw new Error("Paid amount cannot exceed the approved milestone.");
      }
      const { data: siblings } = await context.supabase
        .from("pr_payment_milestones")
        .select("id, paid_amount")
        .eq("pr_id", pr.id);
      const alreadyPaid = (siblings ?? [])
        .filter((row) => row.id !== data.id)
        .reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);
      if (alreadyPaid + payAmt > Number(pr.total_amount) + 0.009) {
        throw new Error("Payments cannot exceed the approved request amount.");
      }
      const { error: updErr } = await context.supabase
        .from("pr_payment_milestones")
        .update({
          status: "paid",
          paid_amount: payAmt,
          paid_at: new Date().toISOString(),
          paid_by: context.userId,
          cleared_at: milestone.cleared_at ?? new Date().toISOString(),
          cleared_by: milestone.cleared_by ?? context.userId,
          evidence_note: data.evidence_note,
        })
        .eq("id", data.id);
      if (updErr) throw updErr;
    }

    await context.supabase.from("pr_approval_history").insert({
      pr_id: pr.id,
      action: data.action === "pay" ? "milestone_paid" : "milestone_cleared",
      from_status: pr.status,
      to_status: pr.status,
      actor_id: context.userId,
      comments: data.evidence_note,
      metadata: { milestone_id: data.id },
    });
    await writePrAudit(context, {
      action: data.action === "pay" ? "pr.milestone.pay" : "pr.milestone.clear",
      entityType: "pr_payment_milestones",
      entityId: data.id,
      prId: pr.id,
      locationId: pr.location_id,
      metadata: { evidence_note: data.evidence_note },
    });
    return { id: data.id, status: data.action === "pay" ? "paid" : "cleared" };
  },
  { auth: { capability: "procurement.view" } },
);

export const getPrAttachmentUrl = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: file, error } = await context.supabase
      .from("pr_attachments")
      .select("id, pr_id, file_path, file_name")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: pr, error: prErr } = await context.supabase
      .from("purchase_requisitions")
      .select("location_id")
      .eq("id", file.pr_id)
      .single();
    if (prErr) throw prErr;
    await assertLocationAccess(context, pr.location_id);
    const url = await signedPrAttachmentUrl(context, file.file_path as string);
    return { url, file_name: file.file_name as string };
  },
  { auth: { capability: "procurement.view" } },
);

export const getProcurementAnalytics = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      departmentId: z.string().uuid().nullable().optional(),
      vendorId: z.string().uuid().nullable().optional(),
      projectName: z.string().optional().nullable(),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, requested_at, submitted_at, required_by, department_id, location_id, vendor_id, title, project_name, purpose_category, justification, total_amount, status, over_budget, created_at",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(800);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.departmentId) q = q.eq("department_id", data.departmentId);
    if (data.from) q = q.gte("requested_at", data.from);
    if (data.to) q = q.lte("requested_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    let list = rows ?? [];

    const prIds = list.map((r) => r.id);
    const lineRows = await fetchInChunks(prIds, async (chunk) => {
      const { data: lines, error: lineErr } = await context.supabase
        .from("pr_lines")
        .select("pr_id, preferred_vendor_id, line_total")
        .in("pr_id", chunk);
      if (lineErr) throw lineErr;
      return lines ?? [];
    });
    const milestoneRows = await fetchInChunks(prIds, async (chunk) => {
      const { data: ms, error: msErr } = await context.supabase
        .from("pr_payment_milestones")
        .select("pr_id, amount, paid_amount, status")
        .in("pr_id", chunk);
      if (msErr) throw msErr;
      return ms ?? [];
    });

    const vendorByPr = new Map<string, string>();
    for (const row of list) {
      if (row.vendor_id) vendorByPr.set(row.id, row.vendor_id as string);
    }
    for (const line of lineRows) {
      if (!vendorByPr.has(line.pr_id) && line.preferred_vendor_id) {
        vendorByPr.set(line.pr_id, line.preferred_vendor_id as string);
      }
    }
    if (data.vendorId) {
      list = list.filter((r) => vendorByPr.get(r.id) === data.vendorId);
    }
    const projects = [
      ...new Set(list.map((r) => ((r.project_name as string | null) ?? "").trim()).filter(Boolean)),
    ].sort();
    if (data.projectName) {
      list = list.filter((r) => ((r.project_name as string | null) ?? "").trim() === data.projectName);
    }

    const deptIds = [...new Set(list.map((r) => r.department_id).filter(Boolean))] as string[];
    const vendorIds = [...new Set([...list.map((r) => vendorByPr.get(r.id)).filter(Boolean)])] as string[];
    const [{ data: depts }, { data: vendors }, { data: history }] = await Promise.all([
      deptIds.length
        ? resolveDepartmentNames(context, deptIds).then((map) => ({
            data: [...map.entries()].map(([id, name]) => ({ id, name })),
          }))
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      vendorIds.length
        ? context.supabase.from("vendors").select("id, name").in("id", vendorIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      prIds.length
        ? context.supabase
            .from("pr_approval_history")
            .select("pr_id, to_status, created_at")
            .in("pr_id", prIds)
            .eq("to_status", "approved")
        : Promise.resolve({ data: [] as { pr_id: string; to_status: string; created_at: string }[] }),
    ]);
    const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name]));
    const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v.name]));
    const approvedAt = new Map<string, string>();
    for (const row of history ?? []) {
      if (!approvedAt.has(row.pr_id)) approvedAt.set(row.pr_id, row.created_at);
    }

    const approved = list.filter((r) => r.status === "approved" || r.status === "po_created");
    const pending = list.filter((r) =>
      ["submitted", "dept_review", "gm_review", "ceo_review", "finance_review", "procurement_review"].includes(
        r.status as string,
      ),
    );
    const rejected = list.filter((r) => r.status === "rejected");
    const cycleDays = approved
      .map((r) => {
        const start = (r.submitted_at as string | null) ?? (r.created_at as string);
        const end = approvedAt.get(r.id);
        if (!start || !end) return null;
        return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
      })
      .filter((n): n is number => n != null);
    const avgCycle = cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;
    const closed = approved.length + rejected.length;
    const signoffRate = closed ? approved.length / closed : 0;
    const overBudget = list.filter((r) => Boolean(r.over_budget)).length;
    const budgetAdherence = list.length ? 1 - overBudget / list.length : 1;

    const paidByPr = new Map<string, number>();
    for (const row of milestoneRows) {
      paidByPr.set(row.pr_id, (paidByPr.get(row.pr_id) ?? 0) + Number(row.paid_amount ?? 0));
    }
    const approvedValue = approved.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const paidValue = approved.reduce((s, r) => s + (paidByPr.get(r.id) ?? 0), 0);
    const pendingValue = pending.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const forecastedLiability = pendingValue + Math.max(0, approvedValue - paidValue);
    const today = todayIso();
    const overdueValue = pending
      .filter((r) => Boolean(r.required_by) && String(r.required_by) < today)
      .reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

    const byDept = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    const byVendor = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    const byPurpose = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    for (const row of list) {
      const amount = Number(row.total_amount ?? 0);
      const deptId = (row.department_id as string | null) ?? null;
      const deptName = deptId ? (deptMap.get(deptId) ?? "Unassigned") : "Unassigned";
      addNamedAmount(byDept, deptId, deptName, amount);
      const vendorId = vendorByPr.get(row.id) ?? null;
      addNamedAmount(byVendor, vendorId, vendorId ? (vendorMap.get(vendorId) ?? "Vendor") : "No vendor", amount);
      const purpose = (row.purpose_category as string | null)?.trim() || "general";
      addNamedAmount(byPurpose, purpose, purpose, amount);
    }

    return {
      total: list.length,
      value: list.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      avgCycleDays: Math.round(avgCycle * 10) / 10,
      signoffRate,
      budgetAdherence,
      forecastedLiability,
      overdueValue,
      approvedValue,
      paidValue,
      pendingValue,
      savings: 0,
      projects,
      departments: topNamed(byDept, 8),
      vendors: topNamed(byVendor, 8),
      purposes: topNamed(byPurpose, 8),
    };
  },
  { defaultInput: {}, auth: { capability: "procurement.view" } },
);

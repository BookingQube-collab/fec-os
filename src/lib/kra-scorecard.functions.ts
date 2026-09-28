"use server";

import { z } from "zod";

import {
  KRA_CRITICAL_FROM_DB,
  KRA_CRITICAL_TO_DB,
  KRA_ROLE_FROM_DB,
  KRA_ROLE_TO_DB,
  KRA_STATUS_FROM_DB,
  KRA_STATUS_TO_DB,
  num,
  reviewHeader,
  weightedLine,
  type KraFrameworkItem,
  type KraReviewDetail,
  type KraReviewLine,
  type KraSiteSop,
  type KraTemplate,
  type KraTemplateItem,
} from "@/lib/kra-scorecard/model";
import { scoreReview, type KraCriticalStatus, type KraLineStatus, type KraRole } from "@/lib/kra-scorecard/score";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

const roleSchema = z.enum(["Cashier", "Attendant", "Dual Role", "Supervisor"]);
const lineStatusSchema = z.enum(["Pending", "Applicable", "N/A"]);
const criticalSchema = z.enum(["Pending", "Clear", "Review required"]);

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function myStaffId(context: AuthContext): Promise<string | null> {
  const { data } = await context.supabase
    .from("staff")
    .select("id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

function assertCanReadReview(context: AuthContext, staffId: string, ownStaffId: string | null) {
  if (staffId === ownStaffId) return;
  if (!canUserDo(context.roles ?? [], "performance.view")) {
    throw new ForbiddenError("You can only open your own KRA scorecard.");
  }
}

type ItemRow = {
  id: string;
  template_id: string;
  item_no: number;
  title: string;
  sop_reference: string;
  target_standard: string;
  weight_cashier: number | string;
  weight_attendant: number | string;
  weight_supervisor: number | string;
};

function mapItem(row: ItemRow): KraTemplateItem {
  return {
    id: row.id,
    itemNo: row.item_no,
    title: row.title,
    sopReference: row.sop_reference,
    targetStandard: row.target_standard,
    weightCashier: num(row.weight_cashier),
    weightAttendant: num(row.weight_attendant),
    weightSupervisor: num(row.weight_supervisor),
  };
}

async function loadTemplates(context: AuthContext): Promise<KraTemplate[]> {
  const { data: templates, error } = await context.supabase
    .from("kra_scorecard_templates")
    .select("id, code, brand, place_name, sheet_title, sop_label, baseline_note, usage_note, sort_order, location_id, active")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  const ids = (templates ?? []).map((row) => row.id as string);
  const { data: items, error: itemError } = ids.length
    ? await context.supabase
        .from("kra_scorecard_items")
        .select("id, template_id, item_no, title, sop_reference, target_standard, weight_cashier, weight_attendant, weight_supervisor")
        .in("template_id", ids)
        .order("item_no")
    : { data: [], error: null };
  if (itemError) throw itemError;
  const byTemplate = new Map<string, KraTemplateItem[]>();
  for (const row of (items ?? []) as ItemRow[]) {
    const list = byTemplate.get(row.template_id) ?? [];
    list.push(mapItem(row));
    byTemplate.set(row.template_id, list);
  }
  const sopsByTemplate = await loadSiteSops(context, ids);
  return (templates ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    brand: row.brand as string,
    placeName: row.place_name as string,
    sheetTitle: row.sheet_title as string,
    sopLabel: row.sop_label as string,
    baselineNote: row.baseline_note as string,
    usageNote: row.usage_note as string,
    sortOrder: row.sort_order as number,
    locationId: (row.location_id as string | null) ?? null,
    items: (byTemplate.get(row.id as string) ?? []).sort((a, b) => a.itemNo - b.itemNo),
    sops: sopsByTemplate.get(row.id as string) ?? [],
  }));
}

function sopRank(code: string): number {
  if (code === "MANUAL") return 0;
  const order = ["C", "A", "F", "R"];
  const index = order.indexOf(code[0] ?? "");
  return index === -1 ? 9 : index + 1;
}

async function loadSiteSops(context: AuthContext, templateIds: string[]): Promise<Map<string, KraSiteSop[]>> {
  const map = new Map<string, KraSiteSop[]>();
  if (!templateIds.length) return map;
  const { data, error } = await context.supabase
    .from("sop_documents")
    .select("id, title, sop_code, kra_template_id, file_name")
    .in("kra_template_id", templateIds);
  if (error) {
    if (tableMissing(error.message)) return map;
    throw error;
  }
  for (const row of data ?? []) {
    if (!row.kra_template_id || !row.sop_code) continue;
    const list = map.get(row.kra_template_id) ?? [];
    list.push({
      id: row.id,
      code: row.sop_code,
      title: row.title,
      fileName: row.file_name,
    });
    map.set(row.kra_template_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => sopRank(a.code) - sopRank(b.code) || a.code.localeCompare(b.code));
  }
  return map;
}

async function loadFramework(context: AuthContext): Promise<KraFrameworkItem[]> {
  const { data, error } = await context.supabase
    .from("kra_scorecard_framework_items")
    .select("id, role_category, sort_order, title, expected_standard, master_sheet_mapping, points, how_to_rate, evidence_to_keep")
    .order("role_category")
    .order("sort_order");
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    roleCategory: row.role_category as KraFrameworkItem["roleCategory"],
    sortOrder: row.sort_order as number,
    title: row.title as string,
    expectedStandard: row.expected_standard as string,
    masterSheetMapping: row.master_sheet_mapping as string,
    points: num(row.points),
    howToRate: row.how_to_rate as string,
    evidenceToKeep: row.evidence_to_keep as string,
  }));
}

type ReviewRow = {
  id: string;
  staff_id: string;
  template_id: string;
  review_period: string;
  reviewer_name: string;
  assigned_post: string;
  role_category: string;
  cashier_share: number | string;
  critical_status: string;
  critical_evidence: string;
  agreed_action: string;
  follow_up: string;
  employee_ack_note: string | null;
  employee_ack_at: string | null;
  reviewer_approval_note: string;
  reviewer_approved_at: string | null;
};

type LineRow = {
  id: string;
  review_id: string;
  item_id: string;
  line_status: string;
  actual_result: string;
  evidence: string;
  rating: number | null;
};

function buildDetail(
  review: ReviewRow,
  template: KraTemplate,
  lines: LineRow[],
  staff: { full_name: string; employee_code: string | null },
): KraReviewDetail {
  const role = KRA_ROLE_FROM_DB[review.role_category] ?? "Attendant";
  const cashierShare = num(review.cashier_share);
  const criticalStatus: KraCriticalStatus = KRA_CRITICAL_FROM_DB[review.critical_status] ?? "Pending";
  const lineByItem = new Map(lines.map((line) => [line.item_id, line]));
  const scoredInputs = template.items.map((item) => {
    const line = lineByItem.get(item.id);
    const status: KraLineStatus = KRA_STATUS_FROM_DB[line?.line_status ?? "pending"] ?? "Pending";
    return weightedLine(role, cashierShare, item, {
      status,
      rating: line?.rating ?? null,
      actualResult: line?.actual_result ?? "",
      evidence: line?.evidence ?? "",
    });
  });
  const scored = scoreReview(
    reviewHeader({
      employeeLinked: true,
      reviewPeriod: review.review_period,
      reviewerName: review.reviewer_name,
      assignedPost: review.assigned_post,
      role,
      cashierShare,
      criticalStatus,
    }),
    scoredInputs,
  );
  const detailLines: KraReviewLine[] = template.items.map((item, index) => {
    const line = lineByItem.get(item.id);
    const input = scoredInputs[index]!;
    const result = scored.lines[index]!;
    return {
      id: line?.id ?? item.id,
      itemId: item.id,
      itemNo: item.itemNo,
      title: item.title,
      sopReference: item.sopReference,
      targetStandard: item.targetStandard,
      weightCashier: item.weightCashier,
      weightAttendant: item.weightAttendant,
      weightSupervisor: item.weightSupervisor,
      ...input,
      rowCheck: result.rowCheck,
      points: result.points,
    };
  });
  return {
    id: review.id,
    staffId: review.staff_id,
    staffName: staff.full_name,
    employeeCode: staff.employee_code,
    templateId: template.id,
    templateCode: template.code,
    brand: template.brand,
    placeName: template.placeName,
    baselineNote: template.baselineNote,
    reviewPeriod: review.review_period,
    reviewerName: review.reviewer_name,
    assignedPost: review.assigned_post,
    role,
    cashierShare,
    criticalStatus,
    criticalEvidence: review.critical_evidence,
    agreedAction: review.agreed_action,
    followUp: review.follow_up,
    employeeAckNote: review.employee_ack_note,
    employeeAckAt: review.employee_ack_at,
    reviewerApprovalNote: review.reviewer_approval_note,
    reviewerApprovedAt: review.reviewer_approved_at,
    readiness: scored.readiness,
    score: scored.score,
    classification: scored.classification,
    lines: detailLines,
    sops: template.sops,
  };
}

async function loadReview(context: AuthContext, reviewId: string): Promise<KraReviewDetail> {
  const { data: review, error } = await context.supabase
    .from("kra_scorecard_reviews")
    .select("id, staff_id, template_id, review_period, reviewer_name, assigned_post, role_category, cashier_share, critical_status, critical_evidence, agreed_action, follow_up, employee_ack_note, employee_ack_at, reviewer_approval_note, reviewer_approved_at")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new Error("KRA scorecard not found.");
  const ownStaffId = await myStaffId(context);
  assertCanReadReview(context, review.staff_id as string, ownStaffId);
  const templates = await loadTemplates(context);
  const template = templates.find((row) => row.id === review.template_id);
  if (!template) throw new Error("KRA site template is missing.");
  const { data: lines, error: lineError } = await context.supabase
    .from("kra_scorecard_lines")
    .select("id, review_id, item_id, line_status, actual_result, evidence, rating")
    .eq("review_id", reviewId);
  if (lineError) throw lineError;
  const { data: staff, error: staffError } = await context.supabase
    .from("staff")
    .select("full_name, employee_code")
    .eq("id", review.staff_id as string)
    .maybeSingle();
  if (staffError) throw staffError;
  return buildDetail(
    review as ReviewRow,
    template,
    (lines ?? []) as LineRow[],
    {
      full_name: (staff?.full_name as string | undefined) ?? "Employee",
      employee_code: (staff?.employee_code as string | null | undefined) ?? null,
    },
  );
}

export const listKraScorecards = createAuthenticatedActionNoInput(async (context) => {
  const templates = await loadTemplates(context);
  const framework = await loadFramework(context);
  const { data: reviews, error } = await context.supabase
    .from("kra_scorecard_reviews")
    .select("id, staff_id, template_id, review_period, reviewer_name, assigned_post, role_category, cashier_share, critical_status, critical_evidence, agreed_action, follow_up, employee_ack_note, employee_ack_at, reviewer_approval_note, reviewer_approved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (tableMissing(error.message)) {
      return { templates, framework, reviews: [] as KraReviewDetail[] };
    }
    throw error;
  }
  const reviewRows = (reviews ?? []) as ReviewRow[];
  const reviewIds = reviewRows.map((row) => row.id);
  const staffIds = [...new Set(reviewRows.map((row) => row.staff_id))];
  const [{ data: lines, error: lineError }, { data: staffRows, error: staffError }] = await Promise.all([
    reviewIds.length
      ? context.supabase
          .from("kra_scorecard_lines")
          .select("id, review_id, item_id, line_status, actual_result, evidence, rating")
          .in("review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length
      ? context.supabase.from("staff").select("id, full_name, employee_code, location_id").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineError) throw lineError;
  if (staffError) throw staffError;
  const staffById = new Map(
    (staffRows ?? []).map((row) => [
      row.id as string,
      {
        full_name: row.full_name as string,
        employee_code: (row.employee_code as string | null) ?? null,
      },
    ]),
  );
  const linesByReview = new Map<string, LineRow[]>();
  for (const line of (lines ?? []) as LineRow[]) {
    const list = linesByReview.get(line.review_id) ?? [];
    list.push(line);
    linesByReview.set(line.review_id, list);
  }
  const templateById = new Map(templates.map((row) => [row.id, row]));
  const detailed = reviewRows.flatMap((row) => {
    const template = templateById.get(row.template_id);
    if (!template) return [];
    return [
      buildDetail(
        row,
        template,
        linesByReview.get(row.id) ?? [],
        staffById.get(row.staff_id) ?? { full_name: "Employee", employee_code: null },
      ),
    ];
  });
  return { templates, framework, reviews: detailed };
}, { auth: { capability: "performance.view" } });

export const listKraStaffOptions = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, job_title")
    .in("status", ["active", "on_leave", "serving_notice"])
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  const locationIds = [...new Set((data ?? []).map((row) => row.location_id).filter(Boolean))] as string[];
  const { data: locations, error: locError } = locationIds.length
    ? await context.supabase.from("locations").select("id, code").in("id", locationIds)
    : { data: [], error: null };
  if (locError) throw locError;
  const codeById = new Map((locations ?? []).map((row) => [row.id as string, row.code as string]));
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.full_name as string,
    employeeCode: (row.employee_code as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    locationCode: codeById.get(row.location_id as string) ?? null,
  }));
}, { auth: { capability: "performance.assign" } });

export const assignKraScorecard = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    templateId: z.string().uuid(),
    reviewPeriod: z.string().trim().min(1).max(80),
    reviewerName: z.string().trim().min(1).max(120),
    assignedPost: z.string().trim().min(1).max(120),
    role: roleSchema,
    cashierShare: z.number().min(0).max(1).optional(),
  }),
  async (input, context) => {
    const share = input.role === "Dual Role" ? (input.cashierShare ?? 0.5) : 0.5;
    const { data: review, error } = await context.supabase
      .from("kra_scorecard_reviews")
      .insert({
        staff_id: input.staffId,
        template_id: input.templateId,
        review_period: input.reviewPeriod,
        reviewer_name: input.reviewerName,
        assigned_post: input.assignedPost,
        role_category: KRA_ROLE_TO_DB[input.role],
        cashier_share: share,
        critical_status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("This employee already has a scorecard for that site and period.");
      }
      throw error;
    }
    const { data: items, error: itemError } = await context.supabase
      .from("kra_scorecard_items")
      .select("id")
      .eq("template_id", input.templateId);
    if (itemError) throw itemError;
    if ((items ?? []).length) {
      const { error: lineError } = await context.supabase.from("kra_scorecard_lines").insert(
        (items ?? []).map((item) => ({
          review_id: review.id as string,
          item_id: item.id as string,
          line_status: "pending",
        })),
      );
      if (lineError) throw lineError;
    }
    return { id: review.id as string };
  },
  { auth: { capability: "performance.assign" } },
);

export const getKraScorecard = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (input, context) => loadReview(context, input.id),
  { auth: { anyCapability: ["performance.view", "hr.employee_app"] } },
);

export const saveKraScorecard = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    reviewPeriod: z.string().trim().min(1).max(80),
    reviewerName: z.string().trim().min(1).max(120),
    assignedPost: z.string().trim().min(1).max(120),
    role: roleSchema,
    cashierShare: z.number().min(0).max(1),
    criticalStatus: criticalSchema,
    criticalEvidence: z.string().max(4000),
    agreedAction: z.string().max(4000),
    followUp: z.string().max(4000),
    reviewerApprovalNote: z.string().max(2000),
    markReviewerApproved: z.boolean(),
    lines: z.array(
      z.object({
        id: z.string().uuid(),
        status: lineStatusSchema,
        actualResult: z.string().max(2000),
        evidence: z.string().max(2000),
        rating: z.number().int().min(1).max(5).nullable(),
      }),
    ),
  }),
  async (input, context) => {
    const { error } = await context.supabase
      .from("kra_scorecard_reviews")
      .update({
        review_period: input.reviewPeriod,
        reviewer_name: input.reviewerName,
        assigned_post: input.assignedPost,
        role_category: KRA_ROLE_TO_DB[input.role as KraRole],
        cashier_share: input.cashierShare,
        critical_status: KRA_CRITICAL_TO_DB[input.criticalStatus],
        critical_evidence: input.criticalEvidence,
        agreed_action: input.agreedAction,
        follow_up: input.followUp,
        reviewer_approval_note: input.reviewerApprovalNote,
        reviewer_approved_at: input.markReviewerApproved ? new Date().toISOString() : null,
      })
      .eq("id", input.id);
    if (error) throw error;
    for (const line of input.lines) {
      const { error: lineError } = await context.supabase
        .from("kra_scorecard_lines")
        .update({
          line_status: KRA_STATUS_TO_DB[line.status],
          actual_result: line.actualResult,
          evidence: line.evidence,
          rating: line.status === "N/A" ? null : line.rating,
        })
        .eq("id", line.id)
        .eq("review_id", input.id);
      if (lineError) throw lineError;
    }
    return loadReview(context, input.id);
  },
  { auth: { capability: "performance.evaluate" } },
);

export const updateKraStandard = createAuthenticatedAction(
  z.object({
    itemId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    sopReference: z.string().max(200),
    targetStandard: z.string().max(2000),
    weightCashier: z.number().min(0).max(100),
    weightAttendant: z.number().min(0).max(100),
    weightSupervisor: z.number().min(0).max(100),
  }),
  async (input, context) => {
    const { error } = await context.supabase
      .from("kra_scorecard_items")
      .update({
        title: input.title,
        sop_reference: input.sopReference,
        target_standard: input.targetStandard,
        weight_cashier: input.weightCashier,
        weight_attendant: input.weightAttendant,
        weight_supervisor: input.weightSupervisor,
      })
      .eq("id", input.itemId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "performance.manage_templates" } },
);

export const listMyKraScorecards = createAuthenticatedActionNoInput(async (context) => {
  const staffId = await myStaffId(context);
  if (!staffId) return [] as KraReviewDetail[];
  const { data: reviews, error } = await context.supabase
    .from("kra_scorecard_reviews")
    .select("id")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false });
  if (error) {
    if (tableMissing(error.message)) return [] as KraReviewDetail[];
    throw error;
  }
  const details: KraReviewDetail[] = [];
  for (const row of reviews ?? []) {
    details.push(await loadReview(context, row.id as string));
  }
  return details;
}, { auth: { capability: "hr.employee_app" } });

export const getKraSiteSop = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (input, context) => {
    const { data, error } = await context.supabase
      .from("sop_documents")
      .select("id, code, title, sop_code, file_name")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("SOP not found.");
    const { data: sections, error: sectionError } = await context.supabase
      .from("sop_sections")
      .select("id, sort_order, heading, content")
      .eq("document_id", input.id)
      .order("sort_order");
    if (sectionError) throw sectionError;
    return {
      id: data.id,
      code: data.sop_code ?? data.code,
      title: data.title,
      fileName: data.file_name,
      sections: (sections ?? []).map((section) => ({
        id: section.id,
        heading: section.heading,
        content: section.content,
      })),
    };
  },
  { auth: { anyCapability: ["performance.view", "hr.employee_app", "sop.view"] } },
);

export const getKraSiteSopFile = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (input, context) => {
    const { data, error } = await context.supabase
      .from("sop_documents")
      .select("file_path, file_name")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.file_path) throw new Error("This SOP has no file.");
    const signed = await context.supabase.storage.from("sop-documents").createSignedUrl(data.file_path, 600);
    if (signed.error) throw signed.error;
    return { url: signed.data.signedUrl, fileName: data.file_name };
  },
  { auth: { anyCapability: ["performance.view", "hr.employee_app", "sop.view"] } },
);

export const acknowledgeMyKraScorecard = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  }),
  async (input, context) => {
    const staffId = await myStaffId(context);
    if (!staffId) throw new ForbiddenError("This login is not linked to a staff record.");
    const { error } = await context.supabase
      .from("kra_scorecard_reviews")
      .update({
        employee_ack_note: input.note?.trim() ? input.note.trim() : "Acknowledged",
        employee_ack_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("staff_id", staffId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "hr.employee_app" } },
);

"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { HR_CHECKLIST_KINDS } from "@/lib/hr-advanced";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const listChecklistTemplates = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("hr_checklist_templates")
    .select("id, kind, title, active, sort_order, hr_checklist_template_items(id, title, sort_order)")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((t) => {
    const rawItems = t.hr_checklist_template_items;
    const items = Array.isArray(rawItems)
      ? (rawItems as Array<{ id: string; title: string; sort_order: number }>)
      : [];
    return {
      id: t.id as string,
      kind: t.kind as string,
      title: t.title as string,
      items: items
        .slice()
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((i) => ({ id: String(i.id), title: String(i.title), sortOrder: Number(i.sort_order) })),
    };
  });
}, { auth: { capability: "hr.manage" } });

export const listStaffChecklists = createAuthenticatedAction(
  z.object({
    kind: z.enum(HR_CHECKLIST_KINDS).optional(),
    status: z.enum(["open", "completed", "cancelled"]).optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("hr_staff_checklists")
      .select(
        "id, staff_id, kind, status, started_at, completed_at, staff(full_name, employee_code), hr_staff_checklist_items(id, title, status, sort_order, completed_at)",
      )
      .order("started_at", { ascending: false })
      .limit(100);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((row) => {
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      const rawItems = row.hr_staff_checklist_items;
      const items = Array.isArray(rawItems)
        ? (rawItems as Array<{ id: string; title: string; status: string; sort_order: number; completed_at: string | null }>)
        : [];
      return {
        id: row.id as string,
        staffId: row.staff_id as string,
        staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
        employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
        kind: row.kind as string,
        status: row.status as string,
        startedAt: String(row.started_at),
        completedAt: row.completed_at ? String(row.completed_at) : null,
        items: items
          .slice()
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
          .map((i) => ({
            id: String(i.id),
            title: String(i.title),
            status: String(i.status),
            completedAt: i.completed_at ? String(i.completed_at) : null,
          })),
      };
    });
  },
  { auth: { capability: "hr.manage" } },
);

export const startStaffChecklist = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    templateId: z.string().uuid(),
  }),
  async (data, context) => {
    const { data: template, error: tErr } = await context.supabase
      .from("hr_checklist_templates")
      .select("id, kind, title, hr_checklist_template_items(title, sort_order)")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template) throw new Error("Template not found.");

    const { data: checklist, error } = await context.supabase
      .from("hr_staff_checklists")
      .insert({
        staff_id: data.staffId,
        template_id: template.id,
        kind: template.kind,
        status: "open",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const items = Array.isArray(template.hr_checklist_template_items)
      ? (template.hr_checklist_template_items as Array<{ title: string; sort_order: number }>)
      : [];
    if (items.length) {
      const { error: itemErr } = await context.supabase.from("hr_staff_checklist_items").insert(
        items.map((i) => ({
          checklist_id: checklist.id,
          title: i.title,
          sort_order: i.sort_order,
          status: "pending",
        })),
      );
      if (itemErr) throw itemErr;
    }
    return { id: checklist.id as string };
  },
  { auth: { capability: "hr.manage" } },
);

export const updateChecklistItem = createAuthenticatedAction(
  z.object({
    itemId: z.string().uuid(),
    status: z.enum(["pending", "done", "skipped"]),
  }),
  async (data, context) => {
    const { data: item, error: readErr } = await context.supabase
      .from("hr_staff_checklist_items")
      .select("id, checklist_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!item) throw new Error("Item not found.");

    const { error } = await context.supabase
      .from("hr_staff_checklist_items")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
        completed_by: data.status === "done" ? context.userId : null,
      })
      .eq("id", data.itemId);
    if (error) throw error;

    const { data: siblings } = await context.supabase
      .from("hr_staff_checklist_items")
      .select("status")
      .eq("checklist_id", item.checklist_id);
    const allDone = (siblings ?? []).every((s) => s.status === "done" || s.status === "skipped");
    if (allDone) {
      await context.supabase
        .from("hr_staff_checklists")
        .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", item.checklist_id);
    }
    return { ok: true, checklistCompleted: allDone };
  },
  { auth: { capability: "hr.manage" } },
);

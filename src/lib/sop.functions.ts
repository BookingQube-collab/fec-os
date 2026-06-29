"use server";

import { z } from "zod";

import type { AppRole } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

export interface SopDocumentRow {
  id: string;
  code: string;
  title: string;
  category: string;
  department: string | null;
  status: string;
  mandatory_ack: boolean;
  effective_date: string | null;
  review_date: string | null;
  current_version: number;
  ack_pct?: number;
  overdue_count?: number;
}

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    status: z.string().max(50).nullable().optional(),
  })
  .default({});

export const listSopDocuments = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("sop_documents")
      .select("id, code, title, category, department, status, mandatory_ack, effective_date, review_date, current_version")
      .order("category")
      .order("title");
    if (data.locationId) q = q.or(`location_id.eq.${data.locationId},location_id.is.null`);
    if (data.category) q = q.eq("category", data.category);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as SopDocumentRow[];
  },
  { defaultInput: {}, auth: { capability: "sop.view" } },
);

export const getSopDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("sop_documents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const [{ data: sections }, { data: versions }] = await Promise.all([
      context.supabase
        .from("sop_sections")
        .select("id, sort_order, heading, content, version")
        .eq("document_id", data.id)
        .order("sort_order"),
      context.supabase
        .from("sop_versions")
        .select("version, change_summary, published_at")
        .eq("document_id", data.id)
        .order("version", { ascending: false }),
    ]);
    return { ...doc, sop_sections: sections ?? [], sop_versions: versions ?? [] };
  },
  { auth: { capability: "sop.view" } },
);

export const getSopComplianceSummary = createAuthenticatedActionNoInput(
  async (context) => {
    const { data: docs } = await context.supabase
      .from("sop_documents")
      .select("id, title, mandatory_ack")
      .eq("status", "published")
      .eq("mandatory_ack", true);

    const { data: acks } = await context.supabase
      .from("sop_acknowledgments")
      .select("document_id, status, due_date, user_id");

    const docIds = (docs ?? []).map((d) => d.id);
    const totalRequired = docIds.length;
    const acknowledged = (acks ?? []).filter((a) => a.status === "acknowledged").length;
    const overdue = (acks ?? []).filter(
      (a) => a.status !== "acknowledged" && a.due_date && a.due_date < new Date().toISOString().slice(0, 10),
    ).length;
    const pending = (acks ?? []).filter((a) => a.status === "pending").length;

    return {
      total_documents: totalRequired,
      acknowledged,
      pending,
      overdue,
      compliance_pct: totalRequired > 0 ? Math.round((acknowledged / Math.max(acks?.length ?? 1, 1)) * 100) : 100,
    };
  },
  { auth: { capability: "sop.view" } },
);

export const acknowledgeSop = createAuthenticatedAction(
  z.object({ documentId: z.string().uuid(), version: z.number().int().positive() }),
  async (data, context) => {
    const { error } = await context.supabase.from("sop_acknowledgments").upsert(
      {
        document_id: data.documentId,
        user_id: context.userId,
        version: data.version,
        status: "acknowledged",
        read_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "document_id,user_id,version" },
    );
    if (error) throw error;

    await context.supabase.rpc("log_audit", {
      _action: "sop.acknowledged",
      _table_name: "sop_acknowledgments",
      _row_id: data.documentId,
      _after: { version: data.version },
      _metadata: {},
    });

    return { ok: true };
  },
  { auth: { capability: "sop.acknowledge" } },
);

export const createSopDocument = createAuthenticatedAction(
  z.object({
    code: z.string().min(1).max(50),
    title: z.string().min(1).max(200),
    category: z.string().min(1).max(100),
    department: z.string().max(100).optional(),
    locationId: z.string().uuid().optional(),
    targetRole: z.string().max(50).optional(),
    mandatoryAck: z.boolean().default(true),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    content: z.string().min(1).max(10000),
  }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("sop_documents")
      .insert({
        code: data.code,
        title: data.title,
        category: data.category,
        department: data.department ?? null,
        location_id: data.locationId ?? null,
        target_role: (data.targetRole as AppRole | undefined) ?? null,
        mandatory_ack: data.mandatoryAck,
        effective_date: data.effectiveDate ?? null,
        review_date: data.reviewDate ?? null,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await context.supabase.from("sop_sections").insert({
      document_id: doc.id,
      version: 1,
      sort_order: 1,
      heading: "Procedure",
      content: data.content,
    });

    return doc;
  },
  { auth: { capability: "sop.manage" } },
);

export const publishSopDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), changeSummary: z.string().max(500).optional() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("sop_documents")
      .select("current_version")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;

    const newVersion = (existing?.current_version ?? 0) + 1;

    const { error } = await context.supabase
      .from("sop_documents")
      .update({ status: "published", current_version: newVersion })
      .eq("id", data.id);
    if (error) throw error;

    await context.supabase.from("sop_versions").insert({
      document_id: data.id,
      version: newVersion,
      change_summary: data.changeSummary ?? `Published version ${newVersion}`,
      published_by: context.userId,
    });

    return { ok: true, version: newVersion };
  },
  { auth: { capability: "sop.manage" } },
);

export const listMySopAcknowledgments = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("sop_acknowledgments")
      .select("*, sop_documents(code, title, category, current_version)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "sop.acknowledge" } },
);

export const exportSopComplianceCsv = createAuthenticatedActionNoInput(
  async (context) => {
    const { data: docs, error: dErr } = await context.supabase
      .from("sop_documents")
      .select("id, code, title, category, status, current_version")
      .eq("status", "published")
      .order("code");
    if (dErr) throw dErr;

    const docIds = (docs ?? []).map((d) => d.id);
    const { data: acks } = docIds.length
      ? await context.supabase
          .from("sop_acknowledgments")
          .select("document_id, user_id, acknowledged_at, status")
          .in("document_id", docIds)
      : { data: [] };

    const ackByDoc = new Map<string, number>();
    for (const ack of acks ?? []) {
      ackByDoc.set(ack.document_id, (ackByDoc.get(ack.document_id) ?? 0) + 1);
    }

    const header = "code,title,category,version,acknowledgment_count";
    const lines = (docs ?? []).map(
      (d) =>
        `"${d.code}","${d.title.replace(/"/g, '""')}","${d.category ?? ""}",${d.current_version},${ackByDoc.get(d.id) ?? 0}`,
    );

    return {
      filename: `sop-compliance-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: [header, ...lines].join("\n"),
    };
  },
  { auth: { capability: "sop.manage" } },
);

import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";
import { fetchDocumentExpiryKpis } from "@/lib/queries/expiry-alerts.core";

export interface ExecutiveComplianceKpiPayload {
  due_30: number;
  due_60: number;
  expired: number;
  compliance_health_pct: number;
  doc_expired: number;
  doc_due_7: number;
  doc_due_30: number;
  doc_due_60: number;
}

interface ComplianceKpisRpc {
  total?: number;
  expired?: number;
  due_30?: number;
  due_60?: number;
  doc_expired?: number;
  doc_due_7?: number;
  doc_due_30?: number;
  doc_due_60?: number;
}

function buildPayload(
  total: number,
  expired: number,
  due30: number,
  due60: number,
  docExpiry: { expired: number; due_7: number; due_30: number; due_60: number },
): ExecutiveComplianceKpiPayload {
  const healthPct = total > 0 ? Math.round(((total - expired - due30) / total) * 100) : 100;
  return {
    due_30: due30,
    due_60: due60,
    expired,
    compliance_health_pct: healthPct,
    doc_expired: docExpiry.expired,
    doc_due_7: docExpiry.due_7,
    doc_due_30: docExpiry.due_30,
    doc_due_60: docExpiry.due_60,
  };
}

/** Lightweight compliance summary — RPC first, parallel count fallback. */
export async function fetchExecutiveComplianceKpis(
  context: AuthContext,
  locationId?: string | null,
): Promise<ExecutiveComplianceKpiPayload> {
  const timer = createTimer("fetchExecutiveComplianceKpis", "get_compliance_kpis");

  const rpcResult = await context.supabase.rpc("get_compliance_kpis", {
    p_location_id: locationId ?? null,
  });

  if (!rpcResult.error && rpcResult.data && typeof rpcResult.data === "object") {
    const raw = rpcResult.data as ComplianceKpisRpc;
    const total = Number(raw.total ?? 0);
    const expired = Number(raw.expired ?? 0);
    const due30 = Number(raw.due_30 ?? 0);
    const due60 = Number(raw.due_60 ?? 0);
    const hasDocFields =
      raw.doc_expired != null &&
      raw.doc_due_7 != null &&
      raw.doc_due_30 != null &&
      raw.doc_due_60 != null;

    if (hasDocFields) {
      timer.end({ rowCount: total });
      return buildPayload(total, expired, due30, due60, {
        expired: Number(raw.doc_expired),
        due_7: Number(raw.doc_due_7),
        due_30: Number(raw.doc_due_30),
        due_60: Number(raw.doc_due_60),
      });
    }
  }

  if (rpcResult.error) {
    console.warn("[compliance-kpis] RPC get_compliance_kpis failed:", rpcResult.error.message);
  }

  const base = context.supabase.from("compliance_items_enriched").select("id", {
    count: "exact",
    head: true,
  });

  const [totalRes, expiredRes, due30Res, due60Res, docExpiry] = await Promise.all([
    base,
    context.supabase
      .from("compliance_items_enriched")
      .select("id", { count: "exact", head: true })
      .eq("alert_tier", "Expired"),
    context.supabase
      .from("compliance_items_enriched")
      .select("id", { count: "exact", head: true })
      .eq("alert_tier", "Due ≤30"),
    context.supabase
      .from("compliance_items_enriched")
      .select("id", { count: "exact", head: true })
      .eq("alert_tier", "Due ≤60"),
    fetchDocumentExpiryKpis(context, locationId),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (expiredRes.error) throw expiredRes.error;
  if (due30Res.error) throw due30Res.error;
  if (due60Res.error) throw due60Res.error;

  const total = totalRes.count ?? 0;
  timer.end({ rowCount: total });
  return buildPayload(
    total,
    expiredRes.count ?? 0,
    due30Res.count ?? 0,
    due60Res.count ?? 0,
    docExpiry,
  );
}

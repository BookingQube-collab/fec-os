import { CLOSED_TASK_STATUSES, type TaskStatus } from "@/lib/events/constants";
import { WORKSTREAM_MERGES, WORKSTREAM_RENAMES } from "@/lib/events/lifecycle";

export const STANDARD_WORKSTREAMS = [
  { code: "operations", sort_order: 1, title_en: "Operations", title_ar: "العمليات" },
  { code: "project_management", sort_order: 2, title_en: "Project management", title_ar: "إدارة المشاريع" },
  { code: "creative_branding", sort_order: 3, title_en: "Creative and branding", title_ar: "الإبداع والهوية" },
  { code: "production_technical", sort_order: 4, title_en: "Production and technical", title_ar: "الإنتاج والتقنية" },
  { code: "it_pos", sort_order: 5, title_en: "IT and POS", title_ar: "تقنية المعلومات ونقاط البيع" },
  { code: "procurement_finance", sort_order: 6, title_en: "Procurement and finance", title_ar: "المشتريات والمالية" },
  { code: "logistics_warehouse", sort_order: 7, title_en: "Logistics and warehouse", title_ar: "اللوجستيات والمستودع" },
  { code: "hr_staffing", sort_order: 8, title_en: "HR and staffing", title_ar: "الموارد البشرية والتوظيف" },
  { code: "marketing", sort_order: 9, title_en: "Marketing", title_ar: "التسويق" },
  { code: "mall_venue", sort_order: 10, title_en: "Mall or venue management", title_ar: "إدارة المجمع أو المكان" },
  { code: "vendors_contractors", sort_order: 11, title_en: "Vendors and contractors", title_ar: "الموردون والمقاولون" },
  { code: "health_safety", sort_order: 12, title_en: "Health and safety", title_ar: "الصحة والسلامة" },
  { code: "maintenance", sort_order: 13, title_en: "Maintenance", title_ar: "الصيانة" },
] as const;

export type WorkstreamCode = (typeof STANDARD_WORKSTREAMS)[number]["code"];
export type WorkstreamDeptStatus = "not_started" | "on_track" | "delayed" | "blocked";

export function workstreamTitle(code: string | null | undefined, locale: "en" | "ar" = "en"): string {
  const canon = canonicalWorkstreamCode(code) ?? code;
  const ws = STANDARD_WORKSTREAMS.find((w) => w.code === canon);
  if (!ws) return code ?? "";
  return locale === "ar" ? ws.title_ar : ws.title_en;
}

export function canonicalWorkstreamCode(code: string | null | undefined): WorkstreamCode | null {
  if (!code) return null;
  if (STANDARD_WORKSTREAMS.some((w) => w.code === code)) return code as WorkstreamCode;
  const renamed = WORKSTREAM_RENAMES[code];
  if (renamed && STANDARD_WORKSTREAMS.some((w) => w.code === renamed)) return renamed as WorkstreamCode;
  const merged = WORKSTREAM_MERGES[code];
  if (merged && STANDARD_WORKSTREAMS.some((w) => w.code === merged)) return merged as WorkstreamCode;
  return null;
}

export interface WorkstreamTaskInput {
  status: TaskStatus | string;
  due_date?: string | null;
  percent_complete?: number | null;
  is_critical?: boolean | null;
  priority?: string | null;
}

export interface WorkstreamRollup {
  code: WorkstreamCode;
  title_en: string;
  title_ar: string;
  wbs_id: string | null;
  status: WorkstreamDeptStatus;
  pct: number;
  taskCount: number;
  overdue: number;
  blocked: number;
}

export function overallTaskProgress(tasks: Array<{ status: string; percent_complete?: number | null }>): number {
  const open = tasks.filter((t) => t.status !== "cancelled");
  if (!open.length) return 0;
  return Math.round(open.reduce((s, t) => s + Number(t.percent_complete ?? 0), 0) / open.length);
}

export function workstreamDeptStatus(
  tasks: WorkstreamTaskInput[],
  today = new Date().toISOString().slice(0, 10),
): { status: WorkstreamDeptStatus; pct: number; overdue: number; blocked: number } {
  const open = tasks.filter((t) => !CLOSED_TASK_STATUSES.has(t.status as TaskStatus));
  const pct = overallTaskProgress(tasks);
  const blocked = open.filter((t) => t.status === "blocked").length;
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  if (blocked > 0) return { status: "blocked", pct, overdue, blocked };
  if (overdue > 0) return { status: "delayed", pct, overdue, blocked };
  if (open.length === 0 || open.every((t) => t.status === "not_started" || t.status === "planned")) {
    return { status: "not_started", pct, overdue, blocked };
  }
  return { status: "on_track", pct, overdue, blocked };
}

export function rollupWorkstreams(
  nodes: Array<{ id: string; code?: string | null; title?: string | null }>,
  tasks: Array<WorkstreamTaskInput & { wbs_id?: string | null }>,
  descendantIdsByNode: Map<string, Set<string>>,
  today?: string,
): WorkstreamRollup[] {
  return STANDARD_WORKSTREAMS.map((ws) => {
    const node =
      nodes.find((n) => n.code === ws.code) ??
      nodes.find((n) => canonicalWorkstreamCode(n.code) === ws.code) ??
      null;
    const ids = node ? (descendantIdsByNode.get(node.id) ?? new Set([node.id])) : new Set<string>();
    if (node) ids.add(node.id);
    const linked = node ? tasks.filter((t) => t.wbs_id && ids.has(t.wbs_id)) : [];
    const roll = workstreamDeptStatus(linked, today);
    return {
      code: ws.code,
      title_en: ws.title_en,
      title_ar: ws.title_ar,
      wbs_id: node?.id ?? null,
      status: roll.status,
      pct: roll.pct,
      taskCount: linked.filter((t) => t.status !== "cancelled").length,
      overdue: roll.overdue,
      blocked: roll.blocked,
    };
  });
}

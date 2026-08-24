import { CLOSED_TASK_STATUSES, PENDING_PR_STATUSES } from "@/lib/events/constants";
import { missingDepartmentBoqs, missingRequiredByType } from "@/lib/events/documents";
import { workstreamTitle } from "@/lib/events/workstreams";
import type { EventOverview, EventScopeSection, EventTaskRow } from "@/lib/events/types";

export type EventPlanSignalTask = {
  title: string;
  due_date?: string | null;
  owner_name?: string | null;
  workstream?: string | null;
};

export type EventPlanSignalPr = {
  pr_number: string | null;
  title?: string | null;
  status: string;
  overdue?: boolean;
};

export type EventPlanSignalDoc = {
  kind: "boq" | "permit";
  title?: string | null;
};

export type EventPlanSignals = {
  overdue_tasks: EventPlanSignalTask[];
  pending_prs: EventPlanSignalPr[];
  missing_docs: EventPlanSignalDoc[];
  blocked_tasks: EventPlanSignalTask[];
  unassigned_open_tasks: number;
};

export const WORKSPACE_SCOPE_KEYS = ["inclusions", "exclusions", "assumptions", "success"] as const;
export type WorkspaceScopeKey = (typeof WORKSPACE_SCOPE_KEYS)[number];

const DELIVERABLE_PACKS: Array<{ match: RegExp; titles: string[] }> = [
  {
    match: /night\s*market|souq|bazaar|سوق/i,
    titles: [
      "Stall layout and vendor mix approved",
      "Night-trading / QCDD NOC in hand",
      "Power and lighting plan signed",
      "Cash / POS kit list confirmed",
      "Opening-night roster locked",
    ],
  },
  {
    match: /mall|activation|launch|افتتاح|مول/i,
    titles: [
      "Mall operations pack submitted",
      "Branded entrance and wayfinding signed off",
      "Demo / activation run-of-show",
      "Guest flow and queue plan",
      "Opening approval from mall FM",
    ],
  },
  {
    match: /festival|fair|carnival|مهرجان/i,
    titles: [
      "Site plan and crowd capacities",
      "Entertainment / show schedule",
      "HSE and medical cover confirmed",
      "Ticketing or wristband process",
      "Strike and waste plan",
    ],
  },
  {
    match: /corporate|conference|gala| ramadan|رمضان/i,
    titles: [
      "Client run-of-show approved",
      "AV / LED plot confirmed",
      "Catering guarantee numbers",
      "VIP / protocol list",
      "Rehearsal complete",
    ],
  },
];

const DEFAULT_DELIVERABLES = [
  "Approved scope and success criteria",
  "Approved project budget",
  "BOQ uploaded",
  "Required permits in hand",
  "Go-live / opening approval",
];

export function suggestDeliverablesForType(typeLabel?: string | null, typeCode?: string | null): string[] {
  const hay = `${typeLabel ?? ""} ${typeCode ?? ""}`.trim();
  const pack = DELIVERABLE_PACKS.find((row) => hay && row.match.test(hay));
  return pack?.titles ?? DEFAULT_DELIVERABLES;
}

export function workspaceScopeFromDraft(sections: EventScopeSection[] | null | undefined): EventScopeSection[] {
  const byKey = new Map((sections ?? []).map((row) => [row.key, row]));
  const success = byKey.get("success")?.body?.trim() || byKey.get("objectives")?.body?.trim() || "";
  return WORKSPACE_SCOPE_KEYS.map((key) => ({
    key,
    title: key,
    body: key === "success" ? success : (byKey.get(key)?.body ?? ""),
  }));
}

export function collectEventPlanSignals(input: {
  overview?: Pick<EventOverview, "linkedPrs" | "documents" | "workstreams"> | null;
  tasks?: EventTaskRow[] | null;
  today?: string;
}): EventPlanSignals {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const tasks = input.tasks ?? [];
  const open = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status));
  const overdue = open
    .filter((task) => task.due_date && task.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const blocked = open.filter((task) => task.status === "blocked");
  const prs = (input.overview?.linkedPrs ?? []).filter((pr) => PENDING_PR_STATUSES.has(pr.status));
  const docs = input.overview?.documents;
  const missingBoq = missingDepartmentBoqs(docs, input.overview?.workstreams);
  const missingDocs: EventPlanSignalDoc[] = [
    ...(missingBoq.length
      ? missingBoq.map((group) => ({ kind: "boq" as const, title: group.title_en }))
      : missingRequiredByType(docs, "boq").map((doc) => ({
          kind: "boq" as const,
          title: workstreamTitle(doc.workstream_code) || doc.title,
        }))),
    ...missingRequiredByType(docs, "permit").map((doc) => ({ kind: "permit" as const, title: doc.title })),
  ];

  return {
    overdue_tasks: overdue.slice(0, 8).map((task) => ({
      title: task.title,
      due_date: task.due_date,
      owner_name: task.owner_name ?? task.assignee_name,
      workstream: task.workstream_title ?? task.workstream_code,
    })),
    pending_prs: prs.slice(0, 8).map((pr) => ({
      pr_number: pr.pr_number,
      title: pr.title ?? null,
      status: pr.status,
      overdue: Boolean(pr.overdue),
    })),
    missing_docs: missingDocs.slice(0, 8),
    blocked_tasks: blocked.slice(0, 6).map((task) => ({
      title: task.title,
      due_date: task.due_date,
      owner_name: task.owner_name ?? task.assignee_name,
      workstream: task.workstream_title ?? task.workstream_code,
    })),
    unassigned_open_tasks: open.filter((task) => !task.owner_staff_id && !task.assignee_staff_id).length,
  };
}

export function overdueClustersByWorkstream(
  tasks: EventTaskRow[],
  today = new Date().toISOString().slice(0, 10),
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const task of tasks) {
    if (CLOSED_TASK_STATUSES.has(task.status)) continue;
    if (!task.due_date || task.due_date >= today) continue;
    const key = task.workstream_title || task.workstream_code || "other";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export function nextActionsFromSignals(signals?: EventPlanSignals | null): string[] {
  if (!signals) return [];
  const out: string[] = [];
  for (const task of signals.overdue_tasks.slice(0, 3)) {
    const due = task.due_date ? ` (due ${task.due_date})` : "";
    const owner = task.owner_name ? ` — ${task.owner_name}` : " — assign an owner";
    out.push(`Close overdue task “${task.title}”${due}${owner}.`);
  }
  for (const pr of signals.pending_prs.slice(0, 2)) {
    const ref = pr.pr_number || "linked PR";
    const title = pr.title ? `: ${pr.title}` : "";
    out.push(`Chase ${ref} (${pr.status})${pr.overdue ? " — overdue" : ""}${title}.`);
  }
  for (const doc of signals.missing_docs.slice(0, 2)) {
    const label = doc.kind === "boq" ? "BOQ" : "permit";
    out.push(`Upload the missing ${label}${doc.title ? ` (${doc.title})` : ""}.`);
  }
  for (const task of signals.blocked_tasks.slice(0, 2)) {
    out.push(`Unblock “${task.title}”.`);
  }
  if (signals.unassigned_open_tasks > 0) {
    out.push(`Assign owners to ${signals.unassigned_open_tasks} open task(s) with no owner.`);
  }
  if (!out.length) {
    out.push("No overdue tasks, pending PRs, or missing BOQ/permits in the current records.");
  }
  return out.slice(0, 8);
}

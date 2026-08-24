"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_APPROVAL_STATUSES, TASK_ESCALATION_LEVELS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/events/constants";
import { LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import type { EventChecklistItem, EventTaskRow, EventWbsNode } from "@/lib/events/types";

type StaffOpt = { id: string; full_name: string };
type DeptOpt = { id: string; name: string };

export type TaskDraft = {
  title: string;
  description: string;
  wbs_id: string;
  parent_task_id: string;
  owner_staff_id: string;
  assignee_staff_id: string;
  department_id: string;
  priority: string;
  status: string;
  start_date: string;
  due_date: string;
  percent_complete: number;
  duration_days: string;
  estimated_hours: string;
  actual_hours: string;
  estimated_cost: string;
  actual_cost: string;
  is_milestone: boolean;
  is_critical: boolean;
  checklist: EventChecklistItem[];
  documents: Array<{ title: string; url: string }>;
  supporter_ids: string[];
  approval_status: string;
  delay_reason: string;
  escalation_level: string;
  cost_impact: string;
  evidence_url: string;
  is_snag: boolean;
  lifecycle_phase: string;
};

const emptyDraft = (): TaskDraft => ({
  title: "",
  description: "",
  wbs_id: "",
  parent_task_id: "",
  owner_staff_id: "",
  assignee_staff_id: "",
  department_id: "",
  priority: "normal",
  status: "not_started",
  start_date: "",
  due_date: "",
  percent_complete: 0,
  duration_days: "",
  estimated_hours: "",
  actual_hours: "",
  estimated_cost: "",
  actual_cost: "",
  is_milestone: false,
  is_critical: false,
  checklist: [],
  documents: [],
  supporter_ids: [],
  approval_status: "not_required",
  delay_reason: "",
  escalation_level: "none",
  cost_impact: "",
  evidence_url: "",
  is_snag: false,
  lifecycle_phase: "",
});

function fromTask(task: EventTaskRow): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    wbs_id: task.wbs_id ?? "",
    parent_task_id: task.parent_task_id ?? "",
    owner_staff_id: task.owner_staff_id ?? "",
    assignee_staff_id: task.assignee_staff_id ?? "",
    department_id: task.department_id ?? "",
    priority: task.priority,
    status: task.status,
    start_date: task.start_date ?? "",
    due_date: task.due_date ?? "",
    percent_complete: task.percent_complete,
    duration_days: task.duration_days != null ? String(task.duration_days) : "",
    estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : "",
    actual_hours: task.actual_hours != null ? String(task.actual_hours) : "",
    estimated_cost: task.estimated_cost != null ? String(task.estimated_cost) : "",
    actual_cost: task.actual_cost != null ? String(task.actual_cost) : "",
    is_milestone: task.is_milestone,
    is_critical: task.is_critical,
    checklist: task.checklist,
    documents: task.documents,
    supporter_ids: task.supporter_ids ?? [],
    approval_status: task.approval_status ?? "not_required",
    delay_reason: task.delay_reason ?? "",
    escalation_level: task.escalation_level ?? "none",
    cost_impact: task.cost_impact != null ? String(task.cost_impact) : "",
    evidence_url: task.evidence_url ?? "",
    is_snag: task.is_snag ?? false,
    lifecycle_phase: task.lifecycle_phase ?? "",
  };
}

export function EventTaskDialog({
  open,
  task,
  wbs,
  tasks,
  staff,
  departments,
  pending,
  onOpenChange,
  onSave,
  onComment,
}: {
  open: boolean;
  task: EventTaskRow | null;
  wbs: EventWbsNode[];
  tasks: EventTaskRow[];
  staff: StaffOpt[];
  departments: DeptOpt[];
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: TaskDraft) => void;
  onComment?: (body: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft());
  const [checkTitle, setCheckTitle] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    setDraft(task ? fromTask(task) : emptyDraft());
    setCheckTitle("");
    setDocTitle("");
    setDocUrl("");
    setComment("");
  }, [task, open]);

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((s) => ({ ...s, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {task ? task.task_number ?? t("events.plan.editTask") : t("events.plan.addTask")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs md:col-span-2">
            <Label>{t("events.plan.task")}</Label>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs md:col-span-2">
            <Label>{t("events.fields.description")}</Label>
            <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.wbs")}</Label>
            <Select value={draft.wbs_id || "none"} onValueChange={(v) => set("wbs_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {wbs.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {"· ".repeat(node.depth)}
                    {node.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.parentTask")}</Label>
            <Select value={draft.parent_task_id || "none"} onValueChange={(v) => set("parent_task_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {tasks.filter((row) => row.id !== task?.id).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.task_number ? `${row.task_number} ` : ""}
                    {row.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.owner")}</Label>
            <Select value={draft.owner_staff_id || "none"} onValueChange={(v) => set("owner_staff_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.assignee")}</Label>
            <Select value={draft.assignee_staff_id || "none"} onValueChange={(v) => set("assignee_staff_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.lifecycle")}</Label>
            <Select value={draft.lifecycle_phase || "none"} onValueChange={(v) => set("lifecycle_phase", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {LIFECYCLE_PHASES.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{t(`events.phase.${p.code}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.fields.department")}</Label>
            <Select value={draft.department_id || "none"} onValueChange={(v) => set("department_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.priority")}</Label>
            <Select value={draft.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`events.priority.${p}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.status")}</Label>
            <Select value={draft.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.taskStatus.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.start")}</Label>
            <Input type="date" value={draft.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.due")}</Label>
            <Input type="date" value={draft.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.duration")}</Label>
            <Input type="number" value={draft.duration_days} onChange={(e) => set("duration_days", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.progress")}</Label>
            <Input type="number" min={0} max={100} value={draft.percent_complete} onChange={(e) => set("percent_complete", Number(e.target.value || 0))} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.estHours")}</Label>
            <Input type="number" value={draft.estimated_hours} onChange={(e) => set("estimated_hours", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.actHours")}</Label>
            <Input type="number" value={draft.actual_hours} onChange={(e) => set("actual_hours", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.estCost")}</Label>
            <Input type="number" value={draft.estimated_cost} onChange={(e) => set("estimated_cost", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.actCost")}</Label>
            <Input type="number" value={draft.actual_cost} onChange={(e) => set("actual_cost", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.costImpact")}</Label>
            <Input type="number" value={draft.cost_impact} onChange={(e) => set("cost_impact", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.approvalStatus")}</Label>
            <Select value={draft.approval_status} onValueChange={(v) => set("approval_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_APPROVAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.taskApproval.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs">
            <Label>{t("events.plan.escalation")}</Label>
            <Select value={draft.escalation_level} onValueChange={(v) => set("escalation_level", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_ESCALATION_LEVELS.map((s) => <SelectItem key={s} value={s}>{t(`events.escalation.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs md:col-span-2">
            <Label>{t("events.plan.delayReason")}</Label>
            <Input value={draft.delay_reason} onChange={(e) => set("delay_reason", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs md:col-span-2">
            <Label>{t("events.plan.evidence")}</Label>
            <Input value={draft.evidence_url} onChange={(e) => set("evidence_url", e.target.value)} placeholder={t("events.plan.docUrl")} />
          </label>
          <label className="space-y-1 text-xs md:col-span-2">
            <Label>{t("events.plan.supporters")}</Label>
            <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border/40 p-2">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.supporter_ids.includes(s.id)}
                    onChange={(e) =>
                      set(
                        "supporter_ids",
                        e.target.checked
                          ? [...draft.supporter_ids, s.id]
                          : draft.supporter_ids.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.full_name}
                </label>
              ))}
            </div>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.is_milestone} onChange={(e) => set("is_milestone", e.target.checked)} />
            {t("events.plan.milestoneFlag")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.is_critical} onChange={(e) => set("is_critical", e.target.checked)} />
            {t("events.plan.criticalFlag")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.is_snag} onChange={(e) => set("is_snag", e.target.checked)} />
            {t("events.overview.snag")}
          </label>
        </div>

        <div className="space-y-2">
          <Label>{t("events.plan.checklist")}</Label>
          <ul className="space-y-1 text-sm">
            {draft.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) =>
                    set("checklist", draft.checklist.map((c) => (c.id === item.id ? { ...c, done: e.target.checked } : c)))
                  }
                />
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.title}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input value={checkTitle} onChange={(e) => setCheckTitle(e.target.value)} placeholder={t("events.plan.checkItem")} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!checkTitle.trim()}
              onClick={() => {
                set("checklist", [...draft.checklist, { id: crypto.randomUUID(), title: checkTitle.trim(), done: false }]);
                setCheckTitle("");
              }}
            >
              {t("events.plan.addCheck")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("events.plan.documents")}</Label>
          <ul className="space-y-1 text-sm">
            {draft.documents.map((doc, i) => (
              <li key={`${doc.url}-${i}`}>
                <a href={doc.url} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                  {doc.title || doc.url}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Input className="w-40" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder={t("events.plan.docTitle")} />
            <Input className="w-56" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder={t("events.plan.docUrl")} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!docUrl.trim()}
              onClick={() => {
                set("documents", [...draft.documents, { title: docTitle.trim() || docUrl.trim(), url: docUrl.trim() }]);
                setDocTitle("");
                setDocUrl("");
              }}
            >
              {t("events.plan.addDoc")}
            </Button>
          </div>
        </div>

        {task ? (
          <div className="space-y-2">
            <Label>{t("events.plan.comments")}</Label>
            <ul className="space-y-1 text-sm">
              {task.comments.map((row) => (
                <li key={row.id}>
                  <span className="text-muted-foreground">{row.author_name ?? "—"} · {row.created_at.slice(0, 10)}: </span>
                  {row.body}
                </li>
              ))}
            </ul>
            {onComment ? (
              <div className="flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("events.plan.comment")} />
                <Button type="button" size="sm" variant="outline" disabled={!comment.trim()} onClick={() => { onComment(comment.trim()); setComment(""); }}>
                  {t("events.plan.addComment")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={!draft.title.trim() || pending} onClick={() => onSave(draft)}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

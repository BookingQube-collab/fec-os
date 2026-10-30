"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RISK_SEVERITIES, RISK_STATUSES } from "@/lib/events/constants";
import type { EventOverview, EventRiskRow } from "@/lib/events/types";
import {
  applyEventPlanTemplate,
  deleteEventPlanTemplate,
  deleteEventRisk,
  deleteEventTeamMember,
  escalateEventRisk,
  listEventAuditLogs,
  listEventPlanTemplates,
  saveEventAsPlanTemplate,
  softDeleteEvent,
  upsertEventPlanTemplate,
  upsertEventRisk,
  upsertEventTeamMember,
} from "@/lib/events.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export function EventRisksPanel({
  eventId,
  risks,
  canEdit,
  onChanged,
  staff = [],
  escalations = [],
}: {
  eventId: string;
  risks: EventRiskRow[];
  canEdit: boolean;
  onChanged: () => void;
  staff?: Array<{ id: string; full_name: string }>;
  escalations?: EventOverview["escalations"];
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<(typeof RISK_SEVERITIES)[number]>("medium");
  const [status, setStatus] = useState<(typeof RISK_STATUSES)[number]>("open");
  const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [mitigation, setMitigation] = useState("");
  const [likelihood, setLikelihood] = useState<(typeof RISK_SEVERITIES)[number]>("medium");
  const [impact, setImpact] = useState<(typeof RISK_SEVERITIES)[number]>("medium");
  const [editing, setEditing] = useState<EventRiskRow | null>(null);

  const reset = () => {
    setTitle("");
    setSeverity("medium");
    setStatus("open");
    setDue("");
    setOwnerId("");
    setMitigation("");
    setLikelihood("medium");
    setImpact("medium");
    setEditing(null);
  };

  const loadEdit = (risk: EventRiskRow) => {
    setEditing(risk);
    setTitle(risk.title);
    setSeverity(risk.severity);
    setStatus(risk.status);
    setDue(risk.due_date ?? "");
    setOwnerId(risk.owner_staff_id ?? "");
    setMitigation(risk.mitigation ?? "");
    setLikelihood(risk.likelihood ?? risk.severity);
    setImpact(risk.impact ?? risk.severity);
  };

  const overdueEsc = (escalations ?? []).filter((e) => e.kind === "risk" || e.kind === "gate" || e.kind === "task");

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.risks")}</h2>
      {overdueEsc.length > 0 ? (
        <div className="mb-3 rounded-xl border border-rag-amber/40 bg-rag-amber/10 p-2 text-xs">
          <p className="mb-1 font-semibold">{t("events.overview.escalations")}</p>
          <ul className="space-y-1">
            {overdueEsc.slice(0, 5).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {t(`events.escalationKind.${item.kind}`, { defaultValue: item.kind })} · {item.title}
                </span>
                {item.overdue ? <Badge variant="destructive">{t("events.ops.overdue")}</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {risks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noRisks")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {risks.map((risk) => (
            <li key={risk.id} className="rounded-lg border border-border/30 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{risk.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {risk.owner_name ? `${risk.owner_name} · ` : ""}
                    {risk.due_date ?? t("events.overview.noDue")}
                    {risk.mitigation ? ` · ${risk.mitigation}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <Badge variant={risk.matrix_band === "critical" || risk.matrix_band === "high" ? "destructive" : "outline"}>
                    {t("events.overview.matrix")}: {t(`events.risk.${risk.matrix_band ?? risk.severity}`)}
                  </Badge>
                  <Badge variant={risk.severity === "critical" || risk.severity === "high" ? "destructive" : "outline"}>
                    {t(`events.risk.${risk.severity}`)} · {t(`events.risk.${risk.status}`)}
                  </Badge>
                  {risk.escalation_level && risk.escalation_level !== "none" ? (
                    <Badge variant="warning">{t(`events.escalation.${risk.escalation_level}`)}</Badge>
                  ) : null}
                </span>
              </div>
              {canEdit ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => loadEdit(risk)}>
                    {t("common.edit")}
                  </Button>
                  {risk.status !== "closed" ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await upsertEventRisk({
                              id: risk.id,
                              eventId,
                              title: risk.title,
                              severity: risk.severity,
                              status: "closed",
                              due_date: risk.due_date,
                              owner_staff_id: risk.owner_staff_id,
                              mitigation: risk.mitigation,
                              likelihood: risk.likelihood,
                              impact: risk.impact,
                            });
                            onChanged();
                            toast.success(t("events.toasts.riskSaved"));
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        {t("events.overview.closeRisk")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await escalateEventRisk({ id: risk.id });
                            onChanged();
                            toast.success(t("events.toasts.riskEscalated"));
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        {t("events.overview.escalateRisk")}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await deleteEventRisk({ id: risk.id });
                        onChanged();
                        toast.success(t("events.toasts.riskDeleted"));
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={editing ? t("events.overview.editRisk") : t("events.overview.riskTitle")}
          />
          <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
            <SelectTrigger><SelectValue placeholder={t("events.overview.severity")} /></SelectTrigger>
            <SelectContent>
              {RISK_SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>{t(`events.risk.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={likelihood} onValueChange={(v) => setLikelihood(v as typeof likelihood)}>
            <SelectTrigger><SelectValue placeholder={t("events.overview.likelihood")} /></SelectTrigger>
            <SelectContent>
              {RISK_SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>{t("events.overview.likelihood")}: {t(`events.risk.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={impact} onValueChange={(v) => setImpact(v as typeof impact)}>
            <SelectTrigger><SelectValue placeholder={t("events.overview.impact")} /></SelectTrigger>
            <SelectContent>
              {RISK_SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>{t("events.overview.impact")}: {t(`events.risk.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RISK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`events.risk.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerId || "none"} onValueChange={(v) => setOwnerId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("events.plan.owner")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("events.plan.owner")}</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Textarea
            className="md:col-span-2 min-h-16"
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
            placeholder={t("events.overview.mitigation")}
          />
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button
              size="sm"
              disabled={!title.trim()}
              onClick={async () => {
                try {
                  await upsertEventRisk({
                    id: editing?.id,
                    eventId,
                    title,
                    severity,
                    status,
                    due_date: due || null,
                    owner_staff_id: ownerId || null,
                    mitigation: mitigation || null,
                    likelihood,
                    impact,
                  });
                  reset();
                  onChanged();
                  toast.success(t("events.toasts.riskSaved"));
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {editing ? t("common.save") : t("events.overview.addRisk")}
            </Button>
            {editing ? (
              <Button size="sm" variant="ghost" onClick={reset}>{t("common.cancel")}</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function EventTeamPanel({
  eventId,
  team,
  staff,
  canEdit,
  onChanged,
}: {
  eventId: string;
  team: EventOverview["team"];
  staff: Array<{ id: string; full_name: string }>;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("Team");
  const [isPm, setIsPm] = useState(false);
  const available = useMemo(() => {
    const taken = new Set(team.map((m) => m.staff_id));
    return staff.filter((s) => !taken.has(s.id));
  }, [staff, team]);

  return (
    <section id="event-staff" className="scroll-mt-24 rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.overview.team")}</h2>
      {team.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noTeam")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {team.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2">
              <span>
                {member.full_name}
                <span className="ms-2 text-xs text-muted-foreground">{member.role_label}</span>
                {member.is_pm ? <Badge variant="outline" className="ms-2">{t("events.overview.pmBadge")}</Badge> : null}
              </span>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  {!member.is_pm ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await upsertEventTeamMember({
                            id: member.id,
                            eventId,
                            staff_id: member.staff_id,
                            role_label: member.role_label,
                            is_pm: true,
                          });
                          onChanged();
                          toast.success(t("events.toasts.teamSaved"));
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      {t("events.overview.makePm")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await deleteEventTeamMember({ id: member.id });
                        onChanged();
                        toast.success(t("events.toasts.teamRemoved"));
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("events.overview.selectStaff")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("events.overview.roleLabel")} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isPm} onChange={(e) => setIsPm(e.target.checked)} />
            {t("events.overview.makePm")}
          </label>
          <Button
            size="sm"
            disabled={!staffId}
            onClick={async () => {
              try {
                await upsertEventTeamMember({
                  eventId,
                  staff_id: staffId,
                  role_label: role.trim() || "Team",
                  is_pm: isPm,
                });
                setStaffId("");
                setRole("Team");
                setIsPm(false);
                onChanged();
                toast.success(t("events.toasts.teamSaved"));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {t("events.overview.addTeamMember")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function EventActivityPanel({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);
  const audit = useQuery({
    queryKey: [...queryKeys.events.detail(eventId), "audit", action, entityType, page],
    queryFn: () =>
      listEventAuditLogs({
        eventId,
        action: action === "all" ? null : action,
        entityType: entityType === "all" ? null : entityType,
        page,
        pageSize: 25,
      }),
  });
  const rows = audit.data?.rows ?? [];
  const total = audit.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("events.overview.activity")}</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("events.filters.all")}</SelectItem>
              {[
                "create",
                "update",
                "stage_change",
                "stage_gate_blocked",
                "budget_save",
                "budget_submit",
                "budget_approve",
                "budget_reject",
                "budget_lock",
                "budget_reopen",
                "go_live_approve",
                "go_live_clear",
                "risk_create",
                "risk_update",
                "risk_escalate",
                "issue_create",
                "issue_update",
                "team_add",
                "task_create",
                "template_apply",
                "archive",
                "restore",
              ].map((a) => (
                <SelectItem key={a} value={a}>{t(`events.audit.${a}`, { defaultValue: a })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("events.filters.all")}</SelectItem>
              {["event", "budget", "event_risk", "event_issue", "event_team_member", "event_task", "evt_plan_template"].map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.overview.noActivity")}</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-xs text-muted-foreground">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border/30 px-2 py-1.5">
              <span className="tabular-nums text-foreground">
                {row.created_at.slice(0, 16).replace("T", " ")}
              </span>
              {" · "}
              {t(`events.audit.${row.action}`, { defaultValue: row.action })}
              {" · "}
              {row.entity_type}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("events.overview.activityPage", { page, pages, total })}</p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.prev")}
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t("common.next")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function EventPlanTemplatesPanel({
  eventId,
  canManage,
  canEdit,
  onChanged,
}: {
  eventId: string;
  canManage: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: [...queryKeys.events.all, "templates"],
    queryFn: () => listEventPlanTemplates({}),
  });
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.events.all, "templates"] });
    onChanged();
  };

  const saveMut = useMutation({
    mutationFn: () => saveEventAsPlanTemplate({ eventId, name: name.trim() || "Plan template" }),
    onSuccess: () => {
      setName("");
      invalidate();
      toast.success(t("events.toasts.templateSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const applyMut = useMutation({
    mutationFn: () =>
      applyEventPlanTemplate({ eventId, templateId: selected, applyTasks: true, applyReadiness: true }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.templateApplied"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("events.plan.templates")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("events.plan.templatesHint")}</p>
      <ul className="mb-3 space-y-1 text-sm">
        {(templates.data ?? []).length === 0 ? (
          <li className="text-muted-foreground">{t("events.plan.noTemplates")}</li>
        ) : (
          (templates.data ?? []).map((tpl) => (
            <li
              key={tpl.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border border-border/30 px-2 py-1.5",
                selected === tpl.id && "border-primary/40 bg-primary/5",
              )}
            >
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setSelected(tpl.id)}>
                <span className="font-medium">{tpl.name}</span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {t("events.plan.templateItems", { n: tpl.item_count })}
                </span>
              </button>
              {canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await deleteEventPlanTemplate({ id: tpl.id });
                      if (selected === tpl.id) setSelected("");
                      invalidate();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  {t("common.delete")}
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button size="sm" disabled={!selected || applyMut.isPending} onClick={() => applyMut.mutate()}>
            {applyMut.isPending ? t("common.saving") : t("events.plan.applyTemplate")}
          </Button>
        ) : null}
        {canManage ? (
          <>
            <Input
              className="w-48"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("events.plan.templateName")}
            />
            <Button size="sm" variant="outline" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? t("common.saving") : t("events.plan.saveAsTemplate")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await upsertEventPlanTemplate({
                    name: name.trim() || "Blank template",
                    description: null,
                    items: [],
                  });
                  setName("");
                  invalidate();
                  toast.success(t("events.toasts.templateSaved"));
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {t("events.plan.newBlankTemplate")}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function EventArchiveControls({
  eventId,
  canManage,
  onArchived,
}: {
  eventId: string;
  canManage: boolean;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  if (!canManage) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        if (!window.confirm(t("events.overview.archiveConfirm"))) return;
        try {
          await softDeleteEvent({ eventId });
          toast.success(t("events.toasts.archived"));
          onArchived();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      {t("events.overview.archive")}
    </Button>
  );
}

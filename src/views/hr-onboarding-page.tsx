"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { FecLoader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXIT_CAUSES, JOURNEY_SECTIONS, OWNER_ROLES, sectionsFor } from "@/lib/hr-journeys";
import {
  createJourneyTemplate,
  listJourneyHub,
  saveApprovalRule,
  saveJourneyTemplateItem,
  setApprovalRuleActive,
  setJourneyTemplateActive,
  startJourney,
} from "@/lib/hr-journeys.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const selectClass = "flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";
const journeyKey = [...queryKeys.people.all, "hr-checklists"] as const;
const pageSize = 8;

function journeyError(t: (key: string, options?: { defaultValue?: string }) => string, error: Error) {
  if (error.message.startsWith("journey:")) {
    return t(`hr.journeys.errors.${error.message.slice("journey:".length)}`, { defaultValue: error.message });
  }
  return error.message;
}

export default function HrOnboardingPage() {
  const { t } = useTranslation();
  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.onboarding.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <Hub />
    </CapabilityGate>
  );
}

function Hub() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const initialKind = params.get("kind") === "offboarding" ? "offboarding" : "onboarding";
  const [surface, setSurface] = useState<"tasks" | "workflows">("tasks");
  const [queue, setQueue] = useState<"mine" | "open">("mine");
  const [kind, setKind] = useState<"onboarding" | "offboarding" | "all">(initialKind);
  const [status, setStatus] = useState<"open" | "completed" | "cancelled" | "all">("open");
  const [page, setPage] = useState(0);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({
    kind: initialKind as "onboarding" | "offboarding",
    staffId: "",
    templateId: "",
    ownerStaffId: "",
    managerStaffId: "",
    anchorDate: "",
    roleTitle: "",
    departmentName: "",
    exitCause: "resignation" as (typeof EXIT_CAUSES)[number],
    noticeDays: "30",
    reasonNote: "",
  });
  const [templateForm, setTemplateForm] = useState({
    kind: "onboarding" as "onboarding" | "offboarding",
    title: "",
    description: "",
    templateId: "",
    itemTitle: "",
    section: "preboarding",
    ownerRole: "hr" as (typeof OWNER_ROLES)[number],
    dueOffsetDays: "0",
    required: true,
    needsReview: false,
  });
  const [ruleForm, setRuleForm] = useState({
    kind: "onboarding" as "onboarding" | "offboarding",
    title: "",
    approverRole: "hr" as (typeof OWNER_ROLES)[number],
    required: true,
  });

  const hub = useQuery({
    queryKey: queryKeys.people.hrChecklists({ kind, status, queue }),
    queryFn: () => listJourneyHub({ kind, status, queue }),
    staleTime: STALE.people,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: journeyKey });
  const onError = (error: Error) => toast.error(journeyError(t, error));

  const start = useMutation({
    mutationFn: startJourney,
    onSuccess: (result) => {
      toast.success(t("hr.journeys.started"));
      void invalidate();
      router.push(`/people/hr/onboarding/${result.id}`);
    },
    onError,
  });
  const addTemplate = useMutation({
    mutationFn: createJourneyTemplate,
    onSuccess: () => {
      toast.success(t("hr.journeys.templateSaved"));
      setTemplateForm((current) => ({ ...current, title: "", description: "" }));
      void invalidate();
    },
    onError,
  });
  const addItem = useMutation({
    mutationFn: saveJourneyTemplateItem,
    onSuccess: () => {
      toast.success(t("hr.journeys.templateSaved"));
      setTemplateForm((current) => ({ ...current, itemTitle: "" }));
      void invalidate();
    },
    onError,
  });
  const toggleTemplate = useMutation({ mutationFn: setJourneyTemplateActive, onSuccess: () => void invalidate(), onError });
  const addRule = useMutation({
    mutationFn: saveApprovalRule,
    onSuccess: () => {
      toast.success(t("hr.journeys.ruleSaved"));
      setRuleForm((current) => ({ ...current, title: "" }));
      void invalidate();
    },
    onError,
  });
  const toggleRule = useMutation({ mutationFn: setApprovalRuleActive, onSuccess: () => void invalidate(), onError });

  const people = hub.data?.people ?? [];
  const personOptions = people.map((person) => {
    const name = person.name.trim();
    const code = person.employeeCode?.trim() ?? "";
    const label = name && code ? `${name} (${code})` : name || code;
    return {
      value: person.id,
      label,
      keywords: `${name} ${code} ${person.jobTitle ?? ""}`,
    };
  });
  const templates = (hub.data?.templates ?? []).filter((template) => template.active && template.kind === form.kind);
  const taskRows = hub.data?.tasks ?? [];
  const visibleTasks = taskRows.slice(page * pageSize, page * pageSize + pageSize);
  const workflowRows = useMemo(() => hub.data?.journeys ?? [], [hub.data?.journeys]);

  function applyStaff(staffId: string) {
    const person = people.find((row) => row.id === staffId);
    setForm((current) => ({
      ...current,
      staffId,
      roleTitle: person?.jobTitle ?? current.roleTitle,
      departmentName: person?.department ?? current.departmentName,
      managerStaffId: person?.managerStaffId && person.managerStaffId !== staffId ? person.managerStaffId : current.managerStaffId,
      anchorDate: current.kind === "onboarding" && person?.hireDate ? person.hireDate : current.anchorDate,
    }));
  }

  return (
    <HrShell>
      <HrSection
        icon={ClipboardList}
        kicker={t("hr.journeys.kicker")}
        title={t("hr.journeys.title")}
        subtitle={t("hr.journeys.subtitle")}
        actions={
          <Button onClick={() => setStarting((open) => !open)}>{t("hr.journeys.start")}</Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          <Link href="/people/hr" className="underline-offset-4 hover:underline">
            {t("nav.hrAdminPeople")}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{t("nav.onboardingOffboarding")}</span>
        </p>
        {hub.isLoading ? <FecLoader label={t("common.loading")} /> : null}
        {hub.isError ? (
          <HrPanel>
            <HrEmptyState message={journeyError(t, hub.error as Error)} />
          </HrPanel>
        ) : null}

        {starting ? (
          <HrPanel className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.journeyType")}</span>
                <select
                  className={selectClass}
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value as "onboarding" | "offboarding",
                      templateId: "",
                    }))
                  }
                >
                  <option value="onboarding">{t("hr.journeys.kinds.onboarding")}</option>
                  <option value="offboarding">{t("hr.journeys.kinds.offboarding")}</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.employee")}</span>
                <SearchableSelect
                  value={form.staffId}
                  onValueChange={applyStaff}
                  placeholder={t("hr.journeys.pickEmployee")}
                  emptyOption={{ value: "", label: t("hr.journeys.pickEmployee") }}
                  options={personOptions}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.template")}</span>
                <select
                  className={selectClass}
                  value={form.templateId}
                  onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}
                >
                  <option value="">{t("hr.journeys.pickTemplate")}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{form.kind === "offboarding" ? t("hr.journeys.lastWorkingDay") : t("hr.journeys.startDate")}</span>
                <Input type="date" value={form.anchorDate} onChange={(event) => setForm((current) => ({ ...current, anchorDate: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.role")}</span>
                <Input value={form.roleTitle} onChange={(event) => setForm((current) => ({ ...current, roleTitle: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.department")}</span>
                <Input value={form.departmentName} onChange={(event) => setForm((current) => ({ ...current, departmentName: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.manager")}</span>
                <SearchableSelect
                  value={form.managerStaffId}
                  onValueChange={(managerStaffId) => setForm((current) => ({ ...current, managerStaffId }))}
                  placeholder={t("hr.journeys.pickManager")}
                  emptyOption={{ value: "", label: t("hr.journeys.pickManager") }}
                  options={personOptions}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.owner")}</span>
                <SearchableSelect
                  value={form.ownerStaffId}
                  onValueChange={(ownerStaffId) => setForm((current) => ({ ...current, ownerStaffId }))}
                  placeholder={t("hr.journeys.pickOwner")}
                  emptyOption={{ value: "", label: t("hr.journeys.pickOwner") }}
                  options={personOptions}
                />
              </label>
              {form.kind === "offboarding" ? (
                <>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">{t("hr.journeys.exitCause")}</span>
                    <select
                      className={selectClass}
                      value={form.exitCause}
                      onChange={(event) => setForm((current) => ({ ...current, exitCause: event.target.value as typeof form.exitCause }))}
                    >
                      {EXIT_CAUSES.map((cause) => (
                        <option key={cause} value={cause}>
                          {t(`hr.journeys.exitCauses.${cause}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">{t("hr.journeys.noticeDays")}</span>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={form.noticeDays}
                      onChange={(event) => setForm((current) => ({ ...current, noticeDays: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm md:col-span-2">
                    <span className="font-medium">{t("hr.journeys.reason")}</span>
                    <Input value={form.reasonNote} onChange={(event) => setForm((current) => ({ ...current, reasonNote: event.target.value }))} />
                  </label>
                </>
              ) : null}
            </div>
            <Button
              disabled={start.isPending || !form.staffId || !form.templateId || !form.ownerStaffId || !form.managerStaffId || !form.anchorDate}
              onClick={() =>
                start.mutate({
                  staffId: form.staffId,
                  templateId: form.templateId,
                  ownerStaffId: form.ownerStaffId,
                  managerStaffId: form.managerStaffId,
                  anchorDate: form.anchorDate,
                  roleTitle: form.roleTitle || null,
                  departmentName: form.departmentName || null,
                  exitCause: form.kind === "offboarding" ? form.exitCause : null,
                  noticeDays: form.kind === "offboarding" ? Number(form.noticeDays || 0) : null,
                  reasonNote: form.kind === "offboarding" ? form.reasonNote : null,
                })
              }
            >
              {t("hr.journeys.start")}
            </Button>
          </HrPanel>
        ) : null}

        <Tabs defaultValue="workflows">
          <TabsList>
            <TabsTrigger value="workflows">{t("hr.journeys.tabs.workflows")}</TabsTrigger>
            <TabsTrigger value="templates">{t("hr.journeys.tabs.templates")}</TabsTrigger>
            <TabsTrigger value="rules">{t("hr.journeys.tabs.rules")}</TabsTrigger>
          </TabsList>
          <TabsContent value="workflows" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={surface === "tasks" ? "default" : "outline"} size="sm" onClick={() => { setSurface("tasks"); setPage(0); }}>
                {t("hr.journeys.myTasks", { count: taskRows.length })}
              </Button>
              <Button variant={surface === "workflows" ? "default" : "outline"} size="sm" onClick={() => setSurface("workflows")}>
                {t("hr.journeys.employeeWorkflows")}
              </Button>
            </div>
            {surface === "tasks" ? (
              <HrPanel className="space-y-3 p-4 sm:p-5">
                <label className="grid max-w-xs gap-1.5 text-sm">
                  <span className="font-medium">{t("hr.journeys.queueLabel")}</span>
                  <select
                    className={selectClass}
                    value={queue}
                    onChange={(event) => {
                      setQueue(event.target.value as "mine" | "open");
                      setPage(0);
                    }}
                  >
                    <option value="mine">{t("hr.journeys.queue.mine")}</option>
                    <option value="open">{t("hr.journeys.queue.open")}</option>
                  </select>
                </label>
                {!hub.isLoading && !hub.isError && !hub.data?.currentStaffId && queue === "mine" ? (
                  <p className="text-sm text-muted-foreground">{t("hr.journeys.noStaffLink")}</p>
                ) : null}
                {hub.isLoading || hub.isError ? null : visibleTasks.length === 0 ? (
                  <HrEmptyState message={t("hr.journeys.emptyTasks")} icon={ClipboardList} />
                ) : (
                  <ul className="divide-y divide-border">
                    {visibleTasks.map((task) => (
                      <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">
                            {task.staffName} · {t(`hr.journeys.kinds.${task.kind}`)}
                            {task.referenceCode ? ` · ${task.referenceCode}` : ""}
                          </p>
                          <p className="font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {[
                              t(`hr.journeys.roles.${task.ownerRole}`),
                              task.ownerName,
                              task.dueOn ? t("hr.journeys.due", { date: task.dueOn }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={task.overdue ? "destructive" : "warning"}>
                            {task.overdue ? t("hr.journeys.taskStatus.overdue") : t("hr.journeys.taskStatus.awaiting")}
                          </Badge>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/people/hr/onboarding/${task.checklistId}?task=${task.id}`}>{t("hr.journeys.openTask")}</Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                    {t("hr.journeys.previous")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= taskRows.length} onClick={() => setPage((current) => current + 1)}>
                    {t("hr.journeys.next")}
                  </Button>
                </div>
              </HrPanel>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className={selectClass} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                    <option value="all">{t("hr.journeys.allKinds")}</option>
                    <option value="onboarding">{t("hr.journeys.kinds.onboarding")}</option>
                    <option value="offboarding">{t("hr.journeys.kinds.offboarding")}</option>
                  </select>
                  <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                    <option value="open">{t("hr.journeys.status.open")}</option>
                    <option value="completed">{t("hr.journeys.status.completed")}</option>
                    <option value="cancelled">{t("hr.journeys.status.cancelled")}</option>
                    <option value="all">{t("hr.journeys.allStatuses")}</option>
                  </select>
                </div>
                {hub.isLoading || hub.isError ? null : workflowRows.length === 0 ? (
                  <HrPanel>
                    <HrEmptyState message={t("hr.journeys.emptyWorkflows")} icon={ClipboardList} />
                  </HrPanel>
                ) : (
                  workflowRows.map((row) => (
                    <HrPanel key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-medium">{row.staffName || t("hr.journeys.unnamed")}</p>
                        <p className="text-sm text-muted-foreground">
                          {[
                            t(`hr.journeys.kinds.${row.kind}`),
                            row.referenceCode,
                            row.anchorDate,
                            row.templateTitle,
                            row.managerName ? t("hr.journeys.managerLine", { name: row.managerName }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.journeys.progress", { done: row.requiredDone, total: row.requiredTotal, percent: row.percent })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.status === "completed" ? "success" : row.status === "cancelled" ? "muted" : "info"}>
                          {t(`hr.journeys.status.${row.status}`, { defaultValue: row.status })}
                        </Badge>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/people/hr/onboarding/${row.id}`}>{t("hr.journeys.openCase")}</Link>
                        </Button>
                      </div>
                    </HrPanel>
                  ))
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="templates" className="space-y-4">
            <HrPanel className="grid gap-3 p-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.journeyType")}</span>
                <select className={selectClass} value={templateForm.kind} onChange={(event) => setTemplateForm((current) => ({ ...current, kind: event.target.value as typeof templateForm.kind }))}>
                  <option value="onboarding">{t("hr.journeys.kinds.onboarding")}</option>
                  <option value="offboarding">{t("hr.journeys.kinds.offboarding")}</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("hr.journeys.templateTitle")}</span>
                <Input value={templateForm.title} onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm md:col-span-2">
                <span className="font-medium">{t("hr.journeys.templateDescription")}</span>
                <Input value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <Button
                className="w-fit"
                disabled={templateForm.title.trim().length < 3 || addTemplate.isPending}
                onClick={() => addTemplate.mutate({ kind: templateForm.kind, title: templateForm.title, description: templateForm.description || null })}
              >
                {t("hr.journeys.addTemplate")}
              </Button>
            </HrPanel>
            {(hub.data?.templates ?? []).map((template) => (
              <HrPanel key={template.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{template.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`hr.journeys.kinds.${template.kind}`)}
                      {template.description ? ` · ${template.description}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleTemplate.mutate({ templateId: template.id, active: !template.active })}>
                    {template.active ? t("hr.journeys.deactivate") : t("hr.journeys.activate")}
                  </Button>
                </div>
                <ul className="space-y-1 text-sm">
                  {template.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-border/70 py-2">
                      <span>{item.title}</span>
                      <span className="text-muted-foreground">
                        {t(`hr.journeys.sections.${item.section}`)} · {t(`hr.journeys.roles.${item.ownerRole}`)} · {item.required ? t("hr.journeys.required") : t("hr.journeys.optional")}
                        {item.needsReview ? ` · ${t("hr.journeys.needsReview")}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {templateForm.templateId === template.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input placeholder={t("hr.journeys.taskTitle")} value={templateForm.itemTitle} onChange={(event) => setTemplateForm((current) => ({ ...current, itemTitle: event.target.value }))} />
                    <select className={selectClass} value={templateForm.section} onChange={(event) => setTemplateForm((current) => ({ ...current, section: event.target.value }))}>
                      {(template.kind === "offboarding" ? sectionsFor("offboarding") : [...sectionsFor("onboarding"), ...JOURNEY_SECTIONS.filter((section) => section === "general")]).map((section) => (
                        <option key={section} value={section}>{t(`hr.journeys.sections.${section}`)}</option>
                      ))}
                    </select>
                    <select className={selectClass} value={templateForm.ownerRole} onChange={(event) => setTemplateForm((current) => ({ ...current, ownerRole: event.target.value as typeof templateForm.ownerRole }))}>
                      {OWNER_ROLES.map((role) => (
                        <option key={role} value={role}>{t(`hr.journeys.roles.${role}`)}</option>
                      ))}
                    </select>
                    <Input type="number" value={templateForm.dueOffsetDays} onChange={(event) => setTemplateForm((current) => ({ ...current, dueOffsetDays: event.target.value }))} />
                    <Button
                      disabled={templateForm.itemTitle.trim().length < 3 || addItem.isPending}
                      onClick={() =>
                        addItem.mutate({
                          templateId: template.id,
                          title: templateForm.itemTitle,
                          section: templateForm.section as (typeof JOURNEY_SECTIONS)[number],
                          required: templateForm.required,
                          ownerRole: templateForm.ownerRole,
                          dueOffsetDays: Number(templateForm.dueOffsetDays || 0),
                          needsReview: templateForm.needsReview,
                        })
                      }
                    >
                      {t("hr.journeys.addTask")}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setTemplateForm((current) => ({ ...current, templateId: template.id, section: template.kind === "offboarding" ? "handover" : "preboarding" }))}>
                    {t("hr.journeys.addTask")}
                  </Button>
                )}
              </HrPanel>
            ))}
          </TabsContent>
          <TabsContent value="rules" className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("hr.journeys.rulesIntro")}</p>
            <HrPanel className="grid gap-3 p-4 md:grid-cols-2">
              <select className={selectClass} value={ruleForm.kind} onChange={(event) => setRuleForm((current) => ({ ...current, kind: event.target.value as typeof ruleForm.kind }))}>
                <option value="onboarding">{t("hr.journeys.kinds.onboarding")}</option>
                <option value="offboarding">{t("hr.journeys.kinds.offboarding")}</option>
              </select>
              <select className={selectClass} value={ruleForm.approverRole} onChange={(event) => setRuleForm((current) => ({ ...current, approverRole: event.target.value as typeof ruleForm.approverRole }))}>
                {OWNER_ROLES.map((role) => (
                  <option key={role} value={role}>{t(`hr.journeys.roles.${role}`)}</option>
                ))}
              </select>
              <label className="grid gap-1.5 text-sm md:col-span-2">
                <span className="font-medium">{t("hr.journeys.ruleTitle")}</span>
                <Input value={ruleForm.title} onChange={(event) => setRuleForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <Button className="w-fit" disabled={ruleForm.title.trim().length < 3 || addRule.isPending} onClick={() => addRule.mutate(ruleForm)}>
                {t("hr.journeys.addRule")}
              </Button>
            </HrPanel>
            <ul className="space-y-2">
              {(hub.data?.rules ?? []).map((rule) => (
                <li key={rule.id}>
                  <HrPanel className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{rule.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t(`hr.journeys.kinds.${rule.kind}`)} · {t(`hr.journeys.roles.${rule.approverRole}`)}
                        {rule.required ? ` · ${t("hr.journeys.required")}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => toggleRule.mutate({ ruleId: rule.id, active: !rule.active })}>
                      {rule.active ? t("hr.journeys.deactivate") : t("hr.journeys.activate")}
                    </Button>
                  </HrPanel>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </HrSection>
    </HrShell>
  );
}

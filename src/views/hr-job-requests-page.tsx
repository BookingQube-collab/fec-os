"use client";

/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4
 * redesign inside the existing FEC HR shell.
 * macrostructure: workbench (queue + next step) · tone: utilitarian
 * theme: existing hr-shell · enrichment: none
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader, FecPageHeader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { filterDepartmentsForLocation } from "@/lib/department-audience";
import { listStaffForLeaveBalances } from "@/lib/hr-leave.functions";
import {
  JOB_REQUEST_DESK_GROUPS,
  canActOnJobStep,
  jobRequestDeskAction,
  jobRequestDeskGroup,
  jobRequestSearchText,
  jobRequestVisibleText,
  type HrJobApprovalRole,
  type HrJobPriority,
  type HrJobRequestType,
  type JobRequestDeskGroup,
} from "@/lib/hr-recruitment";
import {
  actOnJobRequestStep,
  grantQuotaOverride,
  listJobRequestApprovals,
  listJobRequests,
  listRecruitmentLookups,
  listVacancies,
  publishVacancyFromJobRequest,
  submitJobRequest,
  updateVacancyStatus,
} from "@/lib/hr-recruitment.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { canUserDo } from "@/lib/rbac";

type JobRequestRow = Awaited<ReturnType<typeof listJobRequests>>[number];
type ApprovalRow = Awaited<ReturnType<typeof listJobRequestApprovals>>[number];

function statusVariant(status: string): "success" | "info" | "warning" | "destructive" | "muted" {
  if (status === "published") return "success";
  if (status === "approved") return "info";
  if (status === "rejected") return "destructive";
  if (status === "cancelled" || status === "closed") return "muted";
  return "warning";
}

function money(value: number) {
  return `QAR ${value.toLocaleString()}`;
}

export default function HrJobRequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useUserRoles();
  const canManage = canUserDo(roles, "recruitment.manage");
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");
  const canOverride = canUserDo(roles, "quota.override_approve");
  const can = (capability: Parameters<typeof canUserDo>[1]) => canUserDo(roles, capability);

  const [composerOpen, setComposerOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [group, setGroup] = useState<JobRequestDeskGroup | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ desk: canManage ? "queue" : "mine" }),
    queryFn: () => listJobRequests(canManage ? { adminQueue: true } : { mineOnly: true }),
    staleTime: STALE.people,
  });

  const scoped = useMemo(() => {
    const rows = list.data ?? [];
    if (!canManage || scope === "all") return rows;
    return rows.filter((row) => row.requestedBy === user?.id);
  }, [list.data, canManage, scope, user?.id]);

  const counts = useMemo(() => {
    const tally = Object.fromEntries(JOB_REQUEST_DESK_GROUPS.map((key) => [key, 0])) as Record<
      JobRequestDeskGroup,
      number
    >;
    for (const row of scoped) tally[jobRequestDeskGroup(row.status)] += 1;
    return tally;
  }, [scoped]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scoped.filter((row) => {
      if (group !== "all" && jobRequestDeskGroup(row.status) !== group) return false;
      if (!needle) return true;
      return jobRequestSearchText(row, canViewSalary).includes(needle);
    });
  }, [scoped, group, search, canViewSalary]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => (current && filtered.some((row) => row.id === current) ? current : filtered[0]!.id));
  }, [filtered]);

  const selected = filtered.find((row) => row.id === selectedId) ?? null;
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrJobRequests() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrVacancies() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  return (
    <CapabilityGate
      capability="recruitment.request"
      fallback={
        <FecPageHeader
          icon={Briefcase}
          kicker={t("hr.jobs.kicker")}
          title={t("hr.jobs.title")}
          subtitle={t("hr.jobs.noAccess")}
        />
      }
    >
      <HrShell className="min-w-0 overflow-x-clip">
        <HrSection
          icon={Briefcase}
          kicker={t("hr.jobs.kicker")}
          title={t("hr.jobs.title")}
          subtitle={t("hr.jobs.subtitle")}
          actions={
            <Button type="button" className="whitespace-nowrap" onClick={() => setComposerOpen(true)}>
              {t("hr.jobs.createTitle")}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("hr.jobs.groupsLabel")}>
            <FilterChip
              pressed={group === "all"}
              label={t("hr.jobs.groups.all")}
              count={scoped.length}
              onClick={() => setGroup("all")}
            />
            {JOB_REQUEST_DESK_GROUPS.map((key) => (
              <FilterChip
                key={key}
                pressed={group === key}
                label={t(`hr.jobs.groups.${key}`)}
                count={counts[key]}
                onClick={() => setGroup(key)}
              />
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <Label htmlFor="job-request-search" className="sr-only">
                {t("hr.jobs.search")}
              </Label>
              <Input
                id="job-request-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("hr.jobs.search")}
                className="min-w-0"
              />
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("hr.jobs.scopeLabel")}>
                <FilterChip
                  pressed={scope === "all"}
                  label={t("hr.jobs.allRequests")}
                  onClick={() => setScope("all")}
                />
                <FilterChip
                  pressed={scope === "mine"}
                  label={t("hr.jobs.myRequests")}
                  onClick={() => setScope("mine")}
                />
              </div>
            ) : null}
          </div>

          {list.isLoading ? (
            <FecLoader label={t("common.loading")} />
          ) : list.isError ? (
            <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
          ) : scoped.length === 0 ? (
            <HrPanel className="px-4 py-2">
              <HrEmptyState
                message={canManage && scope === "all" ? t("hr.jobsAdmin.empty") : t("hr.jobs.empty")}
                icon={Briefcase}
              />
            </HrPanel>
          ) : filtered.length === 0 ? (
            <HrEmptyState message={t("hr.jobs.emptyFiltered")} icon={Briefcase} />
          ) : (
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <section className="order-2 min-w-0 lg:order-1" aria-label={t("hr.jobsAdmin.queue")}>
                <h2 className="mb-2 text-sm font-semibold">
                  {canManage && scope === "all" ? t("hr.jobsAdmin.queue") : t("hr.jobs.myRequests")}
                </h2>
                <ul className="space-y-2">
                  {filtered.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`hr-list-row w-full min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                          row.id === selectedId ? "bg-secondary" : ""
                        }`}
                        aria-pressed={row.id === selectedId}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{row.jobTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              row.locationName,
                              row.departmentName,
                              t("hr.jobs.vacLine", { count: row.vacanciesCount }),
                              canViewSalary && row.salaryBudgetQar != null ? money(row.salaryBudgetQar) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Badge variant={statusVariant(row.status)}>
                          {t(`hr.jobs.statuses.${row.status}`, { defaultValue: row.status })}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              {selected ? (
                <RequestDetail
                  row={selected}
                  canViewSalary={canViewSalary}
                  canManage={canManage}
                  canOverride={canOverride}
                  canAct={
                    selected.status === "pending" && selected.currentStepRole
                      ? canActOnJobStep(selected.currentStepRole as HrJobApprovalRole, can, roles)
                      : false
                  }
                  onChanged={invalidate}
                />
              ) : null}
            </div>
          )}
        </HrSection>
        <NewJobRequestDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          canViewSalary={canViewSalary}
          onCreated={() => {
            invalidate();
            setScope(canManage ? "mine" : "all");
            setGroup("all");
            setSearch("");
          }}
        />
      </HrShell>
    </CapabilityGate>
  );
}

function FilterChip({
  pressed,
  label,
  count,
  onClick,
}: {
  pressed: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      className="h-auto max-w-full whitespace-normal"
      onClick={onClick}
    >
      {label}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
    </Button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}

function RequestDetail({
  row,
  canViewSalary,
  canManage,
  canOverride,
  canAct,
  onChanged,
}: {
  row: JobRequestRow;
  canViewSalary: boolean;
  canManage: boolean;
  canOverride: boolean;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [recruiterUserId, setRecruiterUserId] = useState("");
  const [vacancyReason, setVacancyReason] = useState("");

  useEffect(() => {
    setComments("");
    setOverrideReason("");
    setRecruiterUserId("");
    setVacancyReason("");
  }, [row.id]);

  const steps = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ approvals: row.id }),
    queryFn: () => listJobRequestApprovals({ jobRequestId: row.id }),
    staleTime: STALE.people,
  });
  const vacancies = useQuery({
    queryKey: queryKeys.people.hrVacancies({}),
    queryFn: () => listVacancies({}),
    enabled: canManage && row.status === "published",
    staleTime: STALE.people,
  });
  const vacancy = (vacancies.data ?? []).find((item) => item.jobRequestId === row.id) ?? null;
  const action = jobRequestDeskAction({
    status: row.status,
    canActOnCurrentStep: canAct,
    canManage,
    canGrantOverride: canOverride,
    exceedsQuota: row.exceedsQuota,
    quotaOverrideStatus: row.quotaOverrideStatus,
  });
  const stepLabel = row.currentStepRole
    ? t(`hr.jobs.steps.${row.currentStepRole}`, { defaultValue: row.currentStepRole })
    : null;
  const description = jobRequestVisibleText(row.jobDescription, canViewSalary);
  const skills = jobRequestVisibleText(row.skills, canViewSalary);

  const act = useMutation({
    mutationFn: (kind: "approved" | "rejected" | "returned") =>
      actOnJobRequestStep({ jobRequestId: row.id, action: kind, comments: comments || null }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.acted"));
      setComments("");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const override = useMutation({
    mutationFn: () => grantQuotaOverride({ jobRequestId: row.id, reason: overrideReason }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.overrideGranted"));
      setOverrideReason("");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: () =>
      publishVacancyFromJobRequest({
        jobRequestId: row.id,
        recruiterUserId: recruiterUserId.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.published"));
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const vacStatus = useMutation({
    mutationFn: (status: "on_hold" | "closed" | "cancelled" | "open") =>
      updateVacancyStatus({
        vacancyId: vacancy!.id,
        status,
        reason: vacancyReason || null,
      }),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.vacancyUpdated"));
      setVacancyReason("");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const showDecision = action.approve || action.returnForCorrection || action.reject;

  return (
    <HrPanel className="order-1 min-w-0 space-y-4 p-4 lg:order-2">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-base font-semibold">{row.jobTitle}</p>
        <p className="break-words text-sm text-muted-foreground">
          {[row.locationName, row.departmentName, row.employmentCategory].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant={statusVariant(row.status)}>
            {t(`hr.jobs.statuses.${row.status}`, { defaultValue: row.status })}
          </Badge>
          {stepLabel ? <Badge variant="outline">{stepLabel}</Badge> : null}
          <Badge variant="outline">{t(`hr.jobs.priorities.${row.priority as HrJobPriority}`, { defaultValue: row.priority })}</Badge>
          {row.exceedsQuota ? <Badge variant="warning">{t("hr.jobs.exceedsQuota")}</Badge> : null}
        </div>
      </div>

      <div className="hr-notice">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">{t("hr.jobs.nextTitle")}</p>
          <p className="text-sm">
            {action.message === "awaiting_approval" && stepLabel
              ? t("hr.jobs.next.awaiting_approval", { step: stepLabel })
              : action.message === "awaiting_approval"
                ? t("hr.jobs.next.awaiting_approval_plain")
                : t(`hr.jobs.next.${action.message}`)}
          </p>
          {showDecision ? (
            <div className="space-y-2">
              <Label htmlFor={`job-comments-${row.id}`}>{t("hr.jobsAdmin.comments")}</Label>
              <Textarea
                id={`job-comments-${row.id}`}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                {action.approve ? (
                  <Button type="button" size="sm" disabled={act.isPending} onClick={() => act.mutate("approved")}>
                    {t("hr.jobsAdmin.approve")}
                  </Button>
                ) : null}
                {action.returnForCorrection ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={act.isPending}
                    onClick={() => act.mutate("returned")}
                  >
                    {t("hr.jobsAdmin.return")}
                  </Button>
                ) : null}
                {action.reject ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={act.isPending}
                    onClick={() => act.mutate("rejected")}
                  >
                    {t("hr.jobsAdmin.reject")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {action.grantOverride ? (
            <div className="space-y-2">
              <Label htmlFor={`job-override-${row.id}`}>{t("hr.jobsAdmin.overrideReason")}</Label>
              <Textarea
                id={`job-override-${row.id}`}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={2}
              />
              <Button
                type="button"
                size="sm"
                disabled={override.isPending || overrideReason.trim().length < 3}
                onClick={() => override.mutate()}
              >
                {t("hr.jobsAdmin.grantOverride")}
              </Button>
            </div>
          ) : null}
          {action.publish ? (
            <div className="space-y-2">
              <Label htmlFor={`job-recruiter-${row.id}`}>{t("hr.jobsAdmin.recruiterStub")}</Label>
              <Input
                id={`job-recruiter-${row.id}`}
                value={recruiterUserId}
                onChange={(event) => setRecruiterUserId(event.target.value)}
                className="min-w-0"
              />
              <Button type="button" size="sm" disabled={publish.isPending} onClick={() => publish.mutate()}>
                {t("hr.jobsAdmin.publish")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label={t("hr.jobs.vacancies")} value={t("hr.jobs.vacLine", { count: row.vacanciesCount })} />
        <Fact
          label={t("hr.jobs.requestType")}
          value={row.requestType === "replacement" ? t("hr.jobs.typeReplacement") : t("hr.jobs.typeNew")}
        />
        {row.requiredJoiningDate ? <Fact label={t("hr.jobs.joining")} value={row.requiredJoiningDate} /> : null}
        {row.experienceYears != null ? (
          <Fact label={t("hr.jobs.experience")} value={String(row.experienceYears)} />
        ) : null}
        {row.education ? <Fact label={t("hr.jobs.education")} value={row.education} /> : null}
        {canViewSalary && row.salaryBudgetQar != null ? (
          <Fact label={t("hr.jobs.salaryBudget")} value={money(row.salaryBudgetQar)} />
        ) : null}
      </div>

      {description ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hr.jobs.jd")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{description}</p>
        </div>
      ) : null}
      {skills ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hr.jobs.skills")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{skills}</p>
        </div>
      ) : null}
      {row.justification ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hr.jobs.justification")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{row.justification}</p>
        </div>
      ) : null}
      {row.returnReason ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hr.jobsAdmin.return")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{row.returnReason}</p>
        </div>
      ) : null}
      {row.rejectionReason ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("hr.jobsAdmin.reject")}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{row.rejectionReason}</p>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("hr.jobs.progress")}</h2>
        {steps.isLoading ? (
          <FecLoader label={t("common.loading")} />
        ) : steps.isError ? (
          <p className="text-sm text-destructive">{t("hrWorkspace.loadFailed")}</p>
        ) : (steps.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.jobs.noSteps")}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {(steps.data ?? []).map((step: ApprovalRow) => (
              <li key={step.id} className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t(`hr.jobs.steps.${step.stepRole}`, { defaultValue: step.stepRole })}
                </span>
                <Badge variant="secondary">
                  {t(`hr.jobs.approvalStatus.${step.status}`, { defaultValue: step.status })}
                </Badge>
                {step.comments ? <span className="min-w-0 break-words text-muted-foreground">{step.comments}</span> : null}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">{t("hr.jobs.progressHint")}</p>
      </section>

      {canManage && row.status === "published" && vacancy ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("hr.jobsAdmin.vacancies")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(`hr.ats.desk.vacancyStatus.${vacancy.status}`, { defaultValue: vacancy.status })}
          </p>
          <Label htmlFor={`vacancy-reason-${row.id}`}>{t("hr.jobsAdmin.reason")}</Label>
          <Input
            id={`vacancy-reason-${row.id}`}
            value={vacancyReason}
            onChange={(event) => setVacancyReason(event.target.value)}
            className="min-w-0"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={vacStatus.isPending}
              onClick={() => vacStatus.mutate("on_hold")}
            >
              {t("hr.jobsAdmin.hold")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={vacStatus.isPending}
              onClick={() => vacStatus.mutate("closed")}
            >
              {t("hr.jobsAdmin.close")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={vacStatus.isPending}
              onClick={() => vacStatus.mutate("cancelled")}
            >
              {t("hr.jobsAdmin.cancel")}
            </Button>
          </div>
        </section>
      ) : null}
    </HrPanel>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "min-w-0"}>
      <Label>{label}</Label>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

function NewJobRequestDialog({
  open,
  onOpenChange,
  canViewSalary,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewSalary: boolean;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [jobTitle, setJobTitle] = useState("");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vacancies, setVacancies] = useState("1");
  const [requestType, setRequestType] = useState<HrJobRequestType>("new");
  const [replacedStaffId, setReplacedStaffId] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<HrJobPriority>("normal");
  const [joining, setJoining] = useState("");
  const [salary, setSalary] = useState("");
  const [experience, setExperience] = useState("");
  const [education, setEducation] = useState("");
  const [jd, setJd] = useState("");
  const [skills, setSkills] = useState("");
  const [justification, setJustification] = useState("");
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const lookups = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ view: "lookups" }),
    queryFn: () => listRecruitmentLookups(),
    staleTime: STALE.people,
    enabled: open,
  });
  const departmentChoices = useMemo(() => {
    const code = (lookups.data?.locations ?? []).find((location) => location.id === locationId)?.code ?? null;
    return filterDepartmentsForLocation(lookups.data?.departments ?? [], locationId ? code : null, [
      departmentId,
    ]).filter((department) => department.id);
  }, [lookups.data, locationId, departmentId]);
  const staffOptions = useQuery({
    queryKey: queryKeys.people.hrLeaveBalances({ view: "staff" }),
    queryFn: () => listStaffForLeaveBalances(),
    staleTime: STALE.people,
    enabled: open && requestType === "replacement",
  });

  const submit = useMutation({
    mutationFn: (ack?: boolean) => {
      const experienceYears = experience.trim() === "" ? null : Number(experience);
      const salaryBudget = salary.trim() === "" ? null : Number(salary);
      return submitJobRequest({
        jobTitle,
        locationId: locationId || null,
        departmentId: departmentId || null,
        vacanciesCount: Number(vacancies) || 1,
        requestType,
        replacedStaffId: requestType === "replacement" && replacedStaffId.trim() ? replacedStaffId.trim() : null,
        employmentCategory: (category || null) as never,
        jobDescription: jd || null,
        skills: skills || null,
        experienceYears: experienceYears != null && Number.isFinite(experienceYears) ? experienceYears : null,
        education: education || null,
        salaryBudgetQar: canViewSalary && salaryBudget != null && Number.isFinite(salaryBudget) ? salaryBudget : null,
        requiredJoiningDate: joining || null,
        justification: justification || null,
        priority,
        acknowledgeQuotaWarning: ack ?? false,
      });
    },
    onSuccess: (res) => {
      if (res.requiresAck && res.warning) {
        setQuotaWarning(res.warning);
        toast.warning(res.warning);
        return;
      }
      toast.success(t("hr.jobs.submitted"));
      setQuotaWarning(null);
      setJobTitle("");
      setJd("");
      setSkills("");
      setJustification("");
      setSalary("");
      onOpenChange(false);
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,44rem)] w-[calc(100vw-1.5rem)] max-w-2xl overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("hr.jobs.createTitle")}</DialogTitle>
          <DialogDescription>{t("hr.jobs.createBody")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-5">
          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">{t("hr.jobs.sections.role")}</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label={t("hr.jobs.jobTitle")} className="min-w-0 sm:col-span-2">
                <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className="min-w-0" />
              </Field>
              <Field label={t("hr.jobs.location")}>
                <SearchableSelect
                value={locationId}
                  onValueChange={setLocationId}
                  placeholder={t("hr.jobs.pick")}
                  emptyOption={{ value: "", label: t("hr.jobs.pick") }}
                  options={(lookups.data?.locations ?? []).map((location) => ({
                    value: location.id,
                    label: location.name,
                  }))}
                />
              </Field>
              <Field label={t("hr.jobs.department")}>
                <SearchableSelect
                value={departmentId}
                  onValueChange={setDepartmentId}
                  placeholder={t("hr.jobs.pick")}
                  emptyOption={{ value: "", label: t("hr.jobs.pick") }}
                  options={departmentChoices.map((department) => ({
                    value: department.id,
                    label: department.name,
                  }))}
                />
              </Field>
              <Field label={t("hr.jobs.category")} className="min-w-0 sm:col-span-2">
                <SearchableSelect
                  value={category}
                  onValueChange={setCategory}
                  placeholder={t("hr.jobs.pick")}
                  emptyOption={{ value: "", label: t("hr.jobs.pick") }}
                  options={(lookups.data?.categories ?? []).map((item) => ({ value: item, label: item }))}
                />
              </Field>
            </div>
          </section>

          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">{t("hr.jobs.sections.need")}</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label={t("hr.jobs.vacancies")}>
              <Input
                type="number"
                min={1}
                value={vacancies}
                  onChange={(event) => setVacancies(event.target.value)}
                  className="min-w-0"
                />
              </Field>
              <Field label={t("hr.jobs.requestType")}>
                <SearchableSelect
                value={requestType}
                  onValueChange={(value) => setRequestType(value as HrJobRequestType)}
                  placeholder={t("hr.jobs.typeNew")}
                  options={[
                    { value: "new", label: t("hr.jobs.typeNew") },
                    { value: "replacement", label: t("hr.jobs.typeReplacement") },
                  ]}
                />
              </Field>
            {requestType === "replacement" ? (
                <Field label={t("hr.jobs.replacedStaff")} className="min-w-0 sm:col-span-2">
                  <SearchableSelect
                    value={replacedStaffId}
                    onValueChange={setReplacedStaffId}
                    placeholder={t("hr.leave.pickStaff")}
                    emptyOption={{ value: "", label: t("hr.leave.pickStaff") }}
                    options={(staffOptions.data ?? []).map((staff) => ({
                      value: staff.id,
                      label: staff.employeeCode ? `${staff.name} (${staff.employeeCode})` : staff.name,
                      keywords: `${staff.name} ${staff.employeeCode ?? ""}`,
                    }))}
                  />
                </Field>
            ) : null}
              <Field label={t("hr.jobs.priority")}>
                <SearchableSelect
                value={priority}
                  onValueChange={(value) => setPriority(value as HrJobPriority)}
                  placeholder={t("hr.jobs.priorities.normal")}
                  options={(["low", "normal", "high", "urgent"] as const).map((item) => ({
                    value: item,
                    label: t(`hr.jobs.priorities.${item}`),
                  }))}
                />
              </Field>
              <Field label={t("hr.jobs.joining")}>
                <Input type="date" value={joining} onChange={(event) => setJoining(event.target.value)} className="min-w-0" />
              </Field>
            {canViewSalary ? (
                <Field label={t("hr.jobs.salaryBudget")}>
                  <Input
                    type="number"
                    min={0}
                    value={salary}
                    onChange={(event) => setSalary(event.target.value)}
                    className="min-w-0"
                  />
                </Field>
            ) : null}
            </div>
          </section>

          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">{t("hr.jobs.sections.requirements")}</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label={t("hr.jobs.experience")}>
                <Input value={experience} onChange={(event) => setExperience(event.target.value)} className="min-w-0" />
              </Field>
              <Field label={t("hr.jobs.education")}>
                <Input value={education} onChange={(event) => setEducation(event.target.value)} className="min-w-0" />
              </Field>
              <Field label={t("hr.jobs.jd")} className="min-w-0 sm:col-span-2">
                <Textarea value={jd} onChange={(event) => setJd(event.target.value)} rows={3} />
              </Field>
              <Field label={t("hr.jobs.skills")} className="min-w-0 sm:col-span-2">
                <Textarea value={skills} onChange={(event) => setSkills(event.target.value)} rows={2} />
              </Field>
            </div>
          </section>

          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">{t("hr.jobs.sections.why")}</h2>
            <Field label={t("hr.jobs.justification")}>
              <Textarea value={justification} onChange={(event) => setJustification(event.target.value)} rows={2} />
            </Field>
          </section>

            {quotaWarning ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>{quotaWarning}</p>
                <p className="mt-1 text-xs">{t("hr.jobs.quotaOverrideHint")}</p>
            </div>
                      ) : null}
                    </div>

        <DialogFooter className="gap-2">
          {quotaWarning ? (
            <Button type="button" variant="secondary" disabled={submit.isPending} onClick={() => submit.mutate(true)}>
              {t("hr.jobs.submitAnyway")}
            </Button>
        ) : null}
          <Button type="button" disabled={submit.isPending || jobTitle.trim().length < 2} onClick={() => submit.mutate(false)}>
            {submit.isPending ? t("common.saving") : t("hr.jobs.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

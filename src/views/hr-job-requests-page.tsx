"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserRoles } from "@/hooks/use-auth";
import { canUserDo } from "@/lib/rbac";
import {
  listJobRequestApprovals,
  listJobRequests,
  listRecruitmentLookups,
  submitJobRequest,
} from "@/lib/hr-recruitment.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrJobRequestsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");

  const [jobTitle, setJobTitle] = useState("");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vacancies, setVacancies] = useState("1");
  const [requestType, setRequestType] = useState<"new" | "replacement">("new");
  const [replacedStaffId, setReplacedStaffId] = useState("");
  const [category, setCategory] = useState("");
  const [jd, setJd] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("");
  const [education, setEducation] = useState("");
  const [salary, setSalary] = useState("");
  const [joining, setJoining] = useState("");
  const [justification, setJustification] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const lookups = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ view: "lookups" }),
    queryFn: () => listRecruitmentLookups(),
    staleTime: STALE.people,
  });

  const list = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ mine: true }),
    queryFn: () => listJobRequests({ mineOnly: true }),
    staleTime: STALE.people,
  });

  const steps = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ approvals: selectedId }),
    queryFn: () => listJobRequestApprovals({ jobRequestId: selectedId! }),
    enabled: Boolean(selectedId),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrJobRequests() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const submit = useMutation({
    mutationFn: (ack?: boolean) => {
      const payload = pendingPayload ?? {
        jobTitle,
        locationId: locationId || null,
        departmentId: departmentId || null,
        vacanciesCount: Number(vacancies) || 1,
        requestType,
        replacedStaffId:
          requestType === "replacement" && replacedStaffId.trim()
            ? replacedStaffId.trim()
            : null,
        employmentCategory: (category || null) as never,
        jobDescription: jd || null,
        skills: skills || null,
        experienceYears: experience ? Number(experience) : null,
        education: education || null,
        salaryBudgetQar: canViewSalary && salary ? Number(salary) : null,
        requiredJoiningDate: joining || null,
        justification: justification || null,
        priority,
        acknowledgeQuotaWarning: ack ?? false,
      };
      return submitJobRequest(payload as never);
    },
    onSuccess: (res) => {
      if (res.requiresAck && res.warning) {
        setQuotaWarning(res.warning);
        setPendingPayload({
          jobTitle,
          locationId: locationId || null,
          departmentId: departmentId || null,
          vacanciesCount: Number(vacancies) || 1,
          requestType,
          replacedStaffId:
            requestType === "replacement" && replacedStaffId.trim()
              ? replacedStaffId.trim()
              : null,
          employmentCategory: (category || null) as never,
          jobDescription: jd || null,
          skills: skills || null,
          experienceYears: experience ? Number(experience) : null,
          education: education || null,
          salaryBudgetQar: canViewSalary && salary ? Number(salary) : null,
          requiredJoiningDate: joining || null,
          justification: justification || null,
          priority,
        });
        toast.warning(res.warning);
        return;
      }
      toast.success(t("hr.jobs.submitted"));
      setQuotaWarning(null);
      setPendingPayload(null);
      setJobTitle("");
      setJd("");
      setSkills("");
      setJustification("");
      setSalary("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="recruitment.request"
      fallback={
        <PageHeader
          icon={Briefcase}
          kicker={t("hr.jobs.kicker")}
          title={t("hr.jobs.title")}
          subtitle={t("hr.jobs.noAccess")}
        />
      }
    >
      <HrShell>
        <PageHeader
          icon={Briefcase}
          kicker={t("hr.jobs.kicker")}
          title={t("hr.jobs.title")}
          subtitle={t("hr.jobs.subtitle")}
        />

        <HrSection title={t("hr.jobs.createTitle")}>
          <HrPanel className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("hr.jobs.jobTitle")}</Label>
              <Input className="mt-1" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("hr.jobs.location")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">{t("hr.jobs.pick")}</option>
                {(lookups.data?.locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("hr.jobs.department")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">{t("hr.jobs.pick")}</option>
                {(lookups.data?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("hr.jobs.vacancies")}</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={vacancies}
                onChange={(e) => setVacancies(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("hr.jobs.requestType")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as "new" | "replacement")}
              >
                <option value="new">{t("hr.jobs.typeNew")}</option>
                <option value="replacement">{t("hr.jobs.typeReplacement")}</option>
              </select>
            </div>
            {requestType === "replacement" ? (
              <div>
                <Label>{t("hr.jobs.replacedStaff")}</Label>
                <Input
                  className="mt-1"
                  placeholder="staff uuid"
                  value={replacedStaffId}
                  onChange={(e) => setReplacedStaffId(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label>{t("hr.jobs.category")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{t("hr.jobs.pick")}</option>
                {(lookups.data?.categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("hr.jobs.priority")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
              >
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`hr.jobs.priorities.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("hr.jobs.joining")}</Label>
              <Input className="mt-1" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} />
            </div>
            {canViewSalary ? (
              <div>
                <Label>{t("hr.jobs.salaryBudget")}</Label>
                <Input className="mt-1" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} />
              </div>
            ) : null}
            <div>
              <Label>{t("hr.jobs.experience")}</Label>
              <Input className="mt-1" value={experience} onChange={(e) => setExperience(e.target.value)} />
            </div>
            <div>
              <Label>{t("hr.jobs.education")}</Label>
              <Input className="mt-1" value={education} onChange={(e) => setEducation(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("hr.jobs.jd")}</Label>
              <Textarea className="mt-1" value={jd} onChange={(e) => setJd(e.target.value)} rows={3} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("hr.jobs.skills")}</Label>
              <Textarea className="mt-1" value={skills} onChange={(e) => setSkills(e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("hr.jobs.justification")}</Label>
              <Textarea className="mt-1" value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} />
            </div>
            {quotaWarning ? (
              <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>{quotaWarning}</p>
                <p className="mt-1 text-xs">{t("hr.jobs.quotaOverrideHint")}</p>
                <Button
                  type="button"
                  className="mt-2"
                  size="sm"
                  onClick={() => submit.mutate(true)}
                  disabled={submit.isPending}
                >
                  {t("hr.jobs.submitAnyway")}
                </Button>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                type="button"
                onClick={() => submit.mutate(false)}
                disabled={submit.isPending || !jobTitle.trim()}
              >
                {t("hr.jobs.submit")}
              </Button>
            </div>
          </HrPanel>
        </HrSection>

        <HrSection title={t("hr.jobs.myRequests")}>
          {!list.data?.length ? (
            <HrEmptyState title={t("hr.jobs.empty")} />
          ) : (
            <ul className="space-y-2">
              {list.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-start text-sm hover:bg-muted/40"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.jobTitle}</span>
                      <Badge variant="secondary">{r.status}</Badge>
                      {r.currentStepRole ? (
                        <Badge variant="outline">{t(`hr.jobs.steps.${r.currentStepRole}`, r.currentStepRole)}</Badge>
                      ) : null}
                      {r.exceedsQuota ? <Badge className="bg-amber-100 text-amber-900">{t("hr.jobs.exceedsQuota")}</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[r.locationName, r.departmentName, `${r.vacanciesCount} vac`].filter(Boolean).join(" · ")}
                      {canViewSalary && r.salaryBudgetQar != null
                        ? ` · QAR ${r.salaryBudgetQar.toLocaleString()}`
                        : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </HrSection>

        {selectedId ? (
          <HrSection title={t("hr.jobs.progress")}>
            <HrPanel className="p-4">
              <ol className="space-y-2 text-sm">
                {(steps.data ?? []).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`hr.jobs.steps.${s.stepRole}`, s.stepRole)}</span>
                    <Badge variant="secondary">{s.status}</Badge>
                    {s.comments ? <span className="text-muted-foreground">{s.comments}</span> : null}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">{t("hr.jobs.progressHint")}</p>
            </HrPanel>
          </HrSection>
        ) : null}
      </HrShell>
    </CapabilityGate>
  );
}

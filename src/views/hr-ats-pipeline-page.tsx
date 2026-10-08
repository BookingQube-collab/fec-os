"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, CalendarClock, Handshake, Plus, Search, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserRoles } from "@/hooks/use-auth";
import { getRecruitmentMatch } from "@/lib/hr-assist/read-modules.functions";
import {
  addApplicationNote,
  bulkUploadCandidates,
  changeApplicationStage,
  createCandidate,
  createOffer,
  ensureRecruitmentDeskDemo,
  listAtsPipeline,
  recalculateApplicationMatch,
  respondToOffer,
} from "@/lib/hr-ats.functions";
import { HR_APPLICATION_STAGES, HR_CANDIDATE_SOURCES, type HrApplicationStage } from "@/lib/hr-ats";
import {
  ATS_SCORE_BANDS,
  atsScoreBand,
  filterRecruitmentRows,
  isAtsReviewed,
  isInterviewStage,
  isOfferStage,
  matchSummary,
  nextApplicationStage,
  recruitmentNoteKeysByCandidate,
  type AtsPool,
  type RecruitmentFilterInput,
} from "@/lib/hr-ats-review";
import { listRecruitmentLookups, listVacancies, submitJobRequest, updateVacancyStatus } from "@/lib/hr-recruitment.functions";
import { HR_VACANCY_STATUSES } from "@/lib/hr-recruitment";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type DeskTab = "requisitions" | "candidates" | "interviews" | "offers";

type DeskOffer = {
  id: string;
  status: string;
  salaryQar: number | null;
  joiningDate: string | null;
};

type DeskApplication = {
  id: string;
  candidateId: string;
  vacancyId: string;
  stage: HrApplicationStage;
  matchScore: number | null;
  matchExplanation: Record<string, unknown>;
  jobTitle: string | null;
  vacancyStatus: string | null;
  departmentId: string | null;
  latestNote: string | null;
  offer: DeskOffer | null;
  candidate: {
    fullName: string;
    email: string | null;
    phone: string | null;
    skills: string | null;
  } | null;
};

let recruitmentDemoSeed: Promise<void> | null = null;

function seedRecruitmentDeskOnce(): Promise<void> {
  if (!recruitmentDemoSeed) {
    recruitmentDemoSeed = ensureRecruitmentDeskDemo()
      .then(() => undefined)
      .catch((error: unknown) => {
        recruitmentDemoSeed = null;
        throw error;
      });
  }
  return recruitmentDemoSeed;
}

const EMPTY_FILTERS: RecruitmentFilterInput = {
  pool: "reviewed",
  vacancyId: "",
  stage: "",
  departmentId: "",
  vacancyStatus: "",
  band: "",
  query: "",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1]! : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase() || "—";
}

function visibleContact(value: string | null | undefined): string | null {
  if (!value || value === "[redacted]") return null;
  return value;
}

function stageVariant(stage: string): "success" | "warning" | "destructive" | "info" | "secondary" {
  if (stage === "rejected" || stage === "offer_declined") return "destructive";
  if (stage === "joined" || stage === "offer_accepted" || stage === "ready_to_join") return "success";
  if (stage === "on_hold" || stage === "offer_pending" || stage === "offer_issued") return "warning";
  if (isInterviewStage(stage)) return "info";
  return "secondary";
}

function bandVariant(band: string | null): "success" | "warning" | "muted" {
  if (band === "strong") return "success";
  if (band === "consider") return "warning";
  return "muted";
}

function isPendingOffer(app: DeskApplication): boolean {
  if (app.offer?.status === "issued" || app.offer?.status === "draft") return true;
  return !app.offer && (app.stage === "offer_pending" || app.stage === "offer_issued");
}

export default function HrAtsPipelinePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canManage = canUserDo(roles, "recruitment.manage");
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");

  const [tab, setTab] = useState<DeskTab>("candidates");
  const [filters, setFilters] = useState<RecruitmentFilterInput>(EMPTY_FILTERS);
  const [reqDepartment, setReqDepartment] = useState("");
  const [reqStatus, setReqStatus] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const demoSeedStarted = useRef(false);

  const vacancies = useQuery({
    queryKey: queryKeys.people.hrVacancies({ desk: true }),
    queryFn: () => listVacancies({}),
    staleTime: STALE.people,
  });

  const pipeline = useQuery({
    queryKey: queryKeys.people.hrAts({ desk: true }),
    queryFn: () => listAtsPipeline({ vacancyId: null, q: null }),
    staleTime: STALE.people,
  });

  const roleMatch = useQuery({
    queryKey: queryKeys.people.hrAssist({
      view: "recruitment",
      vacancyId: filters.vacancyId || null,
      desk: true,
    }),
    queryFn: () => getRecruitmentMatch({ vacancyId: filters.vacancyId || null }),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-ats"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-vacancies"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-assist"] });
  };

  useEffect(() => {
    if (demoSeedStarted.current || !canManage) return;
    if (vacancies.isLoading || pipeline.isLoading) return;
    demoSeedStarted.current = true;
    void seedRecruitmentDeskOnce()
      .then(() => invalidate())
      .catch((error: Error) => {
        demoSeedStarted.current = false;
        toast.error(error.message);
      });
  }, [
    canManage,
    pipeline.data,
    pipeline.isError,
    pipeline.isLoading,
    qc,
    vacancies.data,
    vacancies.isError,
    vacancies.isLoading,
  ]);

  const stageChange = useMutation({
    mutationFn: (input: { applicationId: string; toStage: HrApplicationStage; reason?: string }) =>
      changeApplicationStage({
        applicationId: input.applicationId,
        toStage: input.toStage,
        reason: input.reason ?? null,
        note: input.reason ?? null,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.stageUpdated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: (applicationId: string) => recalculateApplicationMatch({ applicationId }),
    onSuccess: (res) => {
      toast.success(t("hr.ats.recalculated", { score: res.matchScore }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const offer = useMutation({
    mutationFn: (input: { applicationId: string; salaryQar: number | null; joiningDate: string | null }) =>
      createOffer({
        applicationId: input.applicationId,
        salaryQar: input.salaryQar,
        joiningDate: input.joiningDate,
        issue: true,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.offerIssued"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respond = useMutation({
    mutationFn: (input: { offerId: string; action: "accepted" | "declined" | "expired" }) =>
      respondToOffer({
        offerId: input.offerId,
        action: input.action,
        declineReason: input.action === "declined" ? t("hr.ats.desk.declinedByHr") : null,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.offerResponded"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedule = useMutation({
    mutationFn: (input: { applicationId: string; note: string }) =>
      addApplicationNote({ applicationId: input.applicationId, note: input.note, channel: "in_person" }),
    onSuccess: () => {
      toast.success(t("hr.ats.desk.scheduled"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vacStatus = useMutation({
    mutationFn: (input: { vacancyId: string; status: "on_hold" | "closed" | "cancelled" | "open"; reason: string | null }) =>
      updateVacancyStatus(input),
    onSuccess: () => {
      toast.success(t("hr.jobsAdmin.vacancyUpdated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apps = (pipeline.data?.applications ?? []) as DeskApplication[];
  const vacancyRows = vacancies.data ?? [];

  const departmentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const vacancy of vacancyRows) {
      if (vacancy.departmentId && vacancy.departmentName) map.set(vacancy.departmentId, vacancy.departmentName);
    }
    return map;
  }, [vacancyRows]);

  const departmentForVacancy = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string | null }>();
    for (const vacancy of vacancyRows) {
      map.set(vacancy.id, { id: vacancy.departmentId, name: vacancy.departmentName });
    }
    return map;
  }, [vacancyRows]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const vacancy of vacancyRows) {
      if (vacancy.departmentId) map.set(vacancy.departmentId, vacancy.departmentName ?? vacancy.departmentId);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [vacancyRows]);

  const noteKeys = useMemo(
    () => recruitmentNoteKeysByCandidate(roleMatch.data?.status === "ok" ? roleMatch.data.items : []),
    [roleMatch.data],
  );

  const filterRows = useMemo(
    () =>
      apps.map((app) => {
        const fromVacancy = departmentForVacancy.get(app.vacancyId);
        return {
          app,
          matchScore: app.matchScore,
          vacancyId: app.vacancyId,
          stage: app.stage,
          departmentId: app.departmentId ?? fromVacancy?.id ?? null,
          vacancyStatus: app.vacancyStatus,
          jobTitle: app.jobTitle,
          candidateName: app.candidate?.fullName ?? "",
          skills: app.candidate?.skills ?? null,
          offerStatus: app.offer?.status ?? null,
        };
      }),
    [apps, departmentForVacancy],
  );

  const filtered = useMemo(() => filterRecruitmentRows(filterRows, filters), [filterRows, filters]);

  const visible = useMemo(() => {
    if (tab === "interviews") return filtered.filter((row) => isInterviewStage(row.stage));
    if (tab === "offers") return filtered.filter((row) => isOfferStage(row.stage, row.offerStatus));
    return filtered;
  }, [filtered, tab]);

  const requisitions = useMemo(() => {
    return vacancyRows.filter((vacancy) => {
      if (reqDepartment && vacancy.departmentId !== reqDepartment) return false;
      if (reqStatus && vacancy.status !== reqStatus) return false;
      return true;
    });
  }, [vacancyRows, reqDepartment, reqStatus]);

  const openVacancies = vacancyRows
    .filter((vacancy) => vacancy.status === "open")
    .reduce((sum, vacancy) => sum + (Number.isFinite(vacancy.vacanciesCount) ? vacancy.vacanciesCount : 0), 0);
  const pendingOffers = apps.filter(isPendingOffer).length;
  const unscored = apps.filter((app) => !isAtsReviewed(app.matchScore)).length;

  function moveStage(applicationId: string, toStage: HrApplicationStage) {
    if (toStage === "rejected") {
      const reason = window.prompt(t("hr.ats.rejectReasonPrompt"));
      if (!reason?.trim()) {
        toast.error(t("hr.ats.rejectReasonRequired"));
        return;
      }
      stageChange.mutate({ applicationId, toStage, reason: reason.trim() });
      return;
    }
    stageChange.mutate({ applicationId, toStage });
  }

  function setFilter<K extends keyof RecruitmentFilterInput>(key: K, value: RecruitmentFilterInput[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const candidateTabs = tab !== "requisitions";

  return (
    <CapabilityGate
      capability="recruitment.request"
      fallback={
        <HrShell>
          <p className="text-sm text-muted-foreground">{t("hr.ats.noAccess")}</p>
        </HrShell>
      }
    >
      <HrShell>
        <div className="hr-recruit">
          <header className="hr-recruit__head">
            <div className="min-w-0">
              <p className="hr-recruit__kicker">{t("hr.ats.kicker")}</p>
              <h1 className="hr-recruit__title">{t("hr.ats.desk.title")}</h1>
              <p className="hr-recruit__sub">{t("hr.ats.subtitle")}</p>
            </div>
            <div className="hr-recruit__head-actions">
              <Button type="button" size="sm" variant="outline" onClick={() => setRequisitionOpen(true)}>
                <Plus />
                {t("hr.ats.desk.newRequisition")}
              </Button>
              {canManage ? (
                <Button type="button" size="sm" className="bg-electric text-white hover:bg-electric/90" onClick={() => setComposerOpen(true)}>
                  <Plus />
                  {t("hr.ats.desk.addApplication")}
                </Button>
              ) : null}
            </div>
          </header>

          <p className="hr-recruit__link-row">
            <Link href="/people/hr/onboarding">{t("hr.ats.desk.checklists")}</Link>
          </p>

          <div className="hr-kpi-grid">
            <button type="button" className="hr-recruit__kpi" onClick={() => { setTab("requisitions"); setReqStatus("open"); }}>
              <HrKpiTile label={t("hr.ats.desk.openVacancies")} value={openVacancies} icon={Briefcase} tone="mustard" />
            </button>
            <button type="button" className="hr-recruit__kpi" onClick={() => setTab("candidates")}>
              <HrKpiTile label={t("hr.ats.desk.applications")} value={apps.length} icon={Users} tone="cream" />
            </button>
            <button type="button" className="hr-recruit__kpi" onClick={() => setTab("offers")}>
              <HrKpiTile label={t("hr.ats.desk.pendingOffers")} value={pendingOffers} icon={Handshake} tone="info" />
            </button>
          </div>

          <div className="fec-inner-tabs" role="tablist" aria-label={t("hr.ats.desk.tabsLabel")}>
            {(["requisitions", "candidates", "interviews", "offers"] as const).map((id) => {
              const Icon = id === "requisitions" ? Briefcase : id === "candidates" ? Users : id === "interviews" ? CalendarClock : Handshake;
              return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`recruit-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`recruit-panel-${id}`}
                className={tab === id ? "fec-inner-tab is-active" : "fec-inner-tab"}
                onClick={() => setTab(id)}
              >
                <Icon aria-hidden />
                {t(`hr.ats.desk.tabs.${id}`)}
              </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`recruit-panel-${tab}`} aria-labelledby={`recruit-tab-${tab}`} className="hr-recruit__panel">
            {candidateTabs ? (
              <div className="hr-recruit__work">
                <aside className="hr-recruit__filters">
                  <div className="hr-recruit__pool" role="group" aria-label={t("hr.ats.desk.reviewedTitle")}>
                    <button
                      type="button"
                      className="hr-recruit__pool-btn"
                      aria-pressed={filters.pool === "reviewed"}
                      onClick={() => setFilter("pool", "reviewed")}
                    >
                      {t("hr.ats.desk.poolReviewed")}
                    </button>
                    <button
                      type="button"
                      className="hr-recruit__pool-btn"
                      aria-pressed={filters.pool === "all"}
                      onClick={() => setFilter("pool", "all" satisfies AtsPool)}
                    >
                      {t("hr.ats.desk.poolAll")}
                    </button>
                  </div>
                  <FilterSelect
                    label={t("hr.ats.desk.job")}
                    value={filters.vacancyId}
                    onChange={(value) => setFilter("vacancyId", value)}
                    allLabel={t("hr.ats.desk.allJobs")}
                    options={vacancyRows.map((vacancy) => ({
                      value: vacancy.id,
                      label: [vacancy.jobTitle, vacancy.locationName].filter(Boolean).join(" · "),
                    }))}
                  />
                  <FilterSelect
                    label={t("hr.ats.desk.stage")}
                    value={filters.stage}
                    onChange={(value) => setFilter("stage", value)}
                    allLabel={t("hr.ats.desk.allStages")}
                    options={HR_APPLICATION_STAGES.map((stage) => ({
                      value: stage,
                      label: t(`hr.ats.stages.${stage}`),
                    }))}
                  />
                  <FilterSelect
                    label={t("hr.ats.desk.department")}
                    value={filters.departmentId}
                    onChange={(value) => setFilter("departmentId", value)}
                    allLabel={t("hr.ats.desk.allDepartments")}
                    options={departments.map((department) => ({ value: department.id, label: department.name }))}
                  />
                  <FilterSelect
                    label={t("hr.ats.desk.status")}
                    value={filters.vacancyStatus}
                    onChange={(value) => setFilter("vacancyStatus", value)}
                    allLabel={t("hr.ats.desk.allStatuses")}
                    options={HR_VACANCY_STATUSES.map((status) => ({
                      value: status,
                      label: t(`hr.ats.desk.vacancyStatus.${status}`),
                    }))}
                  />
                  <FilterSelect
                    label={t("hr.ats.desk.band")}
                    value={filters.band}
                    onChange={(value) => setFilter("band", value)}
                    allLabel={t("hr.ats.desk.allBands")}
                    options={ATS_SCORE_BANDS.map((band) => ({
                      value: band,
                      label: t(`hr.ats.desk.bands.${band}`),
                    }))}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="recruit-search">{t("hr.ats.search")}</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="recruit-search"
                        className="ps-9"
                        value={filters.query}
                        onChange={(event) => setFilter("query", event.target.value)}
                        placeholder={t("hr.ats.searchPlaceholder")}
                      />
                    </div>
                  </div>
                </aside>

                <div className="hr-recruit__stream min-w-0">
                  {filters.pool === "reviewed" ? (
                    <div className="hr-recruit__banner">
                      <p className="font-semibold">{t("hr.ats.desk.reviewedTitle")}</p>
                      <p>{t("hr.ats.desk.reviewedHint")}</p>
                      {unscored > 0 ? (
                        <p>
                          {t("hr.ats.desk.hiddenUnscored", { count: unscored })}{" "}
                          <button type="button" className="hr-recruit__text-btn" onClick={() => setFilter("pool", "all")}>
                            {t("hr.ats.desk.showAll")}
                          </button>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="hr-recruit__banner">
                      <p className="font-semibold">{t("hr.ats.desk.poolAll")}</p>
                      <p>{t("hr.ats.desk.allHint")}</p>
                    </div>
                  )}

                  {pipeline.isLoading ? (
                    <p className="text-sm text-muted-foreground">{t("hr.ats.loading")}</p>
                  ) : pipeline.isError || vacancies.isError ? (
                    <p className="text-sm text-destructive">
                      {(pipeline.error ?? vacancies.error) instanceof Error
                        ? (pipeline.error ?? vacancies.error)?.message
                        : t("hr.ats.loading")}
                    </p>
                  ) : !visible.length ? (
                    <div className="hr-recruit__card">
                      <HrEmptyState
                        message={
                          filters.pool === "reviewed"
                            ? t("hr.ats.desk.reviewedEmpty")
                            : t("hr.ats.desk.empty")
                        }
                      />
                      {filters.pool === "reviewed" && unscored > 0 ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setFilter("pool", "all")}>
                          {t("hr.ats.desk.showAll")}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="hr-recruit__cards">
                      {visible.map((row) => {
                        const vacancy = vacancyRows.find((item) => item.id === row.app.vacancyId);
                        const requirement = [
                          vacancy?.gender ? t(`hr.ats.desk.gender.${vacancy.gender}`) : null,
                          vacancy?.locationName,
                          vacancy?.salaryBand ? t("hr.ats.desk.salary", { amount: vacancy.salaryBand }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                        <CandidateCard
                          key={row.app.id}
                          app={row.app}
                          requirement={requirement || null}
                          department={
                            (row.departmentId ? departmentName.get(row.departmentId) : null) ??
                            departmentForVacancy.get(row.app.vacancyId)?.name ??
                            "—"
                          }
                          noteKeys={noteKeys.get(row.app.candidateId) ?? []}
                          tab={tab}
                          canManage={canManage}
                          canViewSalary={canViewSalary}
                          busy={stageChange.isPending || review.isPending || offer.isPending || respond.isPending || schedule.isPending}
                          onStage={(stage) => moveStage(row.app.id, stage)}
                          onReview={() => review.mutate(row.app.id)}
                          onOffer={(salaryQar, joiningDate) =>
                            offer.mutate({ applicationId: row.app.id, salaryQar, joiningDate })
                          }
                          onRespond={(action) => {
                            if (!row.app.offer) return;
                            respond.mutate({ offerId: row.app.offer.id, action });
                          }}
                          onSchedule={(note) => schedule.mutate({ applicationId: row.app.id, note })}
                        />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="hr-recruit__work">
                <aside className="hr-recruit__filters">
                  <FilterSelect
                    label={t("hr.ats.desk.department")}
                    value={reqDepartment}
                    onChange={setReqDepartment}
                    allLabel={t("hr.ats.desk.allDepartments")}
                    options={departments.map((department) => ({ value: department.id, label: department.name }))}
                  />
                  <FilterSelect
                    label={t("hr.ats.desk.status")}
                    value={reqStatus}
                    onChange={setReqStatus}
                    allLabel={t("hr.ats.desk.allStatuses")}
                    options={HR_VACANCY_STATUSES.map((status) => ({
                      value: status,
                      label: t(`hr.ats.desk.vacancyStatus.${status}`),
                    }))}
                  />
                </aside>
                <div className="hr-recruit__stream min-w-0">
                  {vacancies.isLoading ? (
                    <p className="text-sm text-muted-foreground">{t("hr.ats.loading")}</p>
                  ) : !requisitions.length ? (
                    <div className="hr-recruit__card">
                      <HrEmptyState message={t("hr.ats.desk.requisitionEmpty")} />
                    </div>
                  ) : (
                    <div className="hr-recruit__cards">
                      {requisitions.map((vacancy) => (
                        <article key={vacancy.id} className="hr-recruit__card">
                          <div className="hr-recruit__identity">
                            <span className="hr-recruit__mark" aria-hidden>
                              <Briefcase className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <h2 className="hr-recruit__name">{vacancy.jobTitle}</h2>
                              <p className="hr-recruit__meta">
                                {[
                                  vacancy.gender ? t(`hr.ats.desk.gender.${vacancy.gender}`) : null,
                                  vacancy.locationName,
                                  vacancy.salaryBand ? t("hr.ats.desk.salary", { amount: vacancy.salaryBand }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                  [vacancy.departmentName, vacancy.locationName].filter(Boolean).join(" · ") ||
                                  "—"}
                              </p>
                              <p className="hr-recruit__meta">{t("hr.ats.desk.seats", { count: vacancy.vacanciesCount })}</p>
                            </div>
                            <Badge variant={vacancy.status === "open" ? "success" : vacancy.status === "cancelled" ? "destructive" : "warning"}>
                              {t(`hr.ats.desk.vacancyStatus.${vacancy.status}`, { defaultValue: vacancy.status })}
                            </Badge>
                          </div>
                          {canManage ? (
                            <div className="hr-recruit__actions">
                              {vacancy.status !== "open" ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => vacStatus.mutate({ vacancyId: vacancy.id, status: "open", reason: null })}>
                                  {t("hr.ats.desk.reopen")}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const reason = window.prompt(t("hr.jobsAdmin.reason"));
                                  if (reason == null) return;
                                  vacStatus.mutate({ vacancyId: vacancy.id, status: "on_hold", reason: reason || null });
                                }}
                              >
                                {t("hr.jobsAdmin.hold")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const reason = window.prompt(t("hr.jobsAdmin.reason"));
                                  if (reason == null) return;
                                  vacStatus.mutate({ vacancyId: vacancy.id, status: "closed", reason: reason || null });
                                }}
                              >
                                {t("hr.jobsAdmin.close")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const reason = window.prompt(t("hr.jobsAdmin.reason"));
                                  if (reason == null) return;
                                  vacStatus.mutate({ vacancyId: vacancy.id, status: "cancelled", reason: reason || null });
                                }}
                              >
                                {t("hr.jobsAdmin.cancel")}
                              </Button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <ApplicationDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          canViewSalary={canViewSalary}
          vacancies={vacancyRows
            .filter((vacancy) => vacancy.status === "open")
            .map((vacancy) => ({
              id: vacancy.id,
              jobTitle: [vacancy.jobTitle, vacancy.locationName].filter(Boolean).join(" · "),
            }))}
          defaultVacancyId={filters.vacancyId}
          onCreated={invalidate}
        />
        <RequisitionDialog
          open={requisitionOpen}
          onOpenChange={setRequisitionOpen}
          canViewSalary={canViewSalary}
          onCreated={invalidate}
        />
      </HrShell>
    </CapabilityGate>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className="hr-recruit__select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CandidateCard({
  app,
  department,
  requirement,
  noteKeys,
  tab,
  canManage,
  canViewSalary,
  busy,
  onStage,
  onReview,
  onOffer,
  onRespond,
  onSchedule,
}: {
  app: DeskApplication;
  department: string;
  requirement: string | null;
  noteKeys: string[];
  tab: DeskTab;
  canManage: boolean;
  canViewSalary: boolean;
  busy: boolean;
  onStage: (stage: HrApplicationStage) => void;
  onReview: () => void;
  onOffer: (salaryQar: number | null, joiningDate: string | null) => void;
  onRespond: (action: "accepted" | "declined" | "expired") => void;
  onSchedule: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [issuing, setIssuing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [salary, setSalary] = useState("");
  const [joining, setJoining] = useState(app.offer?.joiningDate ?? "");
  const [interviewer, setInterviewer] = useState("");
  const [when, setWhen] = useState("");
  const name = app.candidate?.fullName ?? "—";
  const band = atsScoreBand(app.matchScore);
  const summary = matchSummary(app.matchExplanation);
  const email = visibleContact(app.candidate?.email);
  const phone = visibleContact(app.candidate?.phone);
  const next = nextApplicationStage(app.stage);
  const showIssue = canManage && (app.stage === "selected" || app.stage === "offer_pending" || tab === "offers") && app.offer?.status !== "issued" && app.offer?.status !== "accepted";
  const showRespond = canManage && (app.offer?.status === "issued" || app.offer?.status === "draft");

  return (
    <article className="hr-recruit__card">
      <div className="hr-recruit__identity">
        <span className="hr-recruit__mark" aria-hidden>
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h2 className="hr-recruit__name">
            <Link href={`/people/recruitment/candidates/${app.candidateId}`}>{name}</Link>
          </h2>
          <p className="hr-recruit__meta">
            {[app.jobTitle, department].filter((part) => part && part !== "—").join(" · ") || "—"}
          </p>
          {requirement ? <p className="hr-recruit__meta">{requirement}</p> : null}
          {email || phone ? <p className="hr-recruit__meta">{[email, phone].filter(Boolean).join(" · ")}</p> : null}
        </div>
        <Badge variant={stageVariant(app.stage)}>{t(`hr.ats.stages.${app.stage}`)}</Badge>
      </div>

      <div className="hr-recruit__ats">
        {band ? (
          <div className="hr-recruit__score-line">
            <Badge variant={bandVariant(band)}>{t(`hr.ats.desk.bands.${band}`)}</Badge>
            <span className="hr-recruit__score">{t("hr.ats.desk.scoreLabel", { score: app.matchScore })}</span>
          </div>
        ) : (
          <p className="hr-recruit__meta">{t("hr.ats.desk.unscored")}</p>
        )}
        {band && app.matchScore != null ? (
          <div className="hr-recruit__meter" aria-hidden>
            <span style={{ width: `${Math.max(0, Math.min(100, app.matchScore))}%` }} />
          </div>
        ) : null}
        <p className="hr-recruit__note">
          <span className="font-semibold">{t("hr.ats.desk.atsNote")}. </span>
          {noteKeys.length
            ? noteKeys.slice(0, 2).map((key) => t(key)).join(" ")
            : summary || t("hr.ats.desk.noNote")}
        </p>
        {app.latestNote ? <p className="hr-recruit__meta">{app.latestNote}</p> : null}
        {app.offer ? (
          <p className="hr-recruit__meta">
            {[
              t(`hr.ats.desk.offerStatus.${app.offer.status}`, { defaultValue: app.offer.status }),
              canViewSalary && app.offer.salaryQar != null ? t("hr.ats.desk.salary", { amount: app.offer.salaryQar }) : null,
              app.offer.joiningDate,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {canManage ? (
        <div className="hr-recruit__actions">
          {!isAtsReviewed(app.matchScore) ? (
            <Button type="button" size="sm" className="bg-electric text-white hover:bg-electric/90" disabled={busy} onClick={onReview}>
              {t("hr.ats.desk.runReview")}
            </Button>
          ) : null}
          {next && !isInterviewStage(app.stage) && next !== "offer_issued" ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onStage(next as HrApplicationStage)}>
              {t("hr.ats.desk.advance")}
            </Button>
          ) : null}
          {isInterviewStage(app.stage) || tab === "interviews" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setScheduling((open) => !open)}>
              <CalendarClock />
              {t("hr.ats.desk.schedule")}
            </Button>
          ) : null}
          {showIssue ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setIssuing((open) => !open)}>
              {t("hr.ats.issueOffer")}
            </Button>
          ) : null}
          {showRespond ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRespond("accepted")}>
                {t("hr.ats.acceptOffer")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRespond("declined")}>
                {t("hr.ats.declineOffer")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRespond("expired")}>
                {t("hr.ats.desk.expireOffer")}
              </Button>
            </>
          ) : null}
          <label className="hr-recruit__stage">
            <span>{isInterviewStage(app.stage) ? t("hr.ats.desk.recordResult") : t("hr.ats.stage")}</span>
            <select
              className="hr-recruit__select"
              value={app.stage}
              disabled={busy}
              onChange={(event) => onStage(event.target.value as HrApplicationStage)}
            >
              {HR_APPLICATION_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`hr.ats.stages.${stage}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href={`/people/recruitment/candidates/${app.candidateId}`}>{t("hr.ats.desk.viewCandidate")}</Link>
        </Button>
      )}

      {scheduling ? (
        <form
          className="hr-recruit__inline"
          onSubmit={(event) => {
            event.preventDefault();
            if (!interviewer.trim() || !when) return;
            onSchedule(t("hr.ats.desk.scheduleNote", { interviewer: interviewer.trim(), when }));
            setScheduling(false);
          }}
        >
          <div className="space-y-1">
            <Label>{t("hr.ats.desk.interviewer")}</Label>
            <Input value={interviewer} onChange={(event) => setInterviewer(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.desk.when")}</Label>
            <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={!interviewer.trim() || !when || busy}>
            {t("hr.ats.desk.saveSchedule")}
          </Button>
        </form>
      ) : null}

      {issuing ? (
        <form
          className="hr-recruit__inline"
          onSubmit={(event) => {
            event.preventDefault();
            onOffer(canViewSalary && salary ? Number(salary) : null, joining || null);
            setIssuing(false);
          }}
        >
          {canViewSalary ? (
            <div className="space-y-1">
              <Label>{t("hr.ats.offerSalary")}</Label>
              <Input type="number" value={salary} onChange={(event) => setSalary(event.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>{t("hr.ats.joiningDate")}</Label>
            <Input type="date" value={joining} onChange={(event) => setJoining(event.target.value)} />
          </div>
          <Button type="submit" size="sm" className="bg-electric text-white hover:bg-electric/90" disabled={busy}>
            {t("hr.ats.issueOffer")}
          </Button>
        </form>
      ) : null}
    </article>
  );
}

function ApplicationDialog({
  open,
  onOpenChange,
  canViewSalary,
  vacancies,
  defaultVacancyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewSalary: boolean;
  vacancies: Array<{ id: string; jobTitle: string }>;
  defaultVacancyId: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [vacancyId, setVacancyId] = useState(defaultVacancyId);

  useEffect(() => {
    if (open) setVacancyId(defaultVacancyId);
  }, [open, defaultVacancyId]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<(typeof HR_CANDIDATE_SOURCES)[number]>("other");
  const [skills, setSkills] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [education, setEducation] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [consent, setConsent] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<FileList | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!consent) throw new Error(t("hr.ats.consentRequired"));
      let cvDataBase64: string | null = null;
      let cvFilename: string | null = null;
      let cvContentType: string | undefined;
      let cvText: string | null = null;
      if (cvFile) {
        cvDataBase64 = await fileToBase64(cvFile);
        cvFilename = cvFile.name;
        cvContentType = cvFile.type || "application/pdf";
        if (cvFile.type.startsWith("text/")) cvText = await cvFile.text();
      }
      return createCandidate({
        fullName,
        email: email || null,
        phone: phone || null,
        skills: skills || null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        education: education || null,
        expectedSalaryQar: canViewSalary && expectedSalary ? Number(expectedSalary) : null,
        consent: true as const,
        vacancyId: vacancyId || null,
        cvFilename,
        cvDataBase64,
        cvContentType,
        cvText,
        source: cvFile ? "cv_upload" : source,
      });
    },
    onSuccess: (res) => {
      toast.success(t("hr.ats.created"));
      if (res.duplicates?.length) toast.message(t("hr.ats.duplicateHint", { count: res.duplicates.length }));
      setFullName("");
      setEmail("");
      setPhone("");
      setSkills("");
      setCvFile(null);
      setConsent(false);
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: async () => {
      if (!consent) throw new Error(t("hr.ats.consentRequired"));
      if (!bulkFiles?.length) throw new Error(t("hr.ats.bulkRequired"));
      const files = await Promise.all(
        Array.from(bulkFiles).map(async (file) => ({
          filename: file.name,
          dataBase64: await fileToBase64(file),
          contentType: file.type || "application/pdf",
        })),
      );
      return bulkUploadCandidates({ consent: true as const, vacancyId: vacancyId || null, files });
    },
    onSuccess: (res) => {
      const ok = res.results.filter((row) => row.candidateId).length;
      const fail = res.results.filter((row) => row.error).length;
      toast.success(t("hr.ats.bulkDone", { ok, fail }));
      setBulkFiles(null);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("hr.ats.desk.addApplication")}</DialogTitle>
          <DialogDescription>{t("hr.ats.desk.applicationHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("hr.ats.vacancy")}</Label>
            <select className="hr-recruit__select" value={vacancyId} onChange={(event) => setVacancyId(event.target.value)}>
              <option value="">{t("hr.ats.pickVacancy")}</option>
              {vacancies.map((vacancy) => (
                <option key={vacancy.id} value={vacancy.id}>
                  {vacancy.jobTitle}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.fullName")}</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.desk.source")}</Label>
            <select className="hr-recruit__select" value={source} onChange={(event) => setSource(event.target.value as (typeof HR_CANDIDATE_SOURCES)[number])}>
              {HR_CANDIDATE_SOURCES.map((item) => (
                <option key={item} value={item}>
                  {t(`hr.ats.desk.sources.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.email")}</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.phone")}</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.skills")}</Label>
            <Input value={skills} onChange={(event) => setSkills(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.experience")}</Label>
            <Input type="number" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("hr.ats.education")}</Label>
            <Input value={education} onChange={(event) => setEducation(event.target.value)} />
          </div>
          {canViewSalary ? (
            <div className="space-y-1">
              <Label>{t("hr.ats.expectedSalary")}</Label>
              <Input type="number" value={expectedSalary} onChange={(event) => setExpectedSalary(event.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("hr.ats.cv")}</Label>
            <Input type="file" accept=".pdf,.txt,image/*" onChange={(event) => setCvFile(event.target.files?.[0] ?? null)} />
          </div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>{t("hr.ats.consentLabel")}</span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" className="bg-electric text-white hover:bg-electric/90" disabled={!fullName.trim() || !consent || create.isPending} onClick={() => create.mutate()}>
            {t("hr.ats.create")}
          </Button>
          <Input type="file" multiple accept=".pdf,.txt,image/*" className="max-w-xs" onChange={(event) => setBulkFiles(event.target.files)} />
          <Button type="button" variant="outline" disabled={!consent || !bulkFiles?.length || bulk.isPending} onClick={() => bulk.mutate()}>
            <Upload />
            {t("hr.ats.bulkUpload")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequisitionDialog({
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
  const [gender, setGender] = useState("");
  const [salaryFrom, setSalaryFrom] = useState("");
  const [salaryTo, setSalaryTo] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const lookups = useQuery({
    queryKey: queryKeys.people.hrJobRequests({ view: "desk-lookups" }),
    queryFn: () => listRecruitmentLookups(),
    enabled: open,
    staleTime: STALE.people,
  });

  const submit = useMutation({
    mutationFn: (acknowledgeQuotaWarning: boolean) => {
      const facts = [
        gender ? `Gender requirement: ${gender}.` : null,
        salaryFrom && salaryTo
          ? `Salary budget: ${salaryFrom}–${salaryTo} QAR.`
          : salaryFrom || salaryTo
            ? `Salary budget: ${salaryFrom || salaryTo} QAR.`
            : null,
        description.trim() || null,
      ]
        .filter(Boolean)
        .join(" ");
      const salaryBudget = Number(salaryTo || salaryFrom);
      return submitJobRequest({
        jobTitle,
        locationId: locationId || null,
        departmentId: departmentId || null,
        vacanciesCount: Number(vacancies) || 1,
        requestType: "new",
        jobDescription: facts || null,
        skills: skills.trim() || null,
        salaryBudgetQar: canViewSalary && Number.isFinite(salaryBudget) && salaryBudget > 0 ? salaryBudget : null,
        justification: facts || null,
        acknowledgeQuotaWarning,
      });
    },
    onSuccess: (result) => {
      if (result.requiresAck && result.warning) {
        setQuotaWarning(result.warning);
        toast.warning(result.warning);
        return;
      }
      toast.success(t("hr.jobs.submitted"));
      setQuotaWarning(null);
      setJobTitle("");
      setDescription("");
      setSkills("");
      onCreated();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("hr.ats.desk.newRequisition")}</DialogTitle>
          <DialogDescription>{t("hr.ats.desk.requisitionHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="desk-req-title">{t("hr.jobs.jobTitle")}</Label>
            <Input id="desk-req-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-location">{t("hr.jobs.location")}</Label>
            <select id="desk-req-location" className="hr-recruit__select" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">{t("hr.jobs.pick")}</option>
              {(lookups.data?.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-department">{t("hr.jobs.department")}</Label>
            <select id="desk-req-department" className="hr-recruit__select" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">{t("hr.jobs.pick")}</option>
              {(lookups.data?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-count">{t("hr.jobs.vacancies")}</Label>
            <Input id="desk-req-count" type="number" min={1} value={vacancies} onChange={(event) => setVacancies(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-gender">{t("hr.ats.desk.genderLabel")}</Label>
            <select id="desk-req-gender" className="hr-recruit__select" value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">{t("hr.ats.desk.genderAny")}</option>
              <option value="female">{t("hr.ats.desk.gender.female")}</option>
              <option value="male">{t("hr.ats.desk.gender.male")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-from">{t("hr.ats.desk.salaryFrom")}</Label>
            <Input id="desk-req-from" type="number" min={0} value={salaryFrom} onChange={(event) => setSalaryFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="desk-req-to">{t("hr.ats.desk.salaryTo")}</Label>
            <Input id="desk-req-to" type="number" min={0} value={salaryTo} onChange={(event) => setSalaryTo(event.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="desk-req-skills">{t("hr.jobs.skills")}</Label>
            <Input id="desk-req-skills" value={skills} onChange={(event) => setSkills(event.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="desk-req-jd">{t("hr.jobs.jd")}</Label>
            <textarea
              id="desk-req-jd"
              className="hr-recruit__select min-h-24"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        {quotaWarning ? <p className="text-sm text-muted-foreground">{quotaWarning}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-electric text-white hover:bg-electric/90"
            disabled={jobTitle.trim().length < 2 || submit.isPending}
            onClick={() => submit.mutate(Boolean(quotaWarning))}
          >
            {quotaWarning ? t("hr.jobs.submitAnyway") : t("hr.jobs.submit")}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import {
  addApplicationNote,
  applyCandidateToVacancy,
  changeApplicationStage,
  createOffer,
  getCandidateDetail,
  recalculateApplicationMatch,
  respondToOffer,
} from "@/lib/hr-ats.functions";
import { HR_APPLICATION_STAGES, type HrApplicationStage } from "@/lib/hr-ats";
import { listVacancies } from "@/lib/hr-recruitment.functions";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrAtsCandidateDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canManage = canUserDo(roles, "recruitment.manage");
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");

  const [note, setNote] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [offerSalary, setOfferSalary] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: queryKeys.people.hrAtsCandidate(id),
    queryFn: () => getCandidateDetail({ candidateId: id }),
    staleTime: STALE.people,
  });

  const vacancies = useQuery({
    queryKey: queryKeys.people.hrVacancies({ atsDetail: true }),
    queryFn: () => listVacancies({ status: "open" }),
    staleTime: STALE.people,
    enabled: canManage,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrAtsCandidate(id) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrAts() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrQuota() });
  };

  const apply = useMutation({
    mutationFn: () => applyCandidateToVacancy({ candidateId: id, vacancyId }),
    onSuccess: () => {
      toast.success(t("hr.ats.applied"));
      setVacancyId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stageChange = useMutation({
    mutationFn: (input: { applicationId: string; toStage: HrApplicationStage; reason?: string }) =>
      changeApplicationStage({
        applicationId: input.applicationId,
        toStage: input.toStage,
        reason: input.reason ?? null,
        note: input.reason ?? (note || null),
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.stageUpdated"));
      setNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      addApplicationNote({
        applicationId: selectedAppId!,
        note,
        channel: "note",
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.noteAdded"));
      setNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalc = useMutation({
    mutationFn: (applicationId: string) => recalculateApplicationMatch({ applicationId }),
    onSuccess: (res) => {
      toast.success(t("hr.ats.recalculated", { score: res.matchScore }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const offer = useMutation({
    mutationFn: () =>
      createOffer({
        applicationId: selectedAppId!,
        salaryQar: canViewSalary && offerSalary ? Number(offerSalary) : null,
        joiningDate: joiningDate || null,
        issue: true,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.offerIssued"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respond = useMutation({
    mutationFn: (input: { offerId: string; action: "accepted" | "declined" }) =>
      respondToOffer({
        offerId: input.offerId,
        action: input.action,
        declineReason: input.action === "declined" ? note || null : null,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.offerResponded"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = detail.data?.candidate;
  const apps = detail.data?.applications ?? [];
  const history = detail.data?.history ?? [];
  const offers = detail.data?.offers ?? [];
  const activeAppId = selectedAppId ?? apps[0]?.id ?? null;

  return (
    <CapabilityGate
      capability="recruitment.request"
      fallback={
        <PageHeader
          icon={UserRound}
          kicker={t("hr.ats.kicker")}
          title={t("hr.ats.candidateTitle")}
          subtitle={t("hr.ats.noAccess")}
        />
      }
    >
      <HrShell>
        <PageHeader
          icon={UserRound}
          kicker={t("hr.ats.kicker")}
          title={c?.fullName ?? t("hr.ats.candidateTitle")}
          subtitle={t("hr.ats.candidateSubtitle")}
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link href="/people/recruitment">{t("hr.ats.backPipeline")}</Link>
            </Button>
          }
        />

        {detail.isLoading ? (
          <HrPanel>
            <p className="text-muted-foreground text-sm">{t("hr.ats.loading")}</p>
          </HrPanel>
        ) : !c ? (
          <HrEmptyState message={t("hr.ats.notFound")} />
        ) : (
          <>
            <HrSection title={t("hr.ats.profile")}>
              <HrPanel>
                <dl className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.email")}</dt>
                    <dd>{c.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.phone")}</dt>
                    <dd>{c.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.location")}</dt>
                    <dd>{c.location ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.nationality")}</dt>
                    <dd>{c.nationality ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.qid")}</dt>
                    <dd>{c.qid ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.visa")}</dt>
                    <dd>{c.visaStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.experience")}</dt>
                    <dd>{c.experienceYears ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.education")}</dt>
                    <dd>{c.education ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.skills")}</dt>
                    <dd>{c.skills ?? "—"}</dd>
                  </div>
                  {canViewSalary ? (
                    <div>
                      <dt className="text-muted-foreground">{t("hr.ats.expectedSalary")}</dt>
                      <dd>{c.expectedSalaryQar ?? "—"}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.consent")}</dt>
                    <dd>{c.consentAt ? new Date(c.consentAt).toLocaleString() : "—"}</dd>
                  </div>
                  {c.duplicateOf ? (
                    <div>
                      <dt className="text-muted-foreground">{t("hr.ats.duplicateOf")}</dt>
                      <dd>
                        <Link
                          href={`/people/recruitment/candidates/${c.duplicateOf}`}
                          className="hover:underline"
                        >
                          {c.duplicateOf}
                        </Link>
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">{t("hr.ats.cv")}</dt>
                    <dd>{c.cvFileName ?? c.cvPath ?? "—"}</dd>
                  </div>
                </dl>
              </HrPanel>
            </HrSection>

            {canManage ? (
              <HrSection title={t("hr.ats.applyVacancy")}>
                <HrPanel>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[240px] flex-1 space-y-1">
                      <Label>{t("hr.ats.vacancy")}</Label>
                      <select
                        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                        value={vacancyId}
                        onChange={(e) => setVacancyId(e.target.value)}
                      >
                        <option value="">{t("hr.ats.pickVacancy")}</option>
                        {(vacancies.data ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.jobTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      disabled={!vacancyId || apply.isPending}
                      onClick={() => apply.mutate()}
                    >
                      {t("hr.ats.apply")}
                    </Button>
                  </div>
                </HrPanel>
              </HrSection>
            ) : null}

            <HrSection title={t("hr.ats.applications")}>
              <HrPanel>
                {!apps.length ? (
                  <HrEmptyState message={t("hr.ats.noApplications")} />
                ) : (
                  <ul className="space-y-3">
                    {apps.map((a) => {
                      const expl = a.matchExplanation as {
                        summary?: string;
                        matchedSkills?: string[];
                        missingSkills?: string[];
                      };
                      return (
                        <li key={a.id} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={
                                activeAppId === a.id
                                  ? "font-semibold underline"
                                  : "font-medium hover:underline"
                              }
                              onClick={() => setSelectedAppId(a.id)}
                            >
                              {a.jobTitle ?? a.vacancyId}
                            </button>
                            <Badge variant="secondary">{t(`hr.ats.stages.${a.stage}`)}</Badge>
                            {a.matchScore != null ? (
                              <Badge variant="outline">
                                {t("hr.ats.match")}: {a.matchScore}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground mt-2 text-xs">{expl.summary ?? "—"}</p>
                          {expl.matchedSkills?.length || expl.missingSkills?.length ? (
                            <p className="mt-1 text-xs">
                              {t("hr.ats.matched")}: {(expl.matchedSkills ?? []).join(", ") || "—"}
                              {" · "}
                              {t("hr.ats.missing")}: {(expl.missingSkills ?? []).join(", ") || "—"}
                            </p>
                          ) : null}
                          {canManage ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <select
                                className="border-input bg-background h-8 rounded border px-2 text-xs"
                                value={a.stage}
                                onChange={(e) => {
                                  const toStage = e.target.value as HrApplicationStage;
                                  if (toStage === "rejected") {
                                    const reason = window.prompt(t("hr.ats.rejectReasonPrompt"));
                                    if (!reason?.trim()) {
                                      toast.error(t("hr.ats.rejectReasonRequired"));
                                      return;
                                    }
                                    stageChange.mutate({
                                      applicationId: a.id,
                                      toStage,
                                      reason,
                                    });
                                    return;
                                  }
                                  stageChange.mutate({ applicationId: a.id, toStage });
                                }}
                              >
                                {HR_APPLICATION_STAGES.map((s) => (
                                  <option key={s} value={s}>
                                    {t(`hr.ats.stages.${s}`)}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => recalc.mutate(a.id)}
                              >
                                {t("hr.ats.recalc")}
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </HrPanel>
            </HrSection>

            {canManage && activeAppId ? (
              <HrSection title={t("hr.ats.comms")}>
                <HrPanel>
                  <div className="space-y-2">
                    <Label>{t("hr.ats.note")}</Label>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!note.trim() || addNote.isPending}
                        onClick={() => {
                          setSelectedAppId(activeAppId);
                          addNote.mutate();
                        }}
                      >
                        {t("hr.ats.addNote")}
                      </Button>
                    </div>
                  </div>
                  {canViewSalary ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>{t("hr.ats.offerSalary")}</Label>
                        <Input
                          type="number"
                          value={offerSalary}
                          onChange={(e) => setOfferSalary(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("hr.ats.joiningDate")}</Label>
                        <Input
                          type="date"
                          value={joiningDate}
                          onChange={(e) => setJoiningDate(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={offer.isPending}
                          onClick={() => {
                            setSelectedAppId(activeAppId);
                            offer.mutate();
                          }}
                        >
                          {t("hr.ats.issueOffer")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {offers.length ? (
                    <ul className="mt-4 space-y-2 text-sm">
                      {offers.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                          <Badge>{o.status}</Badge>
                          {canViewSalary && o.salaryQar != null ? <span>{o.salaryQar} QAR</span> : null}
                          {o.joiningDate ? <span>{o.joiningDate}</span> : null}
                          {o.status === "issued" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => respond.mutate({ offerId: o.id, action: "accepted" })}
                              >
                                {t("hr.ats.acceptOffer")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => respond.mutate({ offerId: o.id, action: "declined" })}
                              >
                                {t("hr.ats.declineOffer")}
                              </Button>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </HrPanel>
              </HrSection>
            ) : null}

            <HrSection title={t("hr.ats.history")}>
              <HrPanel>
                {!history.length ? (
                  <HrEmptyState message={t("hr.ats.noHistory")} />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {history.map((h) => (
                      <li key={h.id} className="border-b pb-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{h.channel ?? "note"}</Badge>
                          <span>
                            {h.fromStage && h.fromStage !== h.toStage
                              ? `${t(`hr.ats.stages.${h.fromStage}`, { defaultValue: h.fromStage })} → `
                              : ""}
                            {t(`hr.ats.stages.${h.toStage}`, { defaultValue: h.toStage })}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {new Date(h.actedAt).toLocaleString()}
                          </span>
                        </div>
                        {h.note ? <p className="text-muted-foreground mt-1 text-xs">{h.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </HrPanel>
            </HrSection>
          </>
        )}
      </HrShell>
    </CapabilityGate>
  );
}

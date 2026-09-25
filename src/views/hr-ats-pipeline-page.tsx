"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KanbanSquare, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserRoles } from "@/hooks/use-auth";
import {
  bulkUploadCandidates,
  changeApplicationStage,
  createCandidate,
  listAtsPipeline,
} from "@/lib/hr-ats.functions";
import { HR_APPLICATION_STAGES, type HrApplicationStage } from "@/lib/hr-ats";
import { listVacancies } from "@/lib/hr-recruitment.functions";
import { canUserDo } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const BOARD_STAGES: HrApplicationStage[] = [
  "new",
  "cv_screened",
  "shortlisted",
  "hr_interview",
  "technical_interview",
  "final_interview",
  "selected",
  "offer_pending",
  "offer_issued",
  "on_hold",
  "rejected",
  "talent_pool",
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function HrAtsPipelinePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canManage = canUserDo(roles, "recruitment.manage");
  const canViewSalary = canUserDo(roles, "recruitment.view_salary_budget");

  const [vacancyId, setVacancyId] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "list">("board");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [education, setEducation] = useState("");
  const [location, setLocation] = useState("");
  const [qid, setQid] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [consent, setConsent] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<FileList | null>(null);

  const vacancies = useQuery({
    queryKey: queryKeys.people.hrVacancies({ ats: true }),
    queryFn: () => listVacancies({ status: "open" }),
    staleTime: STALE.people,
  });

  const pipeline = useQuery({
    queryKey: queryKeys.people.hrAts({ vacancyId, q }),
    queryFn: () =>
      listAtsPipeline({
        vacancyId: vacancyId || null,
        q: q || null,
      }),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrAts() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrQuota() });
  };

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
        if (cvFile.type.startsWith("text/")) {
          cvText = await cvFile.text();
        }
      }
      return createCandidate({
        fullName,
        email: email || null,
        phone: phone || null,
        skills: skills || null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        education: education || null,
        location: location || null,
        qid: qid || null,
        expectedSalaryQar:
          canViewSalary && expectedSalary ? Number(expectedSalary) : null,
        consent: true as const,
        vacancyId: vacancyId || null,
        cvFilename,
        cvDataBase64,
        cvContentType,
        cvText,
        source: cvFile ? "cv_upload" : "manual",
      });
    },
    onSuccess: (res) => {
      toast.success(t("hr.ats.created"));
      if (res.duplicates?.length) {
        toast.message(t("hr.ats.duplicateHint", { count: res.duplicates.length }));
      }
      setFullName("");
      setEmail("");
      setPhone("");
      setSkills("");
      setCvFile(null);
      setConsent(false);
      invalidate();
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
      return bulkUploadCandidates({
        consent: true as const,
        vacancyId: vacancyId || null,
        files,
      });
    },
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.candidateId).length;
      const fail = res.results.filter((r) => r.error).length;
      toast.success(t("hr.ats.bulkDone", { ok, fail }));
      setBulkFiles(null);
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
        note: input.reason ?? null,
      }),
    onSuccess: () => {
      toast.success(t("hr.ats.stageUpdated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apps = useMemo(() => pipeline.data?.applications ?? [], [pipeline.data?.applications]);
  const byStage = useMemo(() => {
    const map = Object.fromEntries(BOARD_STAGES.map((s) => [s, [] as typeof apps])) as Record<
      string,
      typeof apps
    >;
    for (const a of apps) {
      if (map[a.stage]) map[a.stage]!.push(a);
    }
    return map;
  }, [apps]);

  return (
    <CapabilityGate
      capability="recruitment.request"
      fallback={
        <FecPageHeader
          icon={KanbanSquare}
          kicker={t("hr.ats.kicker")}
          title={t("hr.ats.title")}
          subtitle={t("hr.ats.noAccess")}
        />
      }
    >
      <HrShell>
        <FecPageHeader
          icon={KanbanSquare}
          kicker={t("hr.ats.kicker")}
          title={t("hr.ats.title")}
          subtitle={t("hr.ats.subtitle")}
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link href="/people/recruitment/jobs">{t("hr.ats.linkJobs")}</Link>
            </Button>
          }
        />

        <HrPanel>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label>{t("hr.ats.vacancy")}</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={vacancyId}
                onChange={(e) => setVacancyId(e.target.value)}
              >
                <option value="">{t("hr.ats.allVacancies")}</option>
                {(vacancies.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.jobTitle} ({v.locationName ?? "—"})
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label>{t("hr.ats.search")}</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("hr.ats.searchPlaceholder")}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={view === "board" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("board")}
              >
                {t("hr.ats.board")}
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("list")}
              >
                {t("hr.ats.list")}
              </Button>
            </div>
          </div>
        </HrPanel>

        {canManage ? (
          <HrSection title={t("hr.ats.addCandidate")}>
            <HrPanel>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>{t("hr.ats.fullName")}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.email")}</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.phone")}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.skills")}</Label>
                  <Input value={skills} onChange={(e) => setSkills(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.experience")}</Label>
                  <Input
                    type="number"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.education")}</Label>
                  <Input value={education} onChange={(e) => setEducation(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.location")}</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("hr.ats.qid")}</Label>
                  <Input value={qid} onChange={(e) => setQid(e.target.value)} />
                </div>
                {canViewSalary ? (
                  <div className="space-y-1">
                    <Label>{t("hr.ats.expectedSalary")}</Label>
                    <Input
                      type="number"
                      value={expectedSalary}
                      onChange={(e) => setExpectedSalary(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>{t("hr.ats.cv")}</Label>
                  <Input
                    type="file"
                    accept=".pdf,.txt,image/*"
                    onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{t("hr.ats.consentLabel")}</span>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!fullName.trim() || !consent || create.isPending}
                  onClick={() => create.mutate()}
                >
                  {t("hr.ats.create")}
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.txt,image/*"
                    className="max-w-xs"
                    onChange={(e) => setBulkFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!consent || !bulkFiles?.length || bulk.isPending}
                    onClick={() => bulk.mutate()}
                  >
                    <Upload className="mr-1 size-4" />
                    {t("hr.ats.bulkUpload")}
                  </Button>
                </div>
              </div>
            </HrPanel>
          </HrSection>
        ) : null}

        <HrSection title={t("hr.ats.pipeline")}>
          {pipeline.isLoading ? (
            <HrPanel>
              <p className="text-muted-foreground text-sm">{t("hr.ats.loading")}</p>
            </HrPanel>
          ) : !apps.length ? (
            <HrPanel>
              <HrEmptyState message={t("hr.ats.empty")} />
            </HrPanel>
          ) : view === "board" ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {BOARD_STAGES.map((stage) => (
                <div
                  key={stage}
                  className="bg-muted/40 min-w-[220px] flex-1 rounded-lg border p-2"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium tracking-wide uppercase">
                      {t(`hr.ats.stages.${stage}`)}
                    </p>
                    <Badge variant="secondary">{byStage[stage]?.length ?? 0}</Badge>
                  </div>
                  <div className="space-y-2">
                    {(byStage[stage] ?? []).map((a) => (
                      <div key={a.id} className="bg-background space-y-1 rounded-md border p-2 text-sm">
                        <Link
                          href={`/people/recruitment/candidates/${a.candidateId}`}
                          className="font-medium hover:underline"
                        >
                          {a.candidate?.fullName ?? "—"}
                        </Link>
                        <p className="text-muted-foreground text-xs">{a.jobTitle}</p>
                        {a.matchScore != null ? (
                          <p
                            className="text-xs"
                            title={String(
                              (a.matchExplanation as { summary?: string })?.summary ?? "",
                            )}
                          >
                            {t("hr.ats.match")}: {a.matchScore}
                          </p>
                        ) : null}
                        {canManage ? (
                          <select
                            className="border-input bg-background h-7 w-full rounded border px-1 text-xs"
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
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <HrPanel>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">{t("hr.ats.fullName")}</th>
                      <th className="p-2">{t("hr.ats.vacancy")}</th>
                      <th className="p-2">{t("hr.ats.stage")}</th>
                      <th className="p-2">{t("hr.ats.match")}</th>
                      <th className="p-2">{t("hr.ats.explanation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((a) => (
                      <tr key={a.id} className="border-b">
                        <td className="p-2">
                          <Link
                            href={`/people/recruitment/candidates/${a.candidateId}`}
                            className="hover:underline"
                          >
                            {a.candidate?.fullName ?? "—"}
                          </Link>
                        </td>
                        <td className="p-2">{a.jobTitle}</td>
                        <td className="p-2">{t(`hr.ats.stages.${a.stage}`)}</td>
                        <td className="p-2">{a.matchScore ?? "—"}</td>
                        <td className="text-muted-foreground max-w-md p-2 text-xs">
                          {String((a.matchExplanation as { summary?: string })?.summary ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HrPanel>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

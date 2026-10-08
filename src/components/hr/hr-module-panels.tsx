"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askHrCopilot,
  getDocumentNotes,
  getHrActionCenter,
  getOnboardingNotes,
  getPayrollReview,
  getPerformanceNotes,
  getRecruitmentMatch,
  getTrainingGaps,
  getWarningNotes,
  getWorkforceNotes,
  getEngagementSummary,
} from "@/lib/hr-assist/read-modules.functions";
import { listPayrollPeriods } from "@/lib/hr-payroll.functions";
import { explainHrReport } from "@/lib/hr-assist/report-notes";
import { answerEssQuestion, type EssBalance, type EssDocument } from "@/lib/hr-assist/ess-answers";
import { buildCommandInsights } from "@/lib/hr-assist/command-insights";
import type { CopilotAnswer } from "@/lib/hr-assist/copilot";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

import { HrReviewPanel } from "./hr-review-panel";

const DISMISS_KEY = "fec-hr-assist-dismissed";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function PayrollReviewPanel({ periodId }: { periodId: string }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "payroll", periodId }),
    queryFn: () => getPayrollReview({ periodId }),
    enabled: Boolean(periodId),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.payroll.title")}
      hint={t("hrAssist.payroll.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyPayroll")}
    />
  );
}

export function PayrollQueuePanel() {
  const { t } = useTranslation();
  const periods = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods(),
    queryFn: () => listPayrollPeriods({ status: "all" }),
    staleTime: STALE.people,
  });
  const periodId = periods.data?.[0]?.id;
  if (periodId) return <PayrollReviewPanel periodId={periodId} />;
  return (
    <HrReviewPanel
      title={t("hrAssist.payroll.title")}
      hint={t("hrAssist.payroll.hint")}
      queryState={periods.isLoading ? "loading" : periods.isError ? "error" : "ready"}
      result={periods.isSuccess ? { status: "empty", items: [] } : null}
      emptyLabel={t("hrAssist.emptyPayroll")}
    />
  );
}

export function RecruitmentMatchPanel({ vacancyId }: { vacancyId?: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "recruitment", vacancyId: vacancyId || null }),
    queryFn: () => getRecruitmentMatch({ vacancyId: vacancyId || null }),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.recruitment.title")}
      hint={t("hrAssist.recruitment.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyRecruitment")}
    />
  );
}

export function OnboardingNotesPanel() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "onboarding" }),
    queryFn: () => getOnboardingNotes({}),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.onboarding.title")}
      hint={t("hrAssist.onboarding.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyOnboarding")}
    />
  );
}

export function PerformanceNotesPanel() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "performance" }),
    queryFn: () => getPerformanceNotes({}),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.performance.title")}
      hint={t("hrAssist.performance.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyPerformance")}
    />
  );
}

export function TrainingGapPanel({ locationId }: { locationId?: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "training", locationId: locationId || null }),
    queryFn: () => getTrainingGaps({ locationId: locationId || null }),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.training.title")}
      hint={t("hrAssist.training.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyTraining")}
    />
  );
}

export function DocumentNotesPanel({ locationId }: { locationId?: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "documents", locationId: locationId || null }),
    queryFn: () => getDocumentNotes({ locationId: locationId || null }),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.documents.title")}
      hint={t("hrAssist.documents.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyDocuments")}
    />
  );
}

export function WarningNotesPanel({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const { t } = useTranslation();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
  const from = dateFrom || today.slice(0, 4) + "-01-01";
  const to = dateTo || today;
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "warnings", dateFrom: from, dateTo: to }),
    queryFn: () => getWarningNotes({ dateFrom: from, dateTo: to }),
    enabled: Boolean(from && to),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.warnings.title")}
      hint={t("hrAssist.warnings.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyWarnings")}
    />
  );
}

export function WorkforceNotesPanel({
  locationId,
  dateFrom,
  dateTo,
}: {
  locationId?: string | null;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "workforce", locationId: locationId || null, dateFrom, dateTo }),
    queryFn: () => getWorkforceNotes({ locationId: locationId || null, dateFrom, dateTo }),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.workforce.title")}
      hint={t("hrAssist.workforce.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyWorkforce")}
    />
  );
}

export function ReportExplainPanel({ reportId }: { reportId: string }) {
  const { t } = useTranslation();
  const result = explainHrReport(reportId);
  return (
    <HrReviewPanel
      title={t("hrAssist.reports.title")}
      hint={t("hrAssist.reports.hint")}
      queryState="ready"
      result={result}
      emptyLabel={t("hrAssist.emptyReport")}
    />
  );
}

export function HrCopilotPanel({
  locationId,
  dateFrom,
  dateTo,
}: {
  locationId?: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "copilot", question: asked, locationId: locationId || null, dateFrom, dateTo }),
    queryFn: () => askHrCopilot({ question: asked, locationId: locationId || null, dateFrom, dateTo }),
    enabled: Boolean(asked && dateFrom && dateTo),
    staleTime: STALE.people,
  });
  const answer = query.data as CopilotAnswer | undefined;
  const hint = answer
    ? `${t("hrAssist.copilot.hint")} ${t("hrAssist.source")}: ${answer.source || "—"}. ${t("hrAssist.filtersLabel")}: ${answer.filters}. ${dateFrom}–${dateTo}.`
    : t("hrAssist.copilot.hint");
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAsked(question.trim());
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("hrAssist.copilot.ask")}
          aria-label={t("hrAssist.copilot.ask")}
          className="min-w-[16rem] flex-1"
        />
        <Button type="submit" variant="secondary" disabled={!question.trim()}>
          {t("hrAssist.copilot.title")}
        </Button>
      </form>
      <HrReviewPanel
        title={t("hrAssist.copilot.title")}
        hint={hint}
        queryState={!asked ? "ready" : query.isLoading ? "loading" : query.isError ? "error" : "ready"}
        result={asked ? answer : null}
        emptyLabel={t("hrAssist.emptyCopilot")}
      />
    </div>
  );
}

export function HrActionCenter({
  locationId,
  dateFrom,
  dateTo,
}: {
  locationId?: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "actions", locationId: locationId || null, dateFrom, dateTo }),
    queryFn: () => getHrActionCenter({ locationId: locationId || null, dateFrom, dateTo }),
    enabled: Boolean(dateFrom && dateTo),
    staleTime: STALE.people,
  });
  const visible = query.data?.items.filter((item) => !dismissed.includes(item.id)) ?? [];
  const result = query.data
    ? { status: visible.length ? ("ok" as const) : ("empty" as const), items: visible }
    : query.data;
  return (
    <div className="space-y-2">
      <HrReviewPanel
        title={t("hrAssist.actions.title")}
        hint={t("hrAssist.actions.hint")}
        queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
        result={result}
        emptyLabel={t("hrAssist.emptyActions")}
        onDismiss={(id) => {
          const next = [...dismissed, id];
          setDismissed(next);
          window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
        }}
      />
    </div>
  );
}

export function EngagementSummaryPanel({
  locationId,
  dateFrom,
  dateTo,
}: {
  locationId?: string | null;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.hrAssist({ view: "engagement", locationId: locationId || null, dateFrom, dateTo }),
    queryFn: () => getEngagementSummary({ locationId: locationId || null, dateFrom, dateTo }),
    staleTime: STALE.people,
  });
  return (
    <HrReviewPanel
      title={t("hrAssist.engagement.title")}
      hint={t("hrAssist.engagement.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyEngagement")}
    />
  );
}

export function CommandInsightsPanel({
  queryState,
  counts,
}: {
  queryState: "loading" | "error" | "ready";
  counts: {
    periodFrom: string;
    periodTo: string;
    today: string;
    headcount: number | null;
    onLeaveToday: number | null;
    expiredDocs: number | null;
    expiringDocs: number | null;
    pendingLeave: number | null;
    presentToday: number | null;
  } | null;
}) {
  const { t } = useTranslation();
  const result = counts ? buildCommandInsights(counts) : null;
  return (
    <HrReviewPanel
      title={t("hrAssist.command.title")}
      hint={t("hrAssist.command.hint")}
      queryState={queryState}
      result={result}
      emptyLabel={t("hrAssist.emptyCommand")}
    />
  );
}

export function EssAnswersPanel({
  year,
  balances,
  documents,
  ready,
}: {
  year: number;
  balances: EssBalance[];
  documents: EssDocument[];
  ready: boolean;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const result = asked ? answerEssQuestion({ question: asked, year, balances, documents }) : null;
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAsked(question.trim());
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("hrAssist.ess.ask")}
          aria-label={t("hrAssist.ess.ask")}
          className="min-w-[16rem] flex-1"
          disabled={!ready}
        />
        <Button type="submit" variant="secondary" disabled={!ready || !question.trim()}>
          {t("hrAssist.ess.title")}
        </Button>
      </form>
      <HrReviewPanel
        title={t("hrAssist.ess.title")}
        hint={t("hrAssist.ess.hint")}
        queryState={ready ? "ready" : "loading"}
        result={result}
        emptyLabel={t("hrAssist.emptyEss")}
      />
    </div>
  );
}

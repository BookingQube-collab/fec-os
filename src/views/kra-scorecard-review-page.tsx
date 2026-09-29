"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { KraSiteSopList, KraSopCodeLinks } from "@/components/people/kra-site-sops";
import { FecLoader, FecPageHeader } from "@/components/fec";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { getKraScorecard, saveKraScorecard } from "@/lib/kra-scorecard.functions";
import type { KraReviewDetail } from "@/lib/kra-scorecard/model";
import {
  KRA_CRITICAL_STATUSES,
  KRA_LINE_STATUSES,
  KRA_ROLES,
  activeWeight,
  scoreReview,
  type KraCriticalStatus,
  type KraLineStatus,
  type KraRole,
} from "@/lib/kra-scorecard/score";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type DraftLine = KraReviewDetail["lines"][number];

export default function KraScorecardReviewPage() {
  const params = useParams<{ id: string }>();
  if (!params.id) return null;
  return <KraScorecardReview reviewId={params.id} />;
}

function KraScorecardReview({ reviewId }: { reviewId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const review = useQuery({
    queryKey: queryKeys.people.kraReview(reviewId),
    queryFn: () => getKraScorecard({ id: reviewId }),
    staleTime: STALE.people,
  });
  const [draft, setDraft] = useState<KraReviewDetail | null>(null);
  const [markApproved, setMarkApproved] = useState(false);

  useEffect(() => {
    if (review.data) setDraft(review.data);
  }, [review.data]);

  const live = useMemo(() => {
    if (!draft) return null;
    const weighted = draft.lines.map((line) => ({
      ...line,
      activeWeight: activeWeight(
        draft.role,
        line.weightCashier,
        line.weightAttendant,
        line.weightSupervisor,
        draft.cashierShare,
      ),
    }));
    const scored = scoreReview(
      {
        employeeLinked: true,
        reviewPeriod: draft.reviewPeriod,
        reviewerName: draft.reviewerName,
        assignedPost: draft.assignedPost,
        role: draft.role,
        cashierShare: draft.cashierShare,
        criticalStatus: draft.criticalStatus,
      },
      weighted,
    );
    return { weighted, ...scored, checks: scored.lines };
  }, [draft]);

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error(t("kraScorecard.empty"));
      return saveKraScorecard({
        id: draft.id,
        reviewPeriod: draft.reviewPeriod,
        reviewerName: draft.reviewerName,
        assignedPost: draft.assignedPost,
        role: draft.role,
        cashierShare: draft.cashierShare,
        criticalStatus: draft.criticalStatus,
        criticalEvidence: draft.criticalEvidence,
        agreedAction: draft.agreedAction,
        followUp: draft.followUp,
        reviewerApprovalNote: draft.reviewerApprovalNote,
        markReviewerApproved: markApproved,
        lines: draft.lines.map((line) => ({
          id: line.id,
          status: line.status,
          actualResult: line.actualResult,
          evidence: line.evidence,
          rating: line.rating,
        })),
      });
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setMarkApproved(false);
      toast.success(t("kraScorecard.save"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.kraScorecards() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.kraReview(reviewId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function patchLine(itemId: string, patch: Partial<DraftLine>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)),
          }
        : current,
    );
  }

  if (review.isLoading || !draft || !live) {
    return (
      <HrShell>
        {review.isError ? (
          <p className="text-sm text-muted-foreground">{(review.error as Error).message}</p>
        ) : (
          <div className="flex justify-center py-10">
            <FecLoader density="page" label={t("common.loading")} />
          </div>
        )}
      </HrShell>
    );
  }

  return (
    <HrShell>
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/people/kra">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("kraScorecard.back")}
        </Link>
      </Button>
      <FecPageHeader
        title={`${draft.staffName}${draft.employeeCode ? ` · ${draft.employeeCode}` : ""}`}
        subtitle={`${draft.templateCode} · ${draft.brand} · ${draft.placeName}`}
      />
      <div className="flex flex-wrap gap-2">
        <Badge>{live.readiness}</Badge>
        <Badge variant="muted">
          {t("kraScorecard.score")}: {live.score ?? "—"}
        </Badge>
        <Badge variant="muted">{live.classification}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{draft.baselineNote}</p>
      <KraSiteSopList sops={draft.sops} />

      <HrPanel>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{t("kraScorecard.period")}</Label>
            <Input value={draft.reviewPeriod} onChange={(event) => setDraft({ ...draft, reviewPeriod: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.reviewer")}</Label>
            <Input value={draft.reviewerName} onChange={(event) => setDraft({ ...draft, reviewerName: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.post")}</Label>
            <Input value={draft.assignedPost} onChange={(event) => setDraft({ ...draft, assignedPost: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.role")}</Label>
            <SearchableSelect
              value={draft.role}
              onValueChange={(value) => setDraft({ ...draft, role: value as KraRole })}
              options={KRA_ROLES.map((value) => ({ value, label: value }))}
            />
          </div>
          {draft.role === "Dual Role" ? (
            <div>
              <Label>{t("kraScorecard.cashierShare")}</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft.cashierShare}
                onChange={(event) => setDraft({ ...draft, cashierShare: Number(event.target.value) })}
              />
            </div>
          ) : null}
          <div>
            <Label>{t("kraScorecard.critical")}</Label>
            <SearchableSelect
              value={draft.criticalStatus}
              onValueChange={(value) => setDraft({ ...draft, criticalStatus: value as KraCriticalStatus })}
              options={KRA_CRITICAL_STATUSES.map((value) => ({ value, label: value }))}
            />
          </div>
        </div>
      </HrPanel>

      <div className="space-y-3">
        {draft.lines.map((line, index) => {
          const weight = live.weighted[index]?.activeWeight ?? line.activeWeight;
          const check = live.checks[index];
          return (
            <HrPanel key={line.itemId}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {line.itemNo}. {line.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <KraSopCodeLinks reference={line.sopReference} sops={draft.sops} /> · {t("kraScorecard.weight")} {weight}
                  </p>
                </div>
                <Badge variant="muted">
                  {check?.rowCheck} · {check?.points ?? 0} pts
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{line.targetStandard}</p>
              {weight === 0 ? <p className="mt-2 text-xs text-amber-700">{t("kraScorecard.zeroWeight")}</p> : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>{t("kraScorecard.status")}</Label>
                  <SearchableSelect
                    value={line.status}
                    onValueChange={(value) =>
                      patchLine(line.itemId, {
                        status: value as KraLineStatus,
                        rating: value === "N/A" ? null : line.rating,
                      })
                    }
                    options={KRA_LINE_STATUSES.map((value) => ({ value, label: value }))}
                  />
                </div>
                <div>
                  <Label>{t("kraScorecard.rating")}</Label>
                  <SearchableSelect
                    value={line.rating == null ? "" : String(line.rating)}
                    onValueChange={(value) => patchLine(line.itemId, { rating: value ? Number(value) : null })}
                    options={[
                      { value: "", label: "—" },
                      ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) })),
                    ]}
                  />
                </div>
                <div>
                  <Label>{t("kraScorecard.actual")}</Label>
                  <Textarea value={line.actualResult} onChange={(event) => patchLine(line.itemId, { actualResult: event.target.value })} />
                </div>
                <div>
                  <Label>{t("kraScorecard.evidence")}</Label>
                  <Textarea value={line.evidence} onChange={(event) => patchLine(line.itemId, { evidence: event.target.value })} />
                </div>
              </div>
            </HrPanel>
          );
        })}
      </div>

      <HrPanel>
        <div className="grid gap-3">
          <div>
            <Label>{t("kraScorecard.criticalEvidence")}</Label>
            <Textarea value={draft.criticalEvidence} onChange={(event) => setDraft({ ...draft, criticalEvidence: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.agreedAction")}</Label>
            <Textarea value={draft.agreedAction} onChange={(event) => setDraft({ ...draft, agreedAction: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.followUp")}</Label>
            <Textarea value={draft.followUp} onChange={(event) => setDraft({ ...draft, followUp: event.target.value })} />
          </div>
          <div>
            <Label>{t("kraScorecard.reviewerApproval")}</Label>
            <Textarea
              value={draft.reviewerApprovalNote}
              onChange={(event) => setDraft({ ...draft, reviewerApprovalNote: event.target.value })}
            />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={markApproved} onChange={(event) => setMarkApproved(event.target.checked)} />
              {t("kraScorecard.markApproved")}
            </label>
            {draft.reviewerApprovedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">{draft.reviewerApprovedAt}</p>
            ) : null}
          </div>
          {draft.employeeAckAt ? (
            <p className="text-sm text-muted-foreground">
              {t("kraScorecard.ack")}: {draft.employeeAckNote} · {draft.employeeAckAt}
            </p>
          ) : null}
        </div>
        <Button className="mt-3" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("kraScorecard.save")}
        </Button>
      </HrPanel>
    </HrShell>
  );
}

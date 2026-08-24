"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getEvaluation,
  recalculateEvaluation,
  saveKpiActual,
  transitionEvaluation,
} from "@/lib/performance.functions";
import { queryKeys } from "@/lib/query-keys";

export default function PerformanceEvaluationDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [comments, setComments] = useState("");
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({});

  const detailQ = useQuery({
    queryKey: queryKeys.performance.evaluation(id),
    queryFn: () => getEvaluation({ id }),
    enabled: !!id,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.performance.evaluation(id) });

  const recalc = useMutation({
    mutationFn: () => recalculateEvaluation({ evaluationId: id }),
    onSuccess: (r) => {
      toast.success(
        t("performance.evaluations.recalculated", {
          score: r.total.toFixed(1),
          filled: r.autoFilled,
        }),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transition = useMutation({
    mutationFn: (toStatus: "draft" | "supervisor_review" | "manager_review" | "employee_ack" | "finalized" | "cancelled") =>
      transitionEvaluation({ evaluationId: id, toStatus, comments: comments || null }),
    onSuccess: (r) => {
      toast.success(t("performance.evaluations.transitioned", { status: r.status }));
      setComments("");
      invalidate();
      void qc.invalidateQueries({ queryKey: queryKeys.performance.evaluations({}) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveActual = useMutation({
    mutationFn: (employeeKpiId: string) => {
      const cycle = detailQ.data?.cycle;
      if (!cycle) throw new Error("Missing cycle");
      const raw = actualDrafts[employeeKpiId];
      const actualValue = Number(raw);
      if (!Number.isFinite(actualValue)) throw new Error(t("performance.evaluations.invalidActual"));
      return saveKpiActual({
        employeeKpiId,
        actualValue,
        periodStart: cycle.period_start,
        periodEnd: cycle.period_end,
      });
    },
    onSuccess: () => {
      toast.success(t("performance.evaluations.actualSaved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detailQ.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!detailQ.data) {
    return <p className="text-sm text-muted-foreground">{t("performance.evaluations.notFound")}</p>;
  }

  const { evaluation, staff, cycle, kras, kpis, actuals, reviews, allowedNext } = detailQ.data;
  const actualMap = new Map(actuals.map((a) => [a.employee_kpi_id, a]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/people/performance">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("performance.back")}
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{staff?.full_name}</h1>
          <p className="text-xs text-muted-foreground">
            {staff?.employee_code} · {staff?.job_title ?? "—"} · {cycle?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {t(`performance.status.${evaluation.status}`, { defaultValue: evaluation.status })}
          </Badge>
          {evaluation.total_score != null && (
            <Badge variant="secondary">{Number(evaluation.total_score).toFixed(1)}</Badge>
          )}
          {evaluation.rating_band && <Badge>{evaluation.rating_band}</Badge>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard label={t("performance.fields.kraScore")} value={evaluation.kra_score} />
        <ScoreCard label={t("performance.fields.kpiScore")} value={evaluation.kpi_score} />
        <ScoreCard label={t("performance.fields.totalScore")} value={evaluation.total_score} />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.evaluations.kras")}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.title")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.weight")}</TableHead>
              <TableHead>{t("performance.fields.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kras.map((k) => (
              <TableRow key={k.id}>
                <TableCell>
                  <div className="font-medium">{k.title}</div>
                  {k.description && <div className="text-xs text-muted-foreground">{k.description}</div>}
                </TableCell>
                <TableCell className="text-right">{k.weight_pct}%</TableCell>
                <TableCell>{k.status}</TableCell>
              </TableRow>
            ))}
            {!kras.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t("performance.evaluations.noKras")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium">{t("performance.evaluations.kpis")}</div>
            <p className="text-xs text-muted-foreground">{t("performance.evaluations.refreshHint")}</p>
          </div>
          <CapabilityGate capability="performance.evaluate">
            <Button size="sm" variant="outline" onClick={() => recalc.mutate()} disabled={recalc.isPending}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {t("performance.evaluations.recalculate")}
            </Button>
          </CapabilityGate>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.kpi")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.target")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.actual")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.weight")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.score")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map((k) => {
              const actual = actualMap.get(k.id);
              return (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="font-medium">{k.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {k.code} · {k.data_source}
                      {k.auto_query_key ? ` · ${k.auto_query_key}` : ""}
                      {!k.higher_is_better ? ` · ${t("performance.fields.lowerBetter")}` : ""}
                      {actual?.source ? ` · ${actual.source}` : ""}
                    </div>
                    {actual?.notes && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{actual.notes}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.target_value ?? "—"}
                    {k.unit ? ` ${k.unit}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <CapabilityGate
                      capability="performance.evaluate"
                      fallback={<span>{actual?.actual_value ?? "—"}</span>}
                    >
                      <Input
                        className="ml-auto h-8 w-24 text-right"
                        value={actualDrafts[k.id] ?? (actual?.actual_value != null ? String(actual.actual_value) : "")}
                        onChange={(e) =>
                          setActualDrafts((prev) => ({ ...prev, [k.id]: e.target.value }))
                        }
                      />
                    </CapabilityGate>
                  </TableCell>
                  <TableCell className="text-right">{k.weight_pct}%</TableCell>
                  <TableCell className="text-right">
                    {actual?.weighted_score != null ? Number(actual.weighted_score).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <CapabilityGate capability="performance.evaluate">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => saveActual.mutate(k.id)}
                        disabled={saveActual.isPending}
                      >
                        {t("common.save")}
                      </Button>
                    </CapabilityGate>
                  </TableCell>
                </TableRow>
              );
            })}
            {!kpis.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("performance.evaluations.noKpis")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <CapabilityGate capability="performance.evaluate">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">{t("performance.evaluations.workflow")}</div>
          <p className="text-xs text-muted-foreground">{t("performance.evaluations.workflowHint")}</p>
          <div>
            <Label>{t("performance.fields.comments")}</Label>
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-wrap gap-2">
            {allowedNext.map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === "finalized" ? "default" : "outline"}
                onClick={() =>
                  transition.mutate(
                    next as
                      | "draft"
                      | "supervisor_review"
                      | "manager_review"
                      | "employee_ack"
                      | "finalized"
                      | "cancelled",
                  )
                }
                disabled={transition.isPending}
              >
                <ChevronRight className="mr-1 h-4 w-4" />
                {t(`performance.status.${next}`, { defaultValue: next })}
              </Button>
            ))}
            {!allowedNext.length && (
              <span className="text-xs text-muted-foreground">{t("performance.evaluations.terminal")}</span>
            )}
          </div>
        </section>
      </CapabilityGate>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">{t("performance.evaluations.history")}</div>
        <ul className="space-y-2 text-sm">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-md border border-border px-3 py-2">
              <div className="font-medium">
                {r.from_status} → {r.to_status}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
                {r.comments ? ` · ${r.comments}` : ""}
              </div>
            </li>
          ))}
          {!reviews.length && (
            <li className="text-muted-foreground">{t("performance.evaluations.noHistory")}</li>
          )}
        </ul>
      </section>

      <Button variant="outline" size="sm" asChild>
        <Link href={`/people/performance/staff/${evaluation.staff_id}`}>
          {t("performance.profile.open")}
        </Link>
      </Button>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value != null ? Number(value).toFixed(1) : "—"}
      </div>
    </div>
  );
}

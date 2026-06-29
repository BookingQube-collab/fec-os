"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BarChart3, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  exportKpiScoresCsv,
  listKpiTemplates,
  listKpiScores,
  listKpiPeriods,
  runKpiAutoScoring,
} from "@/lib/kpi.functions";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ratingTone(rating: string | null) {
  if (rating === "excellent" || rating === "good") return "rag-green";
  if (rating === "needs_attention") return "rag-amber";
  return "rag-red";
}

function KpiPage() {
  const qc = useQueryClient();
  const templatesQ = useQuery({ queryKey: ["kpi", "templates"], queryFn: () => listKpiTemplates() });
  const scoresQ = useQuery({ queryKey: ["kpi", "scores"], queryFn: () => listKpiScores({}) });
  const periodsQ = useQuery({ queryKey: ["kpi", "periods"], queryFn: () => listKpiPeriods() });

  const autoScore = useMutation({
    mutationFn: () => {
      const periodId = periodsQ.data?.[0]?.id;
      if (!periodId) throw new Error("No open KPI period");
      return runKpiAutoScoring({ periodId });
    },
    onSuccess: (r) => {
      toast.success(`Auto-scored ${r.itemsUpdated} item(s)`);
      void qc.invalidateQueries({ queryKey: ["kpi", "scores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = useMutation({
    mutationFn: () => exportKpiScoresCsv({}),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">KPI Engine</h1>
          <p className="text-xs text-muted-foreground">Role-based scorecards, monthly periods, and drill-down scores.</p>
        </div>
        <CapabilityGate capability="kpi.view">
          <Button variant="outline" size="sm" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
            <Download className="mr-1 h-4 w-4" />Export CSV
          </Button>
        </CapabilityGate>
        <CapabilityGate capability="kpi.manage_templates">
          <Button size="sm" onClick={() => autoScore.mutate()} disabled={autoScore.isPending}>
            <Sparkles className="mr-1 h-4 w-4" />Run auto-scoring
          </Button>
        </CapabilityGate>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active templates</div>
          <div className="mt-1 text-2xl font-semibold">{templatesQ.data?.length ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Scores recorded</div>
          <div className="mt-1 text-2xl font-semibold">{scoresQ.data?.length ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Current period</div>
          <div className="mt-1 text-lg font-semibold">{periodsQ.data?.[0]?.label ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">KPI Templates</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {(templatesQ.data ?? []).map((t) => (
            <div key={t.id} className="rounded-md border border-border p-3">
              <div className="font-medium">{t.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.target_role ?? "All roles"} · {t.item_count} items</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Recent Scores</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Staff / Branch</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(scoresQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No scores yet. Assign templates and enter scores to begin.
                </TableCell>
              </TableRow>
            ) : (
              (scoresQ.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.template_name}</TableCell>
                  <TableCell>{s.staff_name ?? s.location_name ?? "—"}</TableCell>
                  <TableCell>{s.period_label}</TableCell>
                  <TableCell className="text-right font-medium">{s.total_score}/100</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ratingTone(s.rating)}>
                      {s.rating ?? "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Sprint 2 will add automatic score calculation from attendance, checklists, complaints, and maintenance data.
      </p>
    </div>
  );
}

export default KpiPage;

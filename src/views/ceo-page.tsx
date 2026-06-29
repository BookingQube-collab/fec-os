"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { generateDailyBrief, generatePnLCommentary } from "@/lib/ceo.functions";
import { useCeoOverview } from "@/hooks/queries/useCeo";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtNumber, fmtQar } from "@/lib/currency";

function Page() {
  const qc = useQueryClient();
        const [pnlNarrative, setPnlNarrative] = useState<string | null>(null);

  const { data, isLoading } = useCeoOverview();

  const briefMut = useMutation({
    mutationFn: () => generateDailyBrief(),
    onSuccess: () => {
      toast.success("Daily brief generated");
      void qc.invalidateQueries({ queryKey: ["ceo", "overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pnlMut = useMutation({
    mutationFn: () => generatePnLCommentary(),
    onSuccess: (row) => {
      const c = row.content as { narrative?: string };
      setPnlNarrative(c?.narrative ?? "(no narrative)");
      toast.success("P&L commentary generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">CEO Dashboard</h1>
          <p className="text-sm text-muted-foreground">Executive overview with AI-generated daily brief.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => pnlMut.mutate()} disabled={pnlMut.isPending}>
            {pnlMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            P&amp;L commentary
          </Button>
          <Button onClick={() => briefMut.mutate()} disabled={briefMut.isPending}>
            {briefMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate daily brief
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="Estate revenue 30d" value={data ? fmtQar(data.estate_revenue_30d) : "—"} />
        <Kpi label="EBITDA 30d" value={data ? fmtQar(data.estate_ebitda_30d) : "—"} />
        <Kpi
          label="Margin"
          value={data ? `${data.estate_margin_pct.toFixed(1)}%` : "—"}
          tone={(data?.estate_margin_pct ?? 0) >= 20 ? "rag-green" : (data?.estate_margin_pct ?? 0) >= 10 ? "rag-amber" : "rag-red"}
        />
        <Kpi
          label="Active branches"
          value={data ? `${data.active_branches} / ${data.total_branches}` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Kpi label="Open urgent tickets" value={data ? String(data.open_urgent_tickets) : "—"} tone={(data?.open_urgent_tickets ?? 0) > 0 ? "rag-red" : "rag-green"} />
        <Kpi label="Incidents 24h" value={data ? String(data.incidents_24h) : "—"} tone={(data?.incidents_24h ?? 0) > 0 ? "rag-amber" : "rag-green"} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Daily AI Brief</h2>
          {data?.latest_brief && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(data.latest_brief.created_at), { addSuffix: true })}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : data?.latest_brief ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {data.latest_brief.narrative || "No narrative."}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No brief yet. Click "Generate daily brief".</div>
        )}
      </div>

      {data?.top_branch && data?.bottom_branch && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Top branch (30d revenue)</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{data.top_branch.name}</div>
            <div className="text-sm text-muted-foreground">{fmtQar(data.top_branch.revenue)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{data.bottom_branch.name}</div>
            <div className="text-sm text-muted-foreground">{fmtQar(data.bottom_branch.revenue)}</div>
          </div>
        </div>
      )}

      {pnlNarrative && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-medium text-foreground">P&amp;L commentary</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{pnlNarrative}</div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

export default Page;

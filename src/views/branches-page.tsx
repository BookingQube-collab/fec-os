"use client";

import { useState } from "react";
import { Grid3X3, LayoutList, Trophy, TrendingUp, AlertTriangle, TicketCheck, Users, Sparkles } from "lucide-react";

import { useBranchLeague } from "@/hooks/queries/useBranches";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtNumber, fmtQar } from "@/lib/currency";

function Page() {
    const { data, isLoading } = useBranchLeague();
  const [view, setView] = useState<"list" | "heatmap">("heatmap");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Location Performance</h1>
          <p className="text-sm text-muted-foreground">League table and heat map ranked by composite operating score (last 30 days).</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "heatmap" ? "default" : "outline"} size="sm" onClick={() => setView("heatmap")}>
            <Grid3X3 className="mr-2 h-4 w-4" />Heat map
          </Button>
          <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>
            <LayoutList className="mr-2 h-4 w-4" />List
          </Button>
        </div>
      </div>

      {isLoading ? (
        view === "list" ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <UiSkeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <UiSkeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        )
      ) : view === "list" ? (
        <ListView data={data ?? []} />
      ) : (
        <HeatMapView data={data ?? []} />
      )}
    </div>
  );
}

function ListView({ data }: { data: Array<import("@/lib/branches.functions").BranchScore> }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Revenue 30d</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead className="text-right">Urgent tk</TableHead>
            <TableHead className="text-right">Incidents</TableHead>
            <TableHead className="text-right">Bookings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
          {data.map((b, i) => (
            <TableRow key={b.location_id}>
              <TableCell className="font-mono">
                {i === 0 ? <Trophy className="inline h-4 w-4 text-rag-green" /> : i + 1}
              </TableCell>
              <TableCell className="font-medium">
                {b.name}
                <span className="text-muted-foreground"> · {b.city}</span>
              </TableCell>
              <TableCell className="text-right font-semibold">{b.score}</TableCell>
              <TableCell className="text-right">{fmtQar(b.revenue_30d)}</TableCell>
              <TableCell className="text-right">{b.margin_pct.toFixed(1)}%</TableCell>
              <TableCell className="text-right">
                {b.urgent_tickets > 0 ? <Badge variant="destructive">{b.urgent_tickets}</Badge> : 0}
              </TableCell>
              <TableCell className="text-right">{b.incidents_30d}</TableCell>
              <TableCell className="text-right">{b.bookings_30d}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HeatMapView({ data }: { data: Array<import("@/lib/branches.functions").BranchScore> }) {
  if (data.length === 0) return <Skeleton text="No data" />;
  const maxRev = Math.max(...data.map((b) => b.revenue_30d), 1);
  const maxScore = Math.max(...data.map((b) => b.score), 1);
  const minScore = Math.min(...data.map((b) => b.score), 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((b, i) => {
        const revPct = (b.revenue_30d / maxRev) * 100;
        const scoreNormalized = maxScore === minScore ? 50 : ((b.score - minScore) / (maxScore - minScore)) * 100;
        const healthColor = scoreNormalized >= 70 ? "border-rag-green/40 bg-rag-green/5" : scoreNormalized >= 40 ? "border-rag-amber/40 bg-rag-amber/5" : "border-rag-red/40 bg-rag-red/5";
        const healthText = scoreNormalized >= 70 ? "text-rag-green" : scoreNormalized >= 40 ? "text-rag-amber" : "text-rag-red";

        return (
          <div key={b.location_id} className={`rounded-lg border ${healthColor} p-4 transition-colors`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {i === 0 && <Trophy className="h-4 w-4 text-rag-green" />}
                  <span className="font-semibold text-foreground">{b.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{b.code} · {b.city}</div>
              </div>
              <div className={`text-2xl font-bold ${healthText}`}>{b.score}</div>
            </div>

            <div className="mt-4 space-y-3">
              <HeatBar label="Revenue" value={revPct} tone={revPct >= 70 ? "bg-rag-green" : revPct >= 40 ? "bg-rag-amber" : "bg-rag-red"} display={fmtQar(b.revenue_30d)} />
              <HeatBar label="Margin" value={Math.max(0, Math.min(100, b.margin_pct * 2))} tone={b.margin_pct >= 20 ? "bg-rag-green" : b.margin_pct >= 10 ? "bg-rag-amber" : "bg-rag-red"} display={`${b.margin_pct.toFixed(1)}%`} />

              <div className="grid grid-cols-3 gap-2 pt-2">
                <MiniKpi icon={<AlertTriangle className="h-3.5 w-3.5" />} value={b.urgent_tickets} label="Urgent" tone={b.urgent_tickets > 0 ? "text-rag-red" : "text-muted-foreground"} />
                <MiniKpi icon={<TicketCheck className="h-3.5 w-3.5" />} value={b.open_tickets} label="Open" tone="text-muted-foreground" />
                <MiniKpi icon={<Users className="h-3.5 w-3.5" />} value={b.bookings_30d} label="Bookings" tone="text-muted-foreground" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeatBar({ label, value, tone, display }: { label: string; value: number; tone: string; display: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{display}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function MiniKpi({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5 text-center">
      <div className={`flex items-center justify-center gap-1 text-xs ${tone}`}>{icon} <span className="font-semibold">{value}</span></div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Skeleton({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export default Page;

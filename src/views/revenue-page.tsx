"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeLeakageCase,
  generateForecastNarrative,
  syncBookingQubeRevenue,
  updateLeakageStatus,
  type BookingQubeSyncStatus,
  type MonthlyRevenueProgress,
} from "@/lib/revenue.functions";
import {
  useRevenuePace,
  useBranchPnL,
  useLeakageCases,
  useAssetRoiLeague,
  useMonthlyRevenueProgress,
  useBookingQubeSyncStatus,
} from "@/hooks/queries/useRevenue";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { retryImport } from "@/lib/retry-import";
import { fmtNumber, fmtQar } from "@/lib/currency";

const RevenueDailyChart = dynamic(
  () =>
    retryImport(() =>
      import("@/components/revenue/revenue-daily-chart").then((m) => m.RevenueDailyChart),
    ),
  { ssr: false, loading: () => <Skeleton className="h-64 rounded-lg" /> },
);

function Page() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const canSyncBookingQube = usePermission("revenue.sync_bookingqube");
  const [forecastNarr, setForecastNarr] = useState<string | null>(null);

  const pace = useRevenuePace(locationId);
  const pnl = useBranchPnL();
  const leakage = useLeakageCases(locationId);
  const roi = useAssetRoiLeague(locationId);
  const monthly = useMonthlyRevenueProgress(locationId);
  const syncStatus = useBookingQubeSyncStatus();

  const syncBookingQubeMut = useMutation({
    mutationFn: () => syncBookingQubeRevenue({}),
    onSuccess: (r) => {
      toast.success(
        `Synced ${r.rows_upserted} day(s) from BookingQube (${r.source === "mock" ? "mock data" : "live API"})`,
      );
      void qc.invalidateQueries({ queryKey: ["revenue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyze = useMutation({
    mutationFn: (caseId: string) => analyzeLeakageCase({ caseId }),
    onSuccess: () => {
      toast.success("RCA generated");
      void qc.invalidateQueries({ queryKey: ["revenue", "leakage", locationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: (v: { caseId: string; status: "confirmed" | "recovered" | "dismissed"; recoveredAmount?: number }) =>
      updateLeakageStatus(v),
    onSuccess: (_d, v) => {
      toast.success(`Case ${v.status}`);
      void qc.invalidateQueries({ queryKey: ["revenue", "leakage", locationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const forecast = useMutation({
    mutationFn: () => generateForecastNarrative({ locationId }),
    onSuccess: (r) => {
      setForecastNarr(r.narrative);
      toast.success("Forecast generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const series = useMemo(() => pace.data?.series ?? [], [pace.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Revenue Intelligence</h1>
          <p className="text-sm text-muted-foreground">Pace, forecast, leakage, and asset ROI across the estate.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSyncBookingQube && (
            <Button
              variant="outline"
              onClick={() => syncBookingQubeMut.mutate()}
              disabled={syncBookingQubeMut.isPending}
            >
              {syncBookingQubeMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync from BookingQube
            </Button>
          )}
          <Button variant="outline" onClick={() => forecast.mutate()} disabled={forecast.isPending}>
            {forecast.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI forecast (90d)
          </Button>
        </div>
      </div>

      {forecastNarr && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-medium text-foreground">AI revenue forecast</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{forecastNarr}</div>
        </div>
      )}

      <BookingQubePanel monthly={monthly.data} syncStatus={syncStatus.data} isLoading={monthly.isLoading} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="30d revenue" value={pace.data ? fmtQar(pace.data.current_total) : "—"} />
        <Kpi
          label="Pace vs prior"
          value={pace.data ? `${pace.data.pace_pct >= 0 ? "+" : ""}${pace.data.pace_pct.toFixed(1)}%` : "—"}
          tone={(pace.data?.pace_pct ?? 0) >= 0 ? "rag-green" : "rag-red"}
        />
        <Kpi label="Forecast next 14d" value={pace.data ? fmtQar(pace.data.forecast_next_14d) : "—"} />
        <Kpi label="Open leakage cases" value={String((leakage.data ?? []).filter((l) => l.status !== "dismissed" && l.status !== "recovered").length)} />
      </div>

      <RevenueDailyChart series={series} />

      <Tabs defaultValue="bookingqube">
        <TabsList>
          <TabsTrigger value="bookingqube">BookingQube MTD</TabsTrigger>
          <TabsTrigger value="pnl">Branch P&amp;L</TabsTrigger>
          <TabsTrigger value="leakage">Leakage</TabsTrigger>
          <TabsTrigger value="roi">Asset ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="bookingqube">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Month target</TableHead>
                  <TableHead className="text-right">MTD actual</TableHead>
                  <TableHead className="text-right">% of target</TableHead>
                  <TableHead className="w-48">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(monthly.data?.branches ?? []).map((b) => (
                  <TableRow key={b.location_id}>
                    <TableCell className="font-medium">
                      {b.name} <span className="text-muted-foreground">· {b.code}</span>
                    </TableCell>
                    <TableCell className="text-right">{fmtQar(b.target_revenue)}</TableCell>
                    <TableCell className="text-right">{fmtQar(b.mtd_revenue)}</TableCell>
                    <TableCell className="text-right">{b.progress_pct.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Progress value={Math.min(b.progress_pct, 100)} className="h-2" />
                    </TableCell>
                  </TableRow>
                ))}
                {monthly.data && monthly.data.branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No monthly targets or daily revenue yet. Sync from BookingQube or seed demo data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {monthly.data && monthly.data.branches.some((b) => b.days.length > 0) && (
              <div className="border-t border-border p-4">
                <div className="mb-3 text-sm font-medium text-foreground">Daily revenue this month</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        {(monthly.data.branches ?? []).map((b) => (
                          <TableHead key={b.location_id} className="text-right">
                            {b.code}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buildDailyMatrix(monthly.data.branches).map((row) => (
                        <TableRow key={row.date}>
                          <TableCell>{row.date}</TableCell>
                          {(monthly.data?.branches ?? []).map((b) => (
                            <TableCell key={b.location_id} className="text-right">
                              {row.byCode[b.code] != null ? fmtQar(row.byCode[b.code]) : "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pnl">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Revenue 30d</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Footfall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pnl.data ?? []).map((b) => (
                  <TableRow key={b.location_id}>
                    <TableCell className="font-medium">{b.name} <span className="text-muted-foreground">· {b.code}</span></TableCell>
                    <TableCell className="text-right">{fmtQar(b.revenue)}</TableCell>
                    <TableCell className="text-right">{fmtQar(b.ebitda)}</TableCell>
                    <TableCell className="text-right">{b.margin_pct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{fmtNumber(b.footfall)}</TableCell>
                  </TableRow>
                ))}
                {pnl.data && pnl.data.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No financial snapshots yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="leakage">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detected</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Hypothesis</TableHead>
                  <TableHead className="text-right">Est. loss</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">RCA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leakage.data ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.detected_on}</TableCell>
                    <TableCell>{l.category}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground" title={l.root_cause ?? l.hypothesis ?? ""}>
                      {l.root_cause ?? l.hypothesis ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{l.estimated_loss ? fmtQar(Number(l.estimated_loss)) : "—"}</TableCell>
                    <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={analyze.isPending && analyze.variables === l.id}
                        onClick={() => analyze.mutate(l.id)}
                      >
                        {analyze.isPending && analyze.variables === l.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {l.status !== "recovered" && l.status !== "dismissed" && (
                        <span className="ml-1 inline-flex gap-1">
                          {l.status !== "confirmed" && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ caseId: l.id, status: "confirmed" })}>Confirm</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => {
                            const v = window.prompt("Recovered amount (QAR)?", "0");
                            if (v === null) return;
                            const n = Number(v);
                            if (!Number.isFinite(n) || n < 0) { toast.error("Invalid amount"); return; }
                            updateStatus.mutate({ caseId: l.id, status: "recovered", recoveredAmount: n });
                          }}>Recover</Button>
                          <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ caseId: l.id, status: "dismissed" })}>Dismiss</Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {leakage.data && leakage.data.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No leakage cases on record.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="roi">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attraction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tickets 30d</TableHead>
                  <TableHead className="text-right">Open WOs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roi.data ?? []).map((a) => (
                  <TableRow key={a.attraction_id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                    <TableCell className="text-right">{a.tickets_30d}</TableCell>
                    <TableCell className="text-right">{a.open_work_orders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BookingQubePanel({
  monthly,
  syncStatus,
  isLoading,
}: {
  monthly?: MonthlyRevenueProgress;
  syncStatus?: BookingQubeSyncStatus;
  isLoading: boolean;
}) {
  const lastSynced = monthly?.last_synced_at ?? syncStatus?.last_synced_at;
  const apiMode = monthly?.api_mode ?? syncStatus?.api_mode ?? "mock";
  const progress = monthly?.estate_progress_pct ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">BookingQube — {monthly?.month_label ?? "this month"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily revenue per store · targets from month_target snapshots
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{apiMode === "mock" ? "Mock API" : "Live API"}</Badge>
          {lastSynced ? (
            <span className="text-xs text-muted-foreground">
              Last synced {new Date(lastSynced).toLocaleString("en-QA", { timeZone: "Asia/Qatar" })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not synced yet</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading monthly progress…
        </div>
      ) : monthly ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Estate month target" value={fmtQar(monthly.estate_target)} />
            <Kpi label="Estate MTD revenue" value={fmtQar(monthly.estate_mtd)} />
            <Kpi
              label="% of month target"
              value={`${monthly.estate_progress_pct.toFixed(1)}%`}
              tone={monthly.estate_progress_pct >= 100 ? "rag-green" : undefined}
            />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>Month-to-date vs estate target</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-3" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function buildDailyMatrix(branches: Array<{ code: string; days: Array<{ date: string; revenue: number }> }>) {
  const dates = new Set<string>();
  for (const b of branches) {
    for (const d of b.days) dates.add(d.date);
  }
  return [...dates]
    .sort()
    .map((date) => {
      const byCode: Record<string, number> = {};
      for (const b of branches) {
        const hit = b.days.find((d) => d.date === date);
        if (hit) byCode[b.code] = hit.revenue;
      }
      return { date, byCode };
    });
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

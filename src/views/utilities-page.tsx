"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Gauge } from "lucide-react";

import { exportUtilitiesCsv } from "@/lib/utilities.functions";
import { useUtilityDashboard } from "@/hooks/queries/useUtilities";
import { useDeferredQuery } from "@/hooks/use-deferred-query";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function UtilitiesPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const deferTable = useDeferredQuery(true, 1500);
  const { data: summary, isLoading } = useUtilityDashboard(locationId ?? null);
  const rows = deferTable ? (summary?.rows ?? []) : [];

  const exportMut = useMutation({
    mutationFn: () => exportUtilitiesCsv({ locationId: locationId ?? null }),
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Utilities & Energy</h1>
            <p className="text-xs text-muted-foreground">Electricity, water, internet, gas & generator fuel tracking.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportMut.mutate()}><Download className="mr-1 h-4 w-4" />Export</Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Cost this month</div>
          <div className="mt-1 text-2xl font-semibold">QAR {summary?.total_cost_this_month?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Records</div>
          <div className="mt-1 text-2xl font-semibold">{summary?.record_count ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">High consumption alerts</div>
          <div className="mt-1 text-2xl font-semibold rag-amber">{summary?.high_consumption_alerts?.length ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Top site cost</div>
          <div className="mt-1 text-lg font-semibold">{summary?.site_comparison?.[0]?.code ?? "—"}</div>
        </div>
      </div>

      {(summary?.high_consumption_alerts?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          High electricity usage: {summary!.high_consumption_alerts.map((a) => `${a.code} (${Math.round(a.kwh)} kWh)`).join(", ")}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Utility</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Consumption</TableHead>
              <TableHead>Bill (QAR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No utility readings.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.location_code}</TableCell>
                  <TableCell><Badge variant="outline">{r.utility_type}</Badge></TableCell>
                  <TableCell>{r.period_month}</TableCell>
                  <TableCell>{r.consumption ?? "—"}</TableCell>
                  <TableCell>{r.bill_amount.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default UtilitiesPage;

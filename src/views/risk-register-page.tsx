"use client";

import Link from "next/link";
import { AlertOctagon } from "lucide-react";

import { useRiskSummary, useRiskRegister } from "@/hooks/queries/useRisk";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function RiskRegisterPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data: summary } = useRiskSummary({ locationId: locationId ?? null });
  const { data: rows, isLoading } = useRiskRegister({ locationId: locationId ?? null });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <AlertOctagon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Risk Register</h1>
            <p className="text-xs text-muted-foreground">Impact × likelihood scoring with mitigation tracking.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance">Compliance hub</Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Total risks</div><div className="text-2xl font-semibold">{summary?.total ?? "—"}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">High (≥15)</div><div className="text-2xl font-semibold rag-red">{summary?.high_risk ?? "—"}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Medium (8–14)</div><div className="text-2xl font-semibold rag-amber">{summary?.medium_risk ?? "—"}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Open</div><div className="text-2xl font-semibold">{summary?.open ?? "—"}</div></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No risks logged.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.location_code}</TableCell>
                  <TableCell>{r.risk_category}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                  <TableCell><Badge variant="outline" className={r.risk_score >= 15 ? "rag-red" : r.risk_score >= 8 ? "rag-amber" : ""}>{r.risk_score}</Badge></TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.target_date ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default RiskRegisterPage;

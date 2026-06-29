"use client";

import Link from "next/link";
import { Building } from "lucide-react";

import { useFacilityDashboard } from "@/hooks/queries/useFacility";
import { useDeferredQuery } from "@/hooks/use-deferred-query";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function FacilityPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const deferTasks = useDeferredQuery(true, 1500);
  const { data: dash, isLoading } = useFacilityDashboard({ locationId: locationId ?? null });
  const tasks = deferTasks ? (dash?.tasks.filter((t) => t.status === "open") ?? []) : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Building className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Facility Management</h1>
            <p className="text-xs text-muted-foreground">Cleaning, HVAC, fire, CCTV, mall approvals & site readiness.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild><Link href="/snags">Snags</Link></Button>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Open tasks</div><div className="text-2xl font-semibold">{dash?.open_count ?? "—"}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-2xl font-semibold rag-red">{dash?.overdue_count ?? "—"}</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Site readiness</div><div className="text-2xl font-semibold">{dash?.site_readiness_score ?? "—"}%</div></div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Categories</div><div className="text-sm">9 tracked</div></div>
      </div>

      {dash?.by_region?.map((group) => (
        <section key={group.region} className="space-y-2">
          <h2 className="text-sm font-medium uppercase text-muted-foreground">{group.region}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {group.tasks.slice(0, 4).map((t) => (
              <div key={t.id} className="rounded-md border border-border bg-card p-3 text-sm">
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.location_code} · {t.category}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !tasks?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No open facility tasks.</TableCell></TableRow>
            ) : (
              tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.location_code}</TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell>{t.title}</TableCell>
                  <TableCell><Badge variant="outline">{t.priority}</Badge></TableCell>
                  <TableCell>{t.due_date ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default FacilityPage;

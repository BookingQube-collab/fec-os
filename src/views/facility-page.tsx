"use client";

import Link from "next/link";
import { Building } from "lucide-react";

import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { useFacilityDashboard } from "@/hooks/queries/useFacility";
import { useDeferredQuery } from "@/hooks/use-deferred-query";
import { useAppStore } from "@/stores/app-store";
import { formatLocationLabel } from "@/lib/locations/normalize";
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
      <PageHeader
        icon={Building}
        title="Facility Management"
        subtitle="Cleaning, HVAC, fire, CCTV, mall approvals & site readiness."
        actions={
          <Button variant="outline" size="sm" asChild><Link href="/snags">Snags</Link></Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <TintedKpiCard title="Open tasks" value={dash?.open_count ?? "—"} tint="sky" compact />
        <TintedKpiCard title="Overdue" value={dash?.overdue_count ?? "—"} tint={(dash?.overdue_count ?? 0) > 0 ? "red" : "green"} compact />
        <TintedKpiCard title="Site readiness" value={dash ? `${dash.site_readiness_score}%` : "—"} tint="green" compact />
        <TintedKpiCard title="Categories" value="9" hint="tracked" tint="slate" compact />
      </div>

      {dash?.by_region?.map((group) => (
        <section key={group.region} className="space-y-2">
          <h2 className="text-sm font-medium uppercase text-muted-foreground">{group.region}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {group.tasks.slice(0, 4).map((t) => (
              <div key={t.id} className="rounded-md border border-border bg-card p-3 text-sm">
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-muted-foreground">{formatLocationLabel(t.location_code, t.location_name)} · {t.category}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="overflow-x-auto surface-card">
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
                  <TableCell className="text-xs">{formatLocationLabel(t.location_code, t.location_name)}</TableCell>
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

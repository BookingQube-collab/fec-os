"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";

import {
  listComplianceCalendarEvents,
  listComplianceRecurringTasks,
  getComplianceRiskDashboard,
} from "@/lib/compliance-calendar.functions";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ComplianceCalendarPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const month = new Date().toISOString().slice(0, 7);

  const { data: events, isLoading } = useQuery({
    queryKey: ["compliance-calendar", locationId, month],
    queryFn: () => listComplianceCalendarEvents({ locationId: locationId ?? null, month }),
  });
  const { data: recurring } = useQuery({
    queryKey: ["compliance-recurring", locationId],
    queryFn: () => listComplianceRecurringTasks({ locationId: locationId ?? null }),
  });
  const { data: risk } = useQuery({
    queryKey: ["compliance-risk", locationId],
    queryFn: () => getComplianceRiskDashboard({ locationId: locationId ?? null }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Compliance Calendar</h1>
          <p className="text-xs text-muted-foreground">Legal renewals, recurring inspections, and branch compliance risk.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Overdue items</div>
          <div className="mt-1 text-2xl font-semibold rag-red">{risk?.total_overdue ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Due soon (30d)</div>
          <div className="mt-1 text-2xl font-semibold rag-amber">{risk?.total_due_soon ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Recurring tasks</div>
          <div className="mt-1 text-2xl font-semibold">{recurring?.length ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">This month</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !events?.length ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No calendar events this month. Recurring tasks are seeded per branch.</TableCell></TableRow>
            ) : (
              events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.title}</TableCell>
                  <TableCell>{e.event_type}</TableCell>
                  <TableCell>{e.due_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      e.computed_status === "overdue" ? "rag-red" :
                      e.computed_status === "due_soon" ? "rag-amber" : "rag-green"
                    }>{e.computed_status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ComplianceCalendarPage;

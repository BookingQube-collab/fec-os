"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BellRing, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  dispatchDuePlannedNotifications,
  listPlannedNotifications,
  syncPlannedNotifications,
} from "@/lib/planned-notifications.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function PlannedNotificationsPage() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["planned-notifications"],
    queryFn: () => listPlannedNotifications({ upcomingOnly: true }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncPlannedNotifications(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.created} new reminder(s)`);
      void qc.invalidateQueries({ queryKey: ["planned-notifications"] });
    },
  });

  const dispatchMut = useMutation({
    mutationFn: () => dispatchDuePlannedNotifications(),
    onSuccess: (r) => {
      toast.success(`Dispatched ${r.sent} notification(s)`);
      void qc.invalidateQueries({ queryKey: ["planned-notifications"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Planned Notifications</h1>
            <p className="text-xs text-muted-foreground">Renewal, service, inspection & license reminders.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className="mr-1 h-4 w-4" />Sync reminders
          </Button>
          <Button size="sm" onClick={() => dispatchMut.mutate()} disabled={dispatchMut.isPending}>Dispatch due</Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Scans AMC renewals, service schedules, compliance documents & PM due dates. Dispatched items appear in{" "}
        <Link href="/notifications" className="text-primary hover:underline">Notifications inbox</Link>.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No planned reminders. Click Sync reminders.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.reminder_type}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.due_date}</TableCell>
                  <TableCell className="text-xs">{new Date(r.scheduled_for).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default PlannedNotificationsPage;

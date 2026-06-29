"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { useAmcSchedules } from "@/hooks/queries/useAmcSchedules";
import { AMC_CATEGORY_LABELS, type AmcCategory } from "@/lib/amc/constants";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcSchedulePage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useAmcSchedules({ locationId: locationId ?? null });
  const rows = data?.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">AMC Service Schedule</h1>
          <p className="text-xs text-muted-foreground">All planned and completed service visits across contracts.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-dashboard">Dashboard</Link>
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Planned</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Service #</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No scheduled services.</TableCell></TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.planned_date}</TableCell>
                  <TableCell>{s.vendor_name ?? "—"}</TableCell>
                  <TableCell>
                    {s.category
                      ? AMC_CATEGORY_LABELS[s.category as AmcCategory] ?? s.category
                      : "—"}
                  </TableCell>
                  <TableCell>#{s.service_number}</TableCell>
                  <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AmcSchedulePage;

"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { useAmcRenewals } from "@/hooks/queries/useAmcRenewals";
import { AMC_CATEGORY_LABELS, type AmcCategory } from "@/lib/amc/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcRenewalsPage() {
  const { data: renewals, isLoading } = useAmcRenewals(30);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">AMC Renewals</h1>
          <p className="text-xs text-muted-foreground">Contracts expiring within the next 30 days.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-dashboard">Dashboard</Link>
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>End date</TableHead>
              <TableHead>Days left</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !renewals?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No renewals due in 30 days.</TableCell></TableRow>
            ) : (
              renewals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.location_code}</TableCell>
                  <TableCell>{AMC_CATEGORY_LABELS[r.category as AmcCategory] ?? r.category}</TableCell>
                  <TableCell>
                    <Link href={`/compliance/amc-contracts/${r.id}`} className="text-primary hover:underline">{r.vendor_name}</Link>
                  </TableCell>
                  <TableCell>{r.contract_end_date}</TableCell>
                  <TableCell className={r.days_left <= 30 ? "text-amber-400 font-medium" : ""}>{r.days_left}</TableCell>
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

export default AmcRenewalsPage;

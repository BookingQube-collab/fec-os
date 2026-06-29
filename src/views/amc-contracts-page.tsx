"use client";

import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";

import { useAmcContracts } from "@/hooks/queries/useAmcContracts";
import { AMC_CATEGORY_LABELS, type AmcCategory } from "@/lib/amc/constants";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AmcContractsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useAmcContracts({ locationId: locationId ?? null });
  const contracts = data?.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AMC Contracts</h1>
            <p className="text-xs text-muted-foreground">All maintenance, license & compliance contracts.</p>
          </div>
        </div>
        <Button size="sm" asChild>
          <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />New contract</Link>
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
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !contracts?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No contracts.</TableCell></TableRow>
            ) : (
              contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.location_code}</TableCell>
                  <TableCell>{AMC_CATEGORY_LABELS[c.category as AmcCategory] ?? c.category}</TableCell>
                  <TableCell>
                    <Link href={`/compliance/amc-contracts/${c.id}`} className="text-primary hover:underline">{c.vendor_name}</Link>
                  </TableCell>
                  <TableCell>{c.contract_end_date}</TableCell>
                  <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                  <TableCell className="text-right">QAR {c.outstanding_amount.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AmcContractsPage;

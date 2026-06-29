"use client";

import { Truck } from "lucide-react";

import { useVendorDashboard, useVendors } from "@/hooks/queries/useVendors";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function VendorsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data: vendorData, isLoading } = useVendors({ locationId: locationId ?? null });
  const { data: dash } = useVendorDashboard(locationId ?? null);
  const vendors = vendorData?.items;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Vendors & Contracts</h1>
          <p className="text-xs text-muted-foreground">AMC tracking, contract expiry, SLA follow-ups.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active vendors</div>
          <div className="mt-1 text-2xl font-semibold">{vendors?.length ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Contracts expiring (30d)</div>
          <div className="mt-1 text-2xl font-semibold rag-amber">{dash?.contracts_expiring_soon ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Pending follow-ups</div>
          <div className="mt-1 text-2xl font-semibold">{dash?.pending_followups ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Vendor directory</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>AMC</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : !vendors?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No vendors found.</TableCell></TableRow>
            ) : (
              vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.category}</TableCell>
                  <TableCell>{v.contact_person ?? v.phone ?? "—"}</TableCell>
                  <TableCell>{v.amc_status ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{v.active ? "Active" : "Inactive"}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default VendorsPage;

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  createPurchaseOrder,
  listPurchaseOrders,
  updatePoStatus,
} from "@/lib/pos.functions";
import { useBranchLeague } from "@/hooks/queries/useBranches";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CURRENCY_CODE, fmtCurrency } from "@/lib/currency";

const STATUS_TONE: Record<string, string> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "default",
  received: "default",
  closed: "secondary",
  rejected: "destructive",
};

function Page() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
        
  const pos = useQuery({
    queryKey: ["pos", locationId],
    queryFn: () => listPurchaseOrders({ locationId }),
  });
  const branches = useBranchLeague();

  const create = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      toast.success("PO created");
      void qc.invalidateQueries({ queryKey: ["pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const transition = useMutation({
    mutationFn: updatePoStatus,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Branch procurement queue with approval workflow.</p>
        </div>
        <NewPoDialog
          locationId={locationId}
          branches={(branches.data ?? []).map((b) => ({ id: b.location_id, name: b.name }))}
          onSubmit={(payload) => create.mutate(payload)}
          pending={create.isPending}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(pos.data ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.po_number}</TableCell>
                <TableCell className="font-medium">{p.vendor_name}</TableCell>
                <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                <TableCell className="text-right">{fmtCurrency(p.amount, p.currency)}</TableCell>
                <TableCell>
                  <Badge variant={(STATUS_TONE[p.status] ?? "outline") as never}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {p.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "pending_approval" })}>
                      Submit
                    </Button>
                  )}
                  {p.status === "pending_approval" && (
                    <>
                      <Button size="sm" onClick={() => transition.mutate({ id: p.id, status: "approved" })}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "rejected" })}>Reject</Button>
                    </>
                  )}
                  {p.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "received" })}>
                      Mark received
                    </Button>
                  )}
                  {p.status === "received" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "closed" })}>
                      Close
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {pos.data && pos.data.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No purchase orders yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewPoDialog({
  locationId,
  branches,
  onSubmit,
  pending,
}: {
  locationId: string | null;
  branches: Array<{ id: string; name: string }>;
  onSubmit: (p: { locationId: string; vendorName: string; category?: string; description?: string; amount: number; currency: string }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(locationId ?? "");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const amt = Number(amount);
    if (!loc || !vendor || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Branch, vendor, and a positive amount are required.");
      return;
    }
    onSubmit({ locationId: loc, vendorName: vendor, category: category || undefined, description: description || undefined, amount: amt, currency: CURRENCY_CODE });
    setOpen(false);
    setVendor(""); setCategory(""); setDescription(""); setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New PO</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">Branch
            <select className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">Select a branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">Vendor
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">Category
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. spare parts" />
            </label>
            <label className="block text-xs text-muted-foreground">Amount (QAR)
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">Description
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Page;

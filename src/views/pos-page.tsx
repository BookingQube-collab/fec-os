"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  const { t } = useTranslation();
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
      toast.success(t("pos.created"));
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
          <h1 className="text-2xl font-semibold text-foreground">{t("pos.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pos.subtitle")}</p>
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
              <TableHead>{t("pos.poNumber")}</TableHead>
              <TableHead>{t("common.vendor")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead className="text-right">{t("common.amount")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                  <Badge variant={(STATUS_TONE[p.status] ?? "outline") as never}>{t(`pos.status.${p.status}`, { defaultValue: p.status })}</Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {p.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "pending_approval" })}>
                      {t("common.submit")}
                    </Button>
                  )}
                  {p.status === "pending_approval" && (
                    <>
                      <Button size="sm" onClick={() => transition.mutate({ id: p.id, status: "approved" })}>{t("common.approve")}</Button>
                      <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "rejected" })}>{t("common.reject")}</Button>
                    </>
                  )}
                  {p.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "received" })}>
                      {t("pos.markReceived")}
                    </Button>
                  )}
                  {p.status === "received" && (
                    <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: p.id, status: "closed" })}>
                      {t("common.close")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {pos.data && pos.data.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("pos.empty")}</TableCell></TableRow>
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(locationId ?? "");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const amt = Number(amount);
    if (!loc || !vendor || !Number.isFinite(amt) || amt <= 0) {
      toast.error(t("pos.required"));
      return;
    }
    onSubmit({ locationId: loc, vendorName: vendor, category: category || undefined, description: description || undefined, amount: amt, currency: CURRENCY_CODE });
    setOpen(false);
    setVendor(""); setCategory(""); setDescription(""); setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("pos.newPo")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pos.newTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">{t("common.branch")}
            <SearchableSelect
              className="mt-1"
              value={loc}
              onValueChange={setLoc}
              placeholder={t("common.selectBranch")}
              emptyOption={{ value: "", label: t("common.selectBranch") }}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </label>
          <label className="block text-xs text-muted-foreground">{t("common.vendor")}
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t("pos.vendorPlaceholder")} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">{t("common.category")}
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("pos.categoryPlaceholder")} />
            </label>
            <label className="block text-xs text-muted-foreground">{t("pos.amountQar", { qar: t("common.qar") })}
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">{t("common.description")}
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={pending}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Page;

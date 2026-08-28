"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  LayoutDashboard,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { InventoryImportDialog } from "@/components/inventory/inventory-import-dialog";
import {
  deleteInventoryItem,
  deleteInventoryStock,
  recordInventoryMovement,
  upsertInventoryItem,
  upsertInventoryStock,
} from "@/lib/inventory.functions";
import { useInventoryItems, useInventoryStock, useInventoryAlerts } from "@/hooks/queries/useInventory";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const InventoryDashboardPanel = dynamic(
  () =>
    import("@/components/inventory/inventory-dashboard-panel").then((m) => m.InventoryDashboardPanel),
  {
    ssr: false,
    loading: () => <InventoryDashboardLoading />,
  },
);

const SOCK_SIZES = ["S", "M", "L", "XL"] as const;
const STOCK_STATUSES = ["all", "ok", "low", "out"] as const;

function InventoryDashboardLoading() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {t("inventory.loadingDashboard")}
    </div>
  );
}

function statusBadge(status: string, belowReorder: boolean, t: (key: string) => string) {
  if (status === "out") return <Badge variant="outline" className="rag-red">{t("inventory.status.out")}</Badge>;
  if (status === "low" || belowReorder) return <Badge variant="outline" className="rag-amber">{t("inventory.status.low")}</Badge>;
  return <Badge variant="outline">{t("inventory.status.ok")}</Badge>;
}

function InventoryPage() {
  const { t } = useTranslation();
  const canManage = usePermission("inventory.manage");
  const canMove = usePermission("inventory.move");
  const canImport = usePermission("inventory.import");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t("inventory.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("inventory.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("inventory.importSheet")}
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            {t("inventory.tabs.dashboard")}
          </TabsTrigger>
          <TabsTrigger value="stock">{t("inventory.tabs.stock")}</TabsTrigger>
          <TabsTrigger value="catalog">{t("inventory.tabs.catalog")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <InventoryDashboardPanel />
        </TabsContent>
        <TabsContent value="stock" className="mt-4">
          <StockPanel canManage={canManage} canMove={canMove} canImport={canImport} />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <CatalogPanel canManage={canManage} />
        </TabsContent>
      </Tabs>

      {canImport && <InventoryImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}

function StockPanel({
  canManage,
  canMove,
  canImport,
}: {
  canManage: boolean;
  canMove: boolean;
  canImport: boolean;
}) {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stockDialog, setStockDialog] = useState<{
    id?: string;
    itemId: string;
    quantity: string;
  } | null>(null);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addForm, setAddForm] = useState({ itemId: "", quantity: "0" });

  const filters = {
    size: sizeFilter === "all" ? null : sizeFilter,
    status: statusFilter,
  };

  const { data: items } = useInventoryItems();
  const { data: stock, isLoading } = useInventoryStock(locationId ?? null, filters);
  const { data: alerts } = useInventoryAlerts(locationId ?? null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.inventory.all });

  const receiveMut = useMutation({
    mutationFn: (itemId: string) => {
      if (!locationId) throw new Error(t("inventory.stock.selectBranch"));
      return recordInventoryMovement({
        itemId,
        locationId,
        movementType: "receive",
        quantity: 1,
        notes: "Quick receive +1",
      });
    },
    onSuccess: () => {
      toast.success(t("inventory.stock.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stockMut = useMutation({
    mutationFn: () => {
      if (!locationId || !stockDialog) throw new Error(t("inventory.stock.selectBranch"));
      return upsertInventoryStock({
        id: stockDialog.id,
        itemId: stockDialog.itemId,
        locationId,
        quantityOnHand: Number(stockDialog.quantity),
      });
    },
    onSuccess: () => {
      toast.success(t("inventory.stock.saved"));
      setStockDialog(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStockMut = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error(t("inventory.stock.selectBranch"));
      return upsertInventoryStock({
        itemId: addForm.itemId,
        locationId,
        quantityOnHand: Number(addForm.quantity),
      });
    },
    onSuccess: () => {
      toast.success(t("inventory.stock.created"));
      setAddStockOpen(false);
      setAddForm({ itemId: "", quantity: "0" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStockMut = useMutation({
    mutationFn: (id: string) => deleteInventoryStock({ id }),
    onSuccess: () => {
      toast.success(t("inventory.stock.removed"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {(alerts?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {t("inventory.stock.alert", { count: alerts!.length })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder={t("inventory.stock.size")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory.stock.allSizes")}</SelectItem>
            {SOCK_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            {STOCK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? t("common.allStatuses") : t(`inventory.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAddStockOpen(true)} disabled={!locationId}>
            <Plus className="mr-1 h-4 w-4" />
            {t("inventory.stock.addStock")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inventory.stock.sku")}</TableHead>
              <TableHead>{t("inventory.stock.item")}</TableHead>
              <TableHead>{t("inventory.stock.size")}</TableHead>
              <TableHead>{t("inventory.stock.branch")}</TableHead>
              <TableHead>{t("inventory.stock.onHand")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : !stock?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <p className="text-muted-foreground">{t("inventory.stock.empty")}</p>
                  {canImport && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("inventory.stock.emptyHint")}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              stock.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                  <TableCell>{s.item_name}</TableCell>
                  <TableCell>{s.size ?? "—"}</TableCell>
                  <TableCell>{formatLocationLabel(s.location_code, s.location_name)}</TableCell>
                  <TableCell>
                    {s.quantity_on_hand} {s.unit}
                  </TableCell>
                  <TableCell>{statusBadge(s.stock_status, s.below_reorder, t)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {(canMove || canManage) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => receiveMut.mutate(s.item_id)}
                          disabled={!locationId || receiveMut.isPending}
                        >
                          +1
                        </Button>
                      )}
                      {(canMove || canManage) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setStockDialog({
                              id: s.id,
                              itemId: s.item_id,
                              quantity: String(s.quantity_on_hand),
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteStockMut.mutate(s.id)}
                          disabled={deleteStockMut.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!stockDialog} onOpenChange={(o) => !o && setStockDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventory.stock.adjustTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="qty">{t("inventory.stock.qtyOnHand")}</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                value={stockDialog?.quantity ?? ""}
                onChange={(e) => stockDialog && setStockDialog({ ...stockDialog, quantity: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => stockMut.mutate()} disabled={stockMut.isPending}>
              {stockMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventory.stock.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("inventory.stock.catalogItem")}</Label>
              <Select value={addForm.itemId} onValueChange={(v) => setAddForm((f) => ({ ...f, itemId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("inventory.stock.selectItem")} />
                </SelectTrigger>
                <SelectContent>
                  {(items ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.sku} — {i.name}
                      {i.size ? ` (${i.size})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="add-qty">{t("inventory.stock.qtyOnHand")}</Label>
              <Input
                id="add-qty"
                type="number"
                min={0}
                value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStockOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => addStockMut.mutate()}
              disabled={!addForm.itemId || addStockMut.isPending}
            >
              {addStockMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: items, isLoading } = useInventoryItems({ enabled: true });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    sku: "",
    name: "",
    category: "consumable",
    unit: "pair",
    size: "",
    reorderLevel: "0",
    parLevel: "",
    costPerUnit: "",
    active: true,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.inventory.all });

  const saveMut = useMutation({
    mutationFn: () =>
      upsertInventoryItem({
        id: form.id || undefined,
        sku: form.sku,
        name: form.name,
        category: form.category,
        unit: form.unit,
        size: form.size || null,
        reorderLevel: Number(form.reorderLevel) || 0,
        parLevel: form.parLevel ? Number(form.parLevel) : null,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : null,
        active: form.active,
      }),
    onSuccess: () => {
      toast.success(form.id ? t("inventory.catalog.updated") : t("inventory.catalog.created"));
      setDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInventoryItem({ id }),
    onSuccess: () => {
      toast.success(t("inventory.catalog.archived"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setForm({
      id: "",
      sku: "",
      name: "",
      category: "consumable",
      unit: "pair",
      size: "",
      reorderLevel: "0",
      parLevel: "",
      costPerUnit: "",
      active: true,
    });
    setDialogOpen(true);
  }

  function openEdit(item: NonNullable<typeof items>[number]) {
    setForm({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      size: item.size ?? "",
      reorderLevel: String(item.reorder_level ?? 0),
      parLevel: item.par_level != null ? String(item.par_level) : "",
      costPerUnit: item.cost_per_unit != null ? String(item.cost_per_unit) : "",
      active: item.active,
    });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("inventory.catalog.master", { count: items?.length ?? 0 })}
        </p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("inventory.catalog.addItem")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inventory.stock.sku")}</TableHead>
              <TableHead>{t("inventory.catalog.name")}</TableHead>
              <TableHead>{t("inventory.stock.size")}</TableHead>
              <TableHead>{t("common.category")}</TableHead>
              <TableHead>{t("inventory.catalog.unit")}</TableHead>
              <TableHead>{t("inventory.catalog.reorder")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : !items?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {t("inventory.catalog.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.size ?? "—"}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>{item.reorder_level}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMut.mutate(item.id)}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? t("inventory.catalog.editTitle") : t("inventory.catalog.newTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sku">{t("inventory.stock.sku")}</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                placeholder="SOCK-M"
                disabled={!!form.id}
              />
            </div>
            <div>
              <Label htmlFor="size">{t("inventory.stock.size")}</Label>
              <Select value={form.size || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, size: v === "_none" ? "" : v }))}>
                <SelectTrigger id="size">
                  <SelectValue placeholder={t("common.optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {SOCK_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="name">{t("inventory.catalog.name")}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="category">{t("common.category")}</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="unit">{t("inventory.catalog.unit")}</Label>
              <Input id="unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="reorder">{t("inventory.catalog.reorder")}</Label>
              <Input
                id="reorder"
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="par">{t("inventory.catalog.par")}</Label>
              <Input
                id="par"
                type="number"
                min={0}
                value={form.parLevel}
                onChange={(e) => setForm((f) => ({ ...f, parLevel: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <CapabilityGate capability="inventory.manage">
              <Button onClick={() => saveMut.mutate()} disabled={!form.sku || !form.name || saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </CapabilityGate>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InventoryPage;

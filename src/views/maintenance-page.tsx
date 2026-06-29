"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, FileBarChart, LayoutDashboard, Loader2, Pencil, Trash2, Truck, Wrench } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { useWorkOrders } from "@/hooks/queries/useWorkOrders";
import { useAssets } from "@/hooks/queries/useAssets";
import { useSites } from "@/hooks/queries/useSites";
import { usePmSchedules } from "@/hooks/queries/usePmSchedules";
import { useDowntimeEvents } from "@/hooks/queries/useDowntimeEvents";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import {
  createAsset,
  createWorkOrder,
  deleteAsset,
  deletePmSchedule,
  deleteWorkOrder,
  listAssets,
  updateAsset,
  updateWorkOrder,
  updateWorkOrderStatus,
  upsertPmSchedule,
  runPmSweep,
  startDowntime,
  endDowntime,
  recordHeartbeat,
} from "@/lib/maintenance.functions";
import type { WorkOrderListRow } from "@/lib/queries/module-queries.core";
import { useAppStore } from "@/stores/app-store";
import { useFloorSupervisorView } from "@/hooks/use-floor-supervisor-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MaintenanceDashboardPanel = dynamic(
  () =>
    import("@/components/maintenance/maintenance-dashboard-panel").then(
      (m) => m.MaintenanceDashboardPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    ),
  },
);

const WO_STATUSES = ["planned", "in_progress", "on_hold", "completed", "cancelled"] as const;
const WO_KINDS = ["corrective", "preventive", "inspection", "installation"] as const;
const ASSET_CRITICALITIES = ["low", "medium", "high", "critical"] as const;

function MaintenancePage() {
  const canSchedule = usePermission("maintenance.schedule_pm");
  const canExecute = usePermission("maintenance.execute_wo");
  const canManage = usePermission("maintenance.manage");
  const canRequest = usePermission("maintenance.request_submit");
  const canLogistics = usePermission("maintenance.logistics_view");
  const canWeeklyReport = usePermission("maintenance.weekly_report");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Maintenance</h1>
            <p className="text-xs text-muted-foreground">
              Operational overview, technician queue, asset registry, and work orders.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRequest && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/maintenance/requests"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Requests</Link>
            </Button>
          )}
          {canLogistics && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/maintenance/logistics"><Truck className="mr-1.5 h-3.5 w-3.5" />Logistics</Link>
            </Button>
          )}
          {canWeeklyReport && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/maintenance/weekly-report"><FileBarChart className="mr-1.5 h-3.5 w-3.5" />Weekly report</Link>
            </Button>
          )}
        </div>
      </header>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="queue">My queue</TabsTrigger>
          <TabsTrigger value="orders">All work orders</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="pm">PM schedules</TabsTrigger>
          <TabsTrigger value="downtime">Downtime</TabsTrigger>
          {canSchedule && <TabsTrigger value="new">New work order</TabsTrigger>}
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          <MaintenanceDashboardPanel />
        </TabsContent>
        <TabsContent value="queue" className="mt-4">
          <WorkOrdersList scope="mine" canExecute={canExecute} canManage={canManage} canSchedule={canSchedule} />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <WorkOrdersList scope="all" canExecute={canExecute} canManage={canManage} canSchedule={canSchedule} />
        </TabsContent>
        <TabsContent value="assets" className="mt-4">
          <AssetsList canSchedule={canSchedule} canManage={canManage} />
        </TabsContent>
        <TabsContent value="pm" className="mt-4">
          <PmSchedulesPanel canSchedule={canSchedule} canManage={canManage} />
        </TabsContent>
        <TabsContent value="downtime" className="mt-4">
          <DowntimePanel canExecute={canExecute} />
        </TabsContent>
        {canSchedule && (
          <TabsContent value="new" className="mt-4">
            <NewWorkOrderForm />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function WorkOrdersList({
  scope,
  canExecute,
  canManage,
  canSchedule,
}: {
  scope: "mine" | "all";
  canExecute: boolean;
  canManage: boolean;
  canSchedule: boolean;
}) {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<WorkOrderListRow | null>(null);
  const [editForm, setEditForm] = useState({ title: "", kind: "corrective", description: "", planned_end: "" });
  const qc = useQueryClient();
  const { data, isLoading } = useWorkOrders({
    locationId: locationId ?? null,
    status: status === "all" ? null : status,
    mine: scope === "mine",
  });
  const rows = data?.items;
  const statusMut = useMutation({
    mutationFn: (input: { id: string; status: (typeof WO_STATUSES)[number] }) =>
      updateWorkOrderStatus(input),
    onSuccess: () => {
      toast.success("Work order updated");
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const editMut = useMutation({
    mutationFn: () =>
      updateWorkOrder({
        id: editing!.id,
        title: editForm.title,
        kind: editForm.kind as (typeof WO_KINDS)[number],
        description: editForm.description || null,
        planned_end: editForm.planned_end ? new Date(editForm.planned_end).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success("Work order saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWorkOrder({ id }),
    onSuccess: () => {
      toast.success("Work order deleted");
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function openEdit(w: WorkOrderListRow) {
    setEditing(w);
    setEditForm({
      title: w.title,
      kind: w.kind,
      description: "",
      planned_end: w.planned_end ? w.planned_end.slice(0, 16) : "",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            {WO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (rows?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {scope === "mine" ? "No work orders assigned to you." : "No work orders."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Planned end</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows!.map((w) => (
                <tr key={w.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-medium">{w.title}</td>
                  <td className="px-3 py-2 text-xs"><Badge variant="outline" className="uppercase">{w.kind}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{w.status}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {w.planned_end ? new Date(w.planned_end).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canSchedule && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(w)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          disabled={deleteMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete work order "${w.title}"?`)) deleteMut.mutate(w.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canExecute && (
                        <Select
                          value={w.status}
                          onValueChange={(v) => statusMut.mutate({ id: w.id, status: v as (typeof WO_STATUSES)[number] })}
                        >
                          <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit work order</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (editForm.title.length < 3) {
                toast.error("Title must be at least 3 characters");
                return;
              }
              editMut.mutate();
            }}
          >
            <FormField label="Title" required>
              <Input value={editForm.title} maxLength={200} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
            </FormField>
            <FormField label="Kind">
              <Select value={editForm.kind} onValueChange={(v) => setEditForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WO_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Planned end">
              <Input type="datetime-local" value={editForm.planned_end} onChange={(e) => setEditForm((f) => ({ ...f, planned_end: e.target.value }))} />
            </FormField>
            <FormField label="Description">
              <Textarea rows={3} value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={editMut.isPending}>
                {editMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetsList({ canSchedule, canManage }: { canSchedule: boolean; canManage: boolean }) {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const locsQ = useSites();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    tag: "",
    name: "",
    category: "",
    criticality: "medium",
    warranty_expires_on: "",
  });
  const { data, isLoading } = useAssets(locationId ?? null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editingId) {
        await updateAsset({
          id: editingId,
          tag: form.tag,
          name: form.name,
          category: form.category || null,
          criticality: form.criticality as (typeof ASSET_CRITICALITIES)[number],
          warranty_expires_on: form.warranty_expires_on || null,
        });
        return;
      }
      await createAsset({
        location_id: form.location_id,
        tag: form.tag,
        name: form.name,
        category: form.category || undefined,
        criticality: form.criticality as (typeof ASSET_CRITICALITIES)[number],
        warranty_expires_on: form.warranty_expires_on || null,
      });
    },
    onSuccess: () => {
      toast.success(editingId ? "Asset updated" : "Asset created");
      setOpen(false);
      setEditingId(null);
      setForm({ location_id: locationId ?? "", tag: "", name: "", category: "", criticality: "medium", warranty_expires_on: "" });
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAsset({ id }),
    onSuccess: () => {
      toast.success("Asset deleted");
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ location_id: locationId ?? locsQ.data?.[0]?.id ?? "", tag: "", name: "", category: "", criticality: "medium", warranty_expires_on: "" });
    setOpen(true);
  }

  function openEditAsset(a: NonNullable<typeof data>[number]) {
    setEditingId(a.id);
    setForm({
      location_id: a.location_id,
      tag: a.tag,
      name: a.name,
      category: a.category ?? "",
      criticality: a.criticality,
      warranty_expires_on: a.warranty_expires_on ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      {canSchedule && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>+ New asset</Button>
        </div>
      )}

      {open && (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.location_id || !form.tag || form.name.length < 1) {
              toast.error("Branch, tag, and name are required");
              return;
            }
            saveMut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Branch" required>
              <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Tag" required>
              <Input value={form.tag} maxLength={50} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Name" required>
            <Input value={form.name} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Category">
              <Input value={form.category} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </FormField>
            <FormField label="Criticality">
              <Select value={form.criticality} onValueChange={(v) => setForm((f) => ({ ...f, criticality: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CRITICALITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Warranty expires">
              <Input type="date" value={form.warranty_expires_on} onChange={(e) => setForm((f) => ({ ...f, warranty_expires_on: e.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "Save asset" : "Create asset"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No assets in scope.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Criticality</th>
                <th className="px-3 py-2 text-left">Warranty</th>
                {(canSchedule || canManage) && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-mono text-xs">{a.tag}</td>
                  <td className="px-3 py-2 font-medium">{a.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.category ?? "—"}</td>
                  <td className="px-3 py-2 text-xs"><Badge variant="outline" className="uppercase">{a.criticality}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {a.warranty_expires_on ? new Date(a.warranty_expires_on).toLocaleDateString() : "—"}
                  </td>
                  {(canSchedule || canManage) && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canSchedule && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditAsset(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete asset "${a.tag}"?`)) deleteMut.mutate(a.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PmSchedulesPanel({ canSchedule, canManage }: { canSchedule: boolean; canManage: boolean }) {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    asset_id: "",
    title: "",
    interval_days: 30,
    next_due_at: new Date().toISOString().slice(0, 16),
    active: true,
  });

  const pmQ = usePmSchedules(locationId ?? null);
  const locsQ = useSites();
  const assetsQ = useQuery({
    queryKey: ["assets", { locationId: form.location_id }],
    queryFn: () => (form.location_id ? listAssets({ locationId: form.location_id }) : Promise.resolve([])),
    enabled: !!form.location_id,
  });

  const sweepMut = useMutation({
    mutationFn: () => runPmSweep(),
    onSuccess: (r) => {
      toast.success(`Sweep complete — ${r.generated} work order(s) generated`);
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.pmSchedules(locationId) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      upsertPmSchedule({
          id: editingId ?? undefined,
          location_id: form.location_id,
          asset_id: form.asset_id || null,
          title: form.title,
          kind: "preventive",
          interval_days: Number(form.interval_days),
          next_due_at: new Date(form.next_due_at).toISOString(),
          active: form.active,
        }),
    onSuccess: () => {
      toast.success(editingId ? "PM schedule updated" : "PM schedule saved");
      setOpen(false);
      setEditingId(null);
      setForm((f) => ({ ...f, title: "", asset_id: "" }));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.pmSchedules(locationId) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePmSchedule({ id }),
    onSuccess: () => {
      toast.success("PM schedule deleted");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.pmSchedules(locationId) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function openEditSchedule(p: NonNullable<typeof pmQ.data>[number]) {
    setEditingId(p.id);
    setForm({
      location_id: p.location_id,
      asset_id: p.asset_id ?? "",
      title: p.title,
      interval_days: p.interval_days,
      next_due_at: p.next_due_at.slice(0, 16),
      active: p.active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Auto-generates work orders when next due date passes. Sweep runs every 15 minutes.
        </p>
        <div className="flex gap-2">
          {canSchedule && (
            <Button size="sm" variant="outline" onClick={() => sweepMut.mutate()} disabled={sweepMut.isPending}>
              {sweepMut.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Run sweep now
            </Button>
          )}
          {canSchedule && (
            <Button size="sm" onClick={() => { setEditingId(null); setOpen((v) => !v); }}>
              {open ? "Cancel" : "+ New schedule"}
            </Button>
          )}
        </div>
      </div>

      {open ? (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.location_id || form.title.length < 3) {
              toast.error("Branch and title are required");
              return;
            }
            createMut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Branch" required>
              <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Asset (optional)">
              <Select
                value={form.asset_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}
                disabled={!form.location_id}
              >
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {(assetsQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.tag} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField label="Title" required>
            <Input value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Interval (days)" required>
              <Input type="number" min={1} max={3650} value={form.interval_days}
                onChange={(e) => setForm((f) => ({ ...f, interval_days: Number(e.target.value) }))} />
            </FormField>
            <FormField label="Next due" required>
              <Input type="datetime-local" value={form.next_due_at}
                onChange={(e) => setForm((f) => ({ ...f, next_due_at: e.target.value }))} />
            </FormField>
          </div>
          {editingId && (
            <FormField label="Active">
              <Select value={form.active ? "yes" : "no"} onValueChange={(v) => setForm((f) => ({ ...f, active: v === "yes" }))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">active</SelectItem>
                  <SelectItem value="no">inactive</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? "Update schedule" : "Save schedule"}
            </Button>
          </div>
        </form>
      ) : null}

      {pmQ.isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (pmQ.data?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No PM schedules yet.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Interval</th>
                <th className="px-3 py-2 text-left">Next due</th>
                <th className="px-3 py-2 text-left">Last run</th>
                <th className="px-3 py-2 text-left">Active</th>
                {(canSchedule || canManage) && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {pmQ.data!.map((p) => {
                const overdue = new Date(p.next_due_at).getTime() < Date.now();
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-surface/40">
                    <td className="px-3 py-2 font-medium">{p.title}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">every {p.interval_days}d</td>
                    <td className={`px-3 py-2 text-xs ${overdue ? "text-rose-400 font-medium" : "text-muted-foreground"}`}>
                      {new Date(p.next_due_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.last_generated_at ? new Date(p.last_generated_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant={p.active ? "default" : "outline"}>{p.active ? "active" : "off"}</Badge>
                    </td>
                    {(canSchedule || canManage) && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canSchedule && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSchedule(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              disabled={deleteMut.isPending}
                              onClick={() => {
                                if (window.confirm(`Delete PM schedule "${p.title}"?`)) deleteMut.mutate(p.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DowntimePanel({ canExecute }: { canExecute: boolean }) {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const [openOnly, setOpenOnly] = useState(false);
  const [form, setForm] = useState({ location_id: locationId ?? "", asset_id: "", reason: "" });

  const dtQ = useDowntimeEvents({ locationId: locationId ?? null, openOnly });
  const locsQ = useSites();
  const assetsQ = useQuery({
    queryKey: ["assets", { locationId: form.location_id }],
    queryFn: () => (form.location_id ? listAssets({ locationId: form.location_id }) : Promise.resolve([])),
    enabled: !!form.location_id,
  });

  const startMut = useMutation({
    mutationFn: () =>
      startDowntime({ location_id: form.location_id, asset_id: form.asset_id || null, reason: form.reason }),
    onSuccess: () => {
      toast.success("Downtime started");
      setForm((f) => ({ ...f, reason: "" }));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.downtime() });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const endMut = useMutation({
    mutationFn: (id: string) => endDowntime({ id }),
    onSuccess: () => {
      toast.success("Downtime closed");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.downtime() });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const beatMut = useMutation({
    mutationFn: (asset_id: string) => recordHeartbeat({ asset_id }),
    onSuccess: () => {
      toast.success("Heartbeat recorded");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.downtime() });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      {canExecute && (
      <form
        className="space-y-3 rounded-lg border border-border bg-surface/30 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.location_id || form.reason.length < 3) {
            toast.error("Branch and reason are required");
            return;
          }
          startMut.mutate();
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Branch" required>
            <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Asset">
            <Select
              value={form.asset_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}
              disabled={!form.location_id}
            >
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {(assetsQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.tag} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Reason" required>
            <Input value={form.reason} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </FormField>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button" size="sm" variant="outline"
            disabled={!form.asset_id || beatMut.isPending}
            onClick={() => form.asset_id && beatMut.mutate(form.asset_id)}
          >
            Record heartbeat for selected asset
          </Button>
          <Button type="submit" disabled={startMut.isPending}>
            {startMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start downtime
          </Button>
        </div>
      </form>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant={openOnly ? "default" : "outline"} onClick={() => setOpenOnly((v) => !v)}>
          {openOnly ? "Showing open only" : "Show open only"}
        </Button>
      </div>

      {dtQ.isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (dtQ.data?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No downtime recorded.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Started</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {dtQ.data!.map((d) => {
                const live = !d.ended_at;
                const mins = d.duration_minutes
                  ?? (live ? Math.max(0, Math.round((Date.now() - new Date(d.started_at).getTime()) / 60000)) : 0);
                return (
                  <tr key={d.id} className="border-t border-border hover:bg-surface/40">
                    <td className="px-3 py-2 font-medium">{d.reason}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant={d.source === "silent_failure" ? "destructive" : "outline"} className="uppercase">
                        {d.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(d.started_at).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 text-xs ${live ? "text-amber-400 font-medium" : "text-muted-foreground"}`}>
                      {mins}m {live ? "(live)" : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {live && canExecute ? (
                        <Button size="sm" variant="outline" disabled={endMut.isPending}
                          onClick={() => endMut.mutate(d.id)}>
                          Close
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewWorkOrderForm() {
  const floorView = useFloorSupervisorView();
  const currentLoc = useAppStore((s) => s.currentLocationId);
        const qc = useQueryClient();
  const locsQ = useSites();
  const [form, setForm] = useState({
    location_id: currentLoc ?? "",
    title: "",
    kind: "corrective",
    description: "",
    asset_id: "",
    planned_end: "",
    priority: "normal",
  });
  const assetsQ = useQuery({
    queryKey: ["assets", { locationId: form.location_id }],
    queryFn: () => form.location_id ? listAssets({ locationId: form.location_id }) : Promise.resolve([]),
    enabled: !!form.location_id,
  });
  const mutation = useMutation({
    mutationFn: () =>
      createWorkOrder({
          location_id: form.location_id,
          title: form.title,
          kind: form.kind,
          description: form.description || undefined,
          asset_id: form.asset_id || null,
          planned_end: form.planned_end ? new Date(form.planned_end).toISOString() : null,
          priority: form.priority as "normal" | "medium" | "urgent",
        }),
    onSuccess: () => {
      toast.success("Work order created");
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      setForm((f) => ({ ...f, title: "", description: "", planned_end: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.title.length < 3) {
          toast.error("Branch and a title are required");
          return;
        }
        mutation.mutate();
      }}
    >
      <FormField label="Branch" required>
        <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Title" required>
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Priority">
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["normal", "medium", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      {!floorView && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Kind">
            <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["corrective", "preventive", "inspection", "installation"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Planned end">
            <Input type="datetime-local" value={form.planned_end} onChange={(e) => setForm((f) => ({ ...f, planned_end: e.target.value }))} />
          </FormField>
        </div>
      )}
      {!floorView && (
        <FormField label="Asset (optional)">
          <Select
            value={form.asset_id || "none"}
            onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}
            disabled={!form.location_id}
          >
            <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              {(assetsQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.tag} · {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <FormField label="Description">
        <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create work order
        </Button>
      </div>
    </form>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export default MaintenancePage;

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { SignaturePad } from "@/components/maintenance/signature-pad";
import { DeliveryPhotosGallery } from "@/components/maintenance/delivery-photos-gallery";
import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { useDeliveryRequests } from "@/hooks/queries/useDeliveryRequests";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import {
  createDeliveryRequest,
  dispatchDeliveryRequest,
  getDeliveryRequest,
  reviewDeliveryRequest,
  signDeliveryRequest,
  uploadDeliveryPhoto,
} from "@/lib/maintenance-logistics.functions";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/sla";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const ITEM_CATEGORIES = [
  { value: "spare_parts", label: "Spare Parts" },
  { value: "tools", label: "Tools" },
  { value: "consumables", label: "Consumables" },
  { value: "cleaning_materials", label: "Cleaning Materials" },
  { value: "safety_equipment", label: "Safety Equipment" },
  { value: "other", label: "Other" },
] as const;

function MaintenanceLogisticsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSubmit = usePermission("maintenance.logistics_submit");
  const canWarehouse = usePermission("maintenance.logistics_warehouse");
  const canVerify = usePermission("maintenance.logistics_verify");
  const { data: sites } = useSites();
  const { data, isLoading } = useDeliveryRequests({ locationId: locationId ?? null });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Delivery & Logistics</h1>
            <p className="text-xs text-muted-foreground">
              Warehouse-to-location material movement with dual-signature verification.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/maintenance">← Back</Link>
        </Button>
      </header>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Deliveries</TabsTrigger>
          {canSubmit && <TabsTrigger value="new">New request</TabsTrigger>}
          {selectedId && <TabsTrigger value="detail">Detail</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.length ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No delivery requests yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Request #</th>
                    <th className="px-3 py-2 text-left">Requested by</th>
                    <th className="px-3 py-2 text-left">Priority</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Photos</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface/40">
                      <td className="px-3 py-2 font-mono text-xs">{r.request_number}</td>
                      <td className="px-3 py-2">{r.requested_by}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="uppercase text-[10px]">{r.priority}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.status}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.request_date}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {((r as { photo_count?: number }).photo_count ?? 0) > 0
                          ? `${(r as { photo_count?: number }).photo_count} photo(s)`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {canSubmit && (
          <TabsContent value="new" className="mt-4">
            <NewDeliveryForm sites={sites ?? []} defaultLocationId={locationId ?? ""} />
          </TabsContent>
        )}

        {selectedId && (
          <TabsContent value="detail" className="mt-4">
            <DeliveryDetailPanel
              id={selectedId}
              canWarehouse={canWarehouse}
              canVerify={canVerify}
              onClose={() => setSelectedId(null)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function NewDeliveryForm({
  sites,
  defaultLocationId,
}: {
  sites: Array<{ id: string; code: string; name: string }>;
  defaultLocationId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    location_id: defaultLocationId,
    department: "",
    requested_by: "",
    priority: "normal",
    remarks: "",
  });
  const [items, setItems] = useState([
    { category: "spare_parts", item_name: "", quantity_requested: 1, unit: "ea", remarks: "" },
  ]);
  const [photos, setPhotos] = useState<File[]>([]);

  const createMut = useMutation({
    mutationFn: async () => {
      const result = await createDeliveryRequest({
        location_id: form.location_id,
        department: form.department || null,
        requested_by: form.requested_by,
        priority: form.priority as "normal" | "medium" | "urgent",
        remarks: form.remarks || null,
        items: items.map((i) => ({
          category: i.category as "spare_parts",
          item_name: i.item_name,
          quantity_requested: Number(i.quantity_requested),
          unit: i.unit,
          remarks: i.remarks || null,
        })),
      });
      for (const file of photos) {
        const base64 = await fileToBase64(file);
        await uploadDeliveryPhoto({
          delivery_request_id: result.id,
          file_name: file.name,
          file_base64: base64,
          mime_type: file.type,
          stage: "request",
        });
      }
      return result;
    },
    onSuccess: (r) => {
      toast.success(`Delivery ${r.request_number} created`);
      setPhotos([]);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.logistics() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || !form.requested_by || items.some((i) => !i.item_name)) {
          toast.error("Branch, requester, and item names are required");
          return;
        }
        createMut.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location" required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sites.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Department">
          <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Requested by" required>
          <Input value={form.requested_by} onChange={(e) => setForm((f) => ({ ...f, requested_by: e.target.value }))} />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Required items</Label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Select value={item.category} onValueChange={(v) => {
              const next = [...items];
              next[idx] = { ...next[idx]!, category: v };
              setItems(next);
            }}>
              <SelectTrigger className="w-[140px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Item name" value={item.item_name} className="min-w-0 flex-1"
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx]!, item_name: e.target.value };
                setItems(next);
              }} />
            <Input type="number" min={1} value={item.quantity_requested} className="w-20 shrink-0"
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx]!, quantity_requested: Number(e.target.value) };
                setItems(next);
              }} />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              disabled={items.length <= 1}
              aria-label="Remove item"
              onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline"
          onClick={() => setItems((i) => [...i, { category: "other", item_name: "", quantity_requested: 1, unit: "ea", remarks: "" }])}>
          + Add item
        </Button>
      </div>
      <Field label="Remarks">
        <Textarea rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
      </Field>
      <PhotoCaptureUpload
        label="Supporting photos (optional)"
        files={photos}
        onChange={setPhotos}
        disabled={createMut.isPending}
        uploading={createMut.isPending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Submit request
        </Button>
      </div>
    </form>
  );
}

function DeliveryDetailPanel({
  id,
  canWarehouse,
  canVerify,
  onClose,
}: {
  id: string;
  canWarehouse: boolean;
  canVerify: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-detail", id],
    queryFn: () => getDeliveryRequest({ id }),
  });
  const [supervisorSig, setSupervisorSig] = useState<string | null>(null);
  const [warehouseSig, setWarehouseSig] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  const uploadPhoto = async (stage: "dispatch" | "verification", file: File) => {
    setPhotoUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadDeliveryPhoto({
        delivery_request_id: id,
        file_name: file.name,
        file_base64: base64,
        mime_type: file.type,
        stage,
      });
      toast.success("Photo uploaded");
      void qc.invalidateQueries({ queryKey: ["delivery-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.logistics() });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const reviewMut = useMutation({
    mutationFn: (action: "approve" | "reject") => reviewDeliveryRequest({ id, action }),
    onSuccess: () => {
      toast.success("Review saved");
      void qc.invalidateQueries({ queryKey: ["delivery-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.logistics() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const dispatchMut = useMutation({
    mutationFn: () =>
      dispatchDeliveryRequest({
        id,
        items: (data?.items ?? []).map((i) => ({
          id: i.id,
          quantity_dispatched: Number(i.quantity_requested),
        })),
      }),
    onSuccess: () => {
      toast.success("Dispatched");
      void qc.invalidateQueries({ queryKey: ["delivery-detail", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const signMut = useMutation({
    mutationFn: (role: "supervisor" | "warehouse") => {
      const sig = role === "supervisor" ? supervisorSig : warehouseSig;
      if (!sig || !signerName) throw new Error("Signature and name required");
      return signDeliveryRequest({
        id,
        signer_role: role,
        signer_name: signerName,
        signature_data: sig,
      });
    },
    onSuccess: (r) => {
      toast.success(r.completed ? "Delivery completed" : "Signature recorded");
      void qc.invalidateQueries({ queryKey: ["delivery-detail", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const hasSupervisorSig = data.signatures.some((s) => s.signer_role === "supervisor");
  const hasWarehouseSig = data.signatures.some((s) => s.signer_role === "warehouse");

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{data.request_number}</h2>
          <p className="text-xs text-muted-foreground">Status: {data.status}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Requested</th>
              <th className="px-3 py-2 text-right">Dispatched</th>
              <th className="px-3 py-2 text-right">Received</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.item_name}</td>
                <td className="px-3 py-2 text-right">{i.quantity_requested}</td>
                <td className="px-3 py-2 text-right">{i.quantity_dispatched ?? "—"}</td>
                <td className="px-3 py-2 text-right">{i.quantity_received ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-border p-3">
        <p className="mb-2 text-sm font-medium">Photos</p>
        <DeliveryPhotosGallery photos={data.photos} />
      </div>

      {canWarehouse && data.status === "submitted" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => reviewMut.mutate("approve")}>Approve</Button>
          <Button size="sm" variant="destructive" onClick={() => reviewMut.mutate("reject")}>Reject</Button>
        </div>
      )}

      {canWarehouse && ["approved", "preparing"].includes(data.status) && (
        <div className="space-y-3 rounded border border-dashed border-border p-3">
          <p className="text-sm font-medium">Dispatch</p>
          <PhotoCaptureUpload
            label="Dispatch photos (optional)"
            onUpload={(file) => uploadPhoto("dispatch", file)}
            uploading={photoUploading}
            disabled={dispatchMut.isPending}
          />
          <Button size="sm" onClick={() => dispatchMut.mutate()} disabled={dispatchMut.isPending}>
            Mark dispatched
          </Button>
        </div>
      )}

      {canVerify && ["dispatched", "verification_pending"].includes(data.status) && (
        <div className="space-y-3 rounded border border-dashed border-border p-3">
          <p className="text-sm font-medium">Verification</p>
          <PhotoCaptureUpload
            label="Receipt verification photos"
            onUpload={(file) => uploadPhoto("verification", file)}
            uploading={photoUploading}
            disabled={signMut.isPending}
          />
          <p className="text-sm font-medium">Verification signatures</p>
          <Field label="Signer name">
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </Field>
          {!hasSupervisorSig && canVerify && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Supervisor signature</p>
              <SignaturePad onChange={setSupervisorSig} />
              <Button size="sm" className="mt-2" disabled={!supervisorSig || signMut.isPending}
                onClick={() => signMut.mutate("supervisor")}>
                Sign as supervisor
              </Button>
            </div>
          )}
          {!hasWarehouseSig && canWarehouse && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Warehouse signature</p>
              <SignaturePad onChange={setWarehouseSig} />
              <Button size="sm" className="mt-2" disabled={!warehouseSig || signMut.isPending}
                onClick={() => signMut.mutate("warehouse")}>
                Sign as warehouse
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export default MaintenanceLogisticsPage;

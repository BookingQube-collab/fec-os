"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceAttachmentsGallery } from "@/components/maintenance/maintenance-attachments-gallery";
import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { useMaintenanceRequests } from "@/hooks/queries/useMaintenanceRequests";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import {
  acceptMaintenanceRequest,
  createMaintenanceRequest,
  getMaintenanceRequest,
  listMaintenanceTechnicians,
  updateMaintenanceRequestProgress,
  uploadMaintenanceAttachment,
} from "@/lib/maintenance-requests.functions";
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

const CATEGORIES = ["Electrical", "Plumbing", "HVAC", "Structural", "Equipment", "General"] as const;
const ISSUE_TYPES = ["Breakdown", "Leak", "Noise", "Safety", "Cleaning", "Other"] as const;

function MaintenanceRequestsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSubmit = usePermission("maintenance.request_submit");
  const canManage = usePermission("maintenance.manage");
  const canExecute = usePermission("maintenance.execute_wo");
  const { data: sites } = useSites();
  const { data, isLoading } = useMaintenanceRequests({ locationId: locationId ?? null });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Maintenance Requests</h1>
          <p className="text-xs text-muted-foreground">
            Location supervisors submit daily maintenance requests with photos and priority.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/maintenance">← Back to Maintenance</Link>
        </Button>
      </header>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Requests</TabsTrigger>
          {canSubmit && <TabsTrigger value="new">New request</TabsTrigger>}
          {selectedId && <TabsTrigger value="detail">Detail</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <RequestsList
            data={data}
            isLoading={isLoading}
            canManage={canManage}
            canExecute={canExecute}
            onOpen={setSelectedId}
          />
        </TabsContent>

        {canSubmit && (
          <TabsContent value="new" className="mt-4">
            <NewRequestForm sites={sites ?? []} defaultLocationId={locationId ?? ""} />
          </TabsContent>
        )}

        {selectedId && (
          <TabsContent value="detail" className="mt-4">
            <RequestDetailPanel
              id={selectedId}
              canManage={canManage}
              canExecute={canExecute}
              onClose={() => setSelectedId(null)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function RequestsList({
  data,
  isLoading,
  canManage,
  canExecute,
  onOpen,
}: {
  data: ReturnType<typeof useMaintenanceRequests>["data"];
  isLoading: boolean;
  canManage: boolean;
  canExecute: boolean;
  onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();

  const acceptMut = useMutation({
    mutationFn: (id: string) => acceptMaintenanceRequest({ id }),
    onSuccess: () => {
      toast.success("Request accepted — work order created");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const progressMut = useMutation({
    mutationFn: (input: { id: string; status: "in_progress" | "completed" }) =>
      updateMaintenanceRequestProgress(input),
    onSuccess: () => {
      toast.success("Request updated");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data?.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No maintenance requests yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Request #</th>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Reported</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface/40">
              <td className="px-3 py-2 font-mono text-xs">{r.request_number}</td>
              <td className="px-3 py-2">{r.category}</td>
              <td className="px-3 py-2">
                <Badge variant={r.priority === "urgent" ? "destructive" : "outline"} className="uppercase text-[10px]">
                  {r.priority}
                </Badge>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.status}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(r.reported_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  {canManage && r.status === "submitted" && (
                    <Button size="sm" variant="outline" disabled={acceptMut.isPending}
                      onClick={() => acceptMut.mutate(r.id)}>
                      Accept
                    </Button>
                  )}
                  {canExecute && r.status === "accepted" && (
                    <Button size="sm" variant="outline" disabled={progressMut.isPending}
                      onClick={() => progressMut.mutate({ id: r.id, status: "in_progress" })}>
                      Start
                    </Button>
                  )}
                  {canExecute && ["accepted", "in_progress"].includes(r.status) && (
                    <Button size="sm" disabled={progressMut.isPending}
                      onClick={() => progressMut.mutate({ id: r.id, status: "completed" })}>
                      Close
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>
                    Open
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewRequestForm({
  sites,
  defaultLocationId,
}: {
  sites: Array<{ id: string; code: string; name: string }>;
  defaultLocationId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    location_id: defaultLocationId,
    area: "",
    category: "General",
    issue_type: "Breakdown",
    priority: "normal",
    description: "",
    assigned_technician_id: "",
    reporter_name: "",
    reported_at: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  const techQ = useQuery({
    queryKey: ["maint-techs", form.location_id],
    queryFn: () => listMaintenanceTechnicians({ locationId: form.location_id }),
    enabled: !!form.location_id,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const result = await createMaintenanceRequest({
        location_id: form.location_id,
        area: form.area || null,
        category: form.category,
        issue_type: form.issue_type,
        priority: form.priority as "normal" | "medium" | "urgent",
        description: form.description,
        assigned_technician_id: form.assigned_technician_id || null,
        reporter_name: form.reporter_name || null,
        reported_at: form.reported_at ? new Date(form.reported_at).toISOString() : undefined,
      });
      for (const file of files) {
        const base64 = await fileToBase64(file);
        await uploadMaintenanceAttachment({
          request_id: result.id,
          file_name: file.name,
          file_base64: base64,
          mime_type: file.type,
          kind: "submission",
        });
      }
      return result;
    },
    onSuccess: (r) => {
      toast.success(`Request ${r.request_number} submitted`);
      setForm((f) => ({ ...f, description: "", area: "" }));
      setFiles([]);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.description.length < 3) {
          toast.error("Branch and description are required");
          return;
        }
        createMut.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Branch" required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {(sites ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Area">
          <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Category" required>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Issue type">
          <Select value={form.issue_type} onValueChange={(v) => setForm((f) => ({ ...f, issue_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ISSUE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority" required>
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description" required>
        <Textarea rows={4} value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reporter name">
          <Input value={form.reporter_name}
            onChange={(e) => setForm((f) => ({ ...f, reporter_name: e.target.value }))} />
        </Field>
        <Field label="Date & time">
          <Input type="datetime-local" value={form.reported_at}
            onChange={(e) => setForm((f) => ({ ...f, reported_at: e.target.value }))} />
        </Field>
      </div>
      <Field label="Assign technician">
        <Select
          value={form.assigned_technician_id || "none"}
          onValueChange={(v) => setForm((f) => ({ ...f, assigned_technician_id: v === "none" ? "" : v }))}
          disabled={!form.location_id}
        >
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— none —</SelectItem>
            {(techQ.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.display_name ?? t.id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <PhotoCaptureUpload
        label="Photos / videos"
        files={files}
        onChange={setFiles}
        acceptVideos
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

function RequestDetailPanel({
  id,
  canManage,
  canExecute,
  onClose,
}: {
  id: string;
  canManage: boolean;
  canExecute: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-request-detail", id],
    queryFn: () => getMaintenanceRequest({ id }),
  });
  const [progressNotes, setProgressNotes] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  const uploadPhoto = async (kind: "before" | "after", file: File) => {
    setPhotoUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadMaintenanceAttachment({
        request_id: id,
        file_name: file.name,
        file_base64: base64,
        mime_type: file.type,
        kind,
      });
      toast.success(`${kind === "before" ? "Before" : "After"} photo uploaded`);
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const acceptMut = useMutation({
    mutationFn: () => acceptMaintenanceRequest({ id }),
    onSuccess: () => {
      toast.success("Request accepted — work order created");
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const progressMut = useMutation({
    mutationFn: (input: { status?: "in_progress" | "completed"; progress_notes?: string }) =>
      updateMaintenanceRequestProgress({ id, ...input }),
    onSuccess: () => {
      toast.success("Request updated");
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Request not found.</p>;
  }

  const canUploadProgressPhotos = canExecute && ["accepted", "in_progress"].includes(data.status);

  return (
    <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-surface/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-lg font-semibold">{data.request_number}</h2>
          <p className="text-xs text-muted-foreground">
            {data.category} · {data.issue_type ?? "Issue"} ·{" "}
            <Badge variant={data.priority === "urgent" ? "destructive" : "outline"} className="uppercase text-[10px]">
              {data.priority}
            </Badge>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
          <p>{data.status}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Reported</p>
          <p>{new Date(data.reported_at).toLocaleString()}</p>
        </div>
        {data.area && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Area</p>
            <p>{data.area}</p>
          </div>
        )}
        {data.reporter_name && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Reporter</p>
            <p>{data.reporter_name}</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Description</p>
        <p className="text-sm whitespace-pre-wrap">{data.description}</p>
      </div>

      {data.progress_notes && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Progress notes</p>
          <p className="text-sm whitespace-pre-wrap">{data.progress_notes}</p>
        </div>
      )}

      <div className="rounded border border-border p-3">
        <p className="mb-2 text-sm font-medium">Attachments</p>
        <MaintenanceAttachmentsGallery attachments={data.attachments ?? []} />
      </div>

      {canUploadProgressPhotos && (
        <div className="space-y-3 rounded border border-dashed border-border p-3">
          <p className="text-sm font-medium">Work progress photos</p>
          <PhotoCaptureUpload
            label="Before photos"
            onUpload={(file) => uploadPhoto("before", file)}
            uploading={photoUploading}
            acceptVideos
            disabled={progressMut.isPending}
          />
          <PhotoCaptureUpload
            label="After photos"
            onUpload={(file) => uploadPhoto("after", file)}
            uploading={photoUploading}
            acceptVideos
            disabled={progressMut.isPending}
          />
          <Field label="Progress notes">
            <Textarea
              rows={3}
              value={progressNotes}
              onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Optional notes on work performed…"
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && data.status === "submitted" && (
          <Button size="sm" variant="outline" disabled={acceptMut.isPending}
            onClick={() => acceptMut.mutate()}>
            Accept
          </Button>
        )}
        {canExecute && data.status === "accepted" && (
          <Button size="sm" variant="outline" disabled={progressMut.isPending}
            onClick={() => progressMut.mutate({ status: "in_progress", progress_notes: progressNotes || undefined })}>
            Start work
          </Button>
        )}
        {canExecute && data.status === "in_progress" && (
          <Button size="sm" disabled={progressMut.isPending}
            onClick={() => progressMut.mutate({ status: "completed", progress_notes: progressNotes || undefined })}>
            Mark completed
          </Button>
        )}
        {canExecute && ["accepted", "in_progress"].includes(data.status) && progressNotes && (
          <Button size="sm" variant="secondary" disabled={progressMut.isPending}
            onClick={() => progressMut.mutate({ progress_notes: progressNotes })}>
            Save notes
          </Button>
        )}
      </div>
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

export default MaintenanceRequestsPage;

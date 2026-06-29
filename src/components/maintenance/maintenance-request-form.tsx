"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { useAuth } from "@/hooks/use-auth";
import {
  createMaintenanceRequest,
  listMaintenanceTechnicians,
  uploadMaintenanceAttachment,
} from "@/lib/maintenance-requests.functions";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/sla";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const MAINTENANCE_REQUEST_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "Structural",
  "Equipment",
  "General",
] as const;

export const MAINTENANCE_REQUEST_ISSUE_TYPES = [
  "Breakdown",
  "Leak",
  "Noise",
  "Safety",
  "Cleaning",
  "Other",
] as const;

export type MaintenanceRequestFormLabels = {
  branch: string;
  area: string;
  category: string;
  issueType: string;
  priority: string;
  description: string;
  reporterName: string;
  dateTime: string;
  assignTechnician: string;
  photos: string;
  submit: string;
  none: string;
  branchRequired: string;
};

const DEFAULT_LABELS: MaintenanceRequestFormLabels = {
  branch: "Branch",
  area: "Area",
  category: "Category",
  issueType: "Issue type",
  priority: "Priority",
  description: "Description",
  reporterName: "Reporter name",
  dateTime: "Date & time",
  assignTechnician: "Assign technician",
  photos: "Photos / videos",
  submit: "Submit request",
  none: "— none —",
  branchRequired: "Branch and description are required",
};

type SiteOption = { id: string; code: string; name: string };

export function MaintenanceRequestForm({
  sites,
  defaultLocationId,
  defaultReporterName = "",
  labels: labelOverrides,
  className,
  onSuccess,
  invalidateDailyOps,
}: {
  sites: SiteOption[];
  defaultLocationId: string;
  defaultReporterName?: string;
  labels?: Partial<MaintenanceRequestFormLabels>;
  className?: string;
  onSuccess?: (result: { id: string; request_number: string }) => void;
  /** Also invalidate daily ops maintenance list after submit */
  invalidateDailyOps?: boolean;
}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const qc = useQueryClient();
  const { profile } = useAuth();
  const reporterFromProfile = defaultReporterName || profile?.display_name || "";
  const [form, setForm] = useState({
    location_id: defaultLocationId,
    area: "",
    category: "General",
    issue_type: "Breakdown",
    priority: "normal",
    description: "",
    assigned_technician_id: "",
    reporter_name: reporterFromProfile,
    reported_at: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (defaultLocationId) {
      setForm((f) => ({ ...f, location_id: defaultLocationId }));
    }
  }, [defaultLocationId]);

  useEffect(() => {
    if (reporterFromProfile) {
      setForm((f) => ({ ...f, reporter_name: f.reporter_name || reporterFromProfile }));
    }
  }, [reporterFromProfile]);

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
      setForm((f) => ({
        ...f,
        description: "",
        area: "",
        assigned_technician_id: "",
        reported_at: "",
      }));
      setFiles([]);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      if (invalidateDailyOps) {
        void qc.invalidateQueries({ queryKey: ["dailyOps", "maintenance"] });
        void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      }
      onSuccess?.(r);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className={className ?? "max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || form.description.length < 3) {
          toast.error(labels.branchRequired);
          return;
        }
        createMut.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.branch} required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {sites.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={labels.area}>
          <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={labels.category} required>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_REQUEST_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={labels.issueType}>
          <Select value={form.issue_type} onValueChange={(v) => setForm((f) => ({ ...f, issue_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_REQUEST_ISSUE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={labels.priority} required>
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={labels.description} required>
        <Textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.reporterName}>
          <Input
            value={form.reporter_name}
            onChange={(e) => setForm((f) => ({ ...f, reporter_name: e.target.value }))}
          />
        </Field>
        <Field label={labels.dateTime}>
          <Input
            type="datetime-local"
            value={form.reported_at}
            onChange={(e) => setForm((f) => ({ ...f, reported_at: e.target.value }))}
          />
        </Field>
      </div>
      <Field label={labels.assignTechnician}>
        <Select
          value={form.assigned_technician_id || "none"}
          onValueChange={(v) => setForm((f) => ({ ...f, assigned_technician_id: v === "none" ? "" : v }))}
          disabled={!form.location_id}
        >
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{labels.none}</SelectItem>
            {(techQ.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.display_name ?? t.id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <PhotoCaptureUpload
        label={labels.photos}
        files={files}
        onChange={setFiles}
        acceptVideos
        disabled={createMut.isPending}
        uploading={createMut.isPending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {labels.submit}
        </Button>
      </div>
    </form>
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

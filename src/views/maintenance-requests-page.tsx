"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type {
  MaintenanceRequestFormInitialValues,
  MaintenanceRequestFormLabels,
} from "@/components/maintenance/maintenance-request-form";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaThumbnail, useMediaPreview } from "@/components/maintenance/media-preview-lightbox";
import { fileToBase64, PhotoCaptureUpload } from "@/components/maintenance/photo-capture-upload";
import { useMaintenanceRequests } from "@/hooks/queries/useMaintenanceRequests";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import {
  acceptMaintenanceRequest,
  getMaintenanceRequest,
  updateMaintenanceRequestProgress,
  uploadMaintenanceAttachment,
} from "@/lib/maintenance-requests.functions";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type RequestsTab = "list" | "new" | "detail" | "edit";

const MaintenanceRequestForm = dynamic(
  () =>
    import("@/components/maintenance/maintenance-request-form").then(
      (m) => m.MaintenanceRequestForm,
    ),
  { ssr: false, loading: () => <Skeleton className="h-96 rounded-2xl" /> },
);

const MaintenanceAttachmentsGallery = dynamic(
  () =>
    import("@/components/maintenance/maintenance-attachments-gallery").then(
      (m) => m.MaintenanceAttachmentsGallery,
    ),
  { ssr: false, loading: () => <Skeleton className="h-40 rounded-2xl" /> },
);

const CloseMaintenanceRequestDialog = dynamic(
  () =>
    import("@/components/maintenance/close-maintenance-request-dialog").then(
      (m) => m.CloseMaintenanceRequestDialog,
    ),
  { ssr: false },
);

const ManageLocationAreasDialog = dynamic(
  () =>
    import("@/components/maintenance/manage-location-areas-dialog").then(
      (m) => m.ManageLocationAreasDialog,
    ),
  { ssr: false },
);

const EDITABLE_STATUSES = new Set(["submitted", "accepted", "in_progress"]);

function canEditRequestStatus(status: string): boolean {
  return EDITABLE_STATUSES.has(status);
}

function extractRequestedTechnician(remarks: string | null | undefined): string | null {
  if (!remarks) return null;
  return remarks.match(/^Requested technician:\s*(.+)$/im)?.[1]?.trim() ?? null;
}

function MaintenanceRequestsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSubmit = usePermission("maintenance.request_submit");
  const canManage = usePermission("maintenance.manage");
  const canExecute = usePermission("maintenance.execute_wo");
  const { data: sites } = useSites();
  const { data, isLoading } = useMaintenanceRequests({ locationId: locationId ?? null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestsTab>("list");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      setSelectedId(id);
      setActiveTab("detail");
    }
  }, []);

  const openRequest = (id: string) => {
    setSelectedId(id);
    setActiveTab("detail");
  };

  const openEdit = (id: string) => {
    setSelectedId(id);
    setActiveTab("edit");
  };

  const dismissDetail = () => {
    setSelectedId(null);
    setActiveTab("list");
  };

  const handleTabChange = (value: string) => {
    const next = value as RequestsTab;
    if ((next === "detail" || next === "edit") && !selectedId) {
      setActiveTab("list");
      return;
    }
    setActiveTab(next);
  };

  const formLabels = {
    branch: t("dailyOps.table.venue"),
    area: t("dailyOps.maintenance.area"),
    category: t("dailyOps.maintenance.category"),
    issueType: t("dailyOps.maintenance.issueType"),
    priority: t("dailyOps.maintenance.priority"),
    description: t("dailyOps.maintenance.description"),
    reporterName: t("dailyOps.maintenance.reporter"),
    dateTime: t("dailyOps.maintenance.dateTime"),
    assignTechnician: t("dailyOps.maintenance.assigned"),
    photos: t("dailyOps.maintenance.photos"),
    submit: t("dailyOps.maintenance.submit"),
    save: t("maintenanceRequests.actions.save"),
    cancel: t("common.cancel"),
    none: t("dailyOps.maintenance.none"),
    branchRequired: t("dailyOps.maintenance.branchRequired"),
    promptHint: t("dailyOps.maintenance.promptHint"),
    descriptionPlaceholder: t("dailyOps.maintenance.descriptionPlaceholder"),
    aiAssist: t("dailyOps.maintenance.aiAssist"),
    aiDrafted: t("dailyOps.maintenance.aiDrafted"),
    aiDraftedFallback: t("dailyOps.maintenance.aiDraftedFallback"),
    aiBadge: t("dailyOps.maintenance.aiBadge"),
    aiNeedsNotes: t("dailyOps.maintenance.aiNeedsNotes"),
    aiAssigneeAmbiguous: t("dailyOps.maintenance.aiAssigneeAmbiguous"),
    aiAssigneeRequested: t("dailyOps.maintenance.aiAssigneeRequested"),
    requestedTechnician: t("dailyOps.maintenance.requestedTechnician"),
    aiVenueMatched: t("dailyOps.maintenance.aiVenueMatched"),
    reviewDetails: t("dailyOps.maintenance.reviewDetails"),
    reviewHint: t("dailyOps.maintenance.reviewHint"),
    selectArea: t("dailyOps.maintenance.selectArea"),
    noAreasConfigured: t("dailyOps.maintenance.noAreasConfigured"),
    customCategory: t("dailyOps.maintenance.customCategory"),
    customIssueType: t("dailyOps.maintenance.customIssueType"),
    customArea: t("dailyOps.maintenance.customArea"),
    customCategoryPlaceholder: t("dailyOps.maintenance.customCategoryPlaceholder"),
    customIssueTypePlaceholder: t("dailyOps.maintenance.customIssueTypePlaceholder"),
    customAreaPlaceholder: t("dailyOps.maintenance.customAreaPlaceholder"),
    customCategoryRequired: t("dailyOps.maintenance.customCategoryRequired"),
    customIssueTypeRequired: t("dailyOps.maintenance.customIssueTypeRequired"),
    customAreaRequired: t("dailyOps.maintenance.customAreaRequired"),
    specifyOther: t("dailyOps.maintenance.specifyOther"),
    otherRequired: t("dailyOps.maintenance.otherRequired"),
    sampleIntro: t("dailyOps.maintenance.sampleIntro"),
    checkVenue: t("dailyOps.maintenance.checkVenue"),
    checkIssue: t("dailyOps.maintenance.checkIssue"),
    checkArea: t("dailyOps.maintenance.checkArea"),
    checkTechnician: t("dailyOps.maintenance.checkTechnician"),
    checkWhen: t("dailyOps.maintenance.checkWhen"),
    checkUrgency: t("dailyOps.maintenance.checkUrgency"),
    useSample: t("dailyOps.maintenance.useSample"),
    sampleParagraph: t("dailyOps.maintenance.sampleParagraph"),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("maintenanceRequests.title")}
        subtitle={t("maintenanceRequests.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <ManageLocationAreasDialog
                sites={sites ?? []}
                defaultLocationId={locationId ?? undefined}
              />
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/maintenance">{t("maintenanceRequests.back")}</Link>
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="list">{t("maintenanceRequests.tabs.list")}</TabsTrigger>
          {canSubmit && <TabsTrigger value="new">{t("maintenanceRequests.tabs.new")}</TabsTrigger>}
          {selectedId && <TabsTrigger value="detail">{t("maintenanceRequests.tabs.detail")}</TabsTrigger>}
          {selectedId && activeTab === "edit" && (
            <TabsTrigger value="edit">{t("maintenanceRequests.tabs.edit")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <RequestsList
            data={data}
            isLoading={isLoading}
            canManage={canManage}
            canExecute={canExecute}
            onOpen={openRequest}
            onEdit={openEdit}
          />
        </TabsContent>

        {canSubmit && (
          <TabsContent value="new" className="mt-4">
            <MaintenanceRequestForm
              sites={sites ?? []}
              defaultLocationId={locationId ?? ""}
              labels={formLabels}
            />
          </TabsContent>
        )}

        {selectedId && (
          <TabsContent value="detail" className="mt-4">
            <RequestDetailPanel
              id={selectedId}
              canManage={canManage}
              canExecute={canExecute}
              onClose={dismissDetail}
              onEdit={() => setActiveTab("edit")}
            />
          </TabsContent>
        )}

        {selectedId && activeTab === "edit" && canManage && (
          <TabsContent value="edit" className="mt-4">
            <RequestEditPanel
              id={selectedId}
              sites={sites ?? []}
              labels={formLabels}
              onCancel={() => setActiveTab("detail")}
              onSaved={() => setActiveTab("detail")}
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
  onEdit,
}: {
  data: ReturnType<typeof useMaintenanceRequests>["data"];
  isLoading: boolean;
  canManage: boolean;
  canExecute: boolean;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [closeTarget, setCloseTarget] = useState<{ id: string; number: string } | null>(null);

  const acceptMut = useMutation({
    mutationFn: (id: string) => acceptMaintenanceRequest({ id }),
    onSuccess: () => {
      toast.success(t("maintenanceRequests.toasts.accepted"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const progressMut = useMutation({
    mutationFn: (input: { id: string; status: "in_progress" }) =>
      updateMaintenanceRequestProgress(input),
    onSuccess: () => {
      toast.success(t("maintenanceRequests.toasts.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("maintenanceRequests.loading")}</p>;
  }

  if (!data?.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("maintenanceRequests.empty")}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t("maintenanceRequests.columns.request")}</th>
              <th className="px-3 py-2 text-left">{t("maintenanceRequests.columns.category")}</th>
              <th className="px-3 py-2 text-left">{t("maintenanceRequests.columns.priority")}</th>
              <th className="px-3 py-2 text-left">{t("maintenanceRequests.columns.status")}</th>
              <th className="px-3 py-2 text-left">{t("maintenanceRequests.columns.reported")}</th>
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
                        {t("maintenanceRequests.actions.accept")}
                      </Button>
                    )}
                    {canManage && canEditRequestStatus(r.status) && (
                      <Button size="sm" variant="outline" onClick={() => onEdit(r.id)}>
                        {t("maintenanceRequests.actions.edit")}
                      </Button>
                    )}
                    {canExecute && r.status === "accepted" && (
                      <Button size="sm" variant="outline" disabled={progressMut.isPending}
                        onClick={() => progressMut.mutate({ id: r.id, status: "in_progress" })}>
                        {t("maintenanceRequests.actions.start")}
                      </Button>
                    )}
                    {canExecute && ["accepted", "in_progress"].includes(r.status) && (
                      <Button size="sm" onClick={() => setCloseTarget({ id: r.id, number: r.request_number })}>
                        {t("maintenanceRequests.actions.close")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>
                      {t("maintenanceRequests.actions.open")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {closeTarget && (
        <CloseMaintenanceRequestDialog
          open={!!closeTarget}
          onOpenChange={(open) => {
            if (!open) setCloseTarget(null);
          }}
          requestId={closeTarget.id}
          requestNumber={closeTarget.number}
        />
      )}
    </>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

function RequestEditPanel({
  id,
  sites,
  labels,
  onCancel,
  onSaved,
}: {
  id: string;
  sites: Array<{ id: string; code: string; name: string }>;
  labels: MaintenanceRequestFormLabels;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-request-detail", id],
    queryFn: () => getMaintenanceRequest({ id }),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("maintenanceRequests.loading")}</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("maintenanceRequests.notFound")}</p>;
  }

  if (!canEditRequestStatus(data.status)) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-5">
        <p className="text-sm text-muted-foreground">{t("maintenanceRequests.editLocked")}</p>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("maintenanceRequests.actions.backToDetail")}
        </Button>
      </div>
    );
  }

  const initialValues: MaintenanceRequestFormInitialValues = {
    location_id: data.location_id,
    area: data.area,
    category: data.category,
    issue_type: data.issue_type,
    priority: data.priority,
    description: data.description,
    assigned_technician_id: data.assigned_technician_id,
    requested_technician_name: extractRequestedTechnician(data.remarks),
    reporter_name: data.reporter_name,
    reported_at: data.reported_at,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("maintenanceRequests.tabs.edit")}
          </p>
          <h2 className="font-mono text-lg font-semibold tracking-tight">{data.request_number}</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("maintenanceRequests.actions.backToDetail")}
        </Button>
      </div>
      <MaintenanceRequestForm
        key={id}
        mode="edit"
        requestId={id}
        initialValues={initialValues}
        sites={sites}
        defaultLocationId={data.location_id}
        labels={labels}
        onCancel={onCancel}
        onSuccess={() => {
          onSaved();
        }}
      />
    </div>
  );
}

function RequestDetailPanel({
  id,
  canManage,
  canExecute,
  onClose,
  onEdit,
}: {
  id: string;
  canManage: boolean;
  canExecute: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { openPreview, previewDialog } = useMediaPreview();
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-request-detail", id],
    queryFn: () => getMaintenanceRequest({ id }),
  });
  const [progressNotes, setProgressNotes] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

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
      toast.success(
        kind === "before"
          ? t("maintenanceRequests.toasts.beforePhoto")
          : t("maintenanceRequests.toasts.afterPhoto"),
      );
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
      toast.success(t("maintenanceRequests.toasts.accepted"));
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
      void qc.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const progressMut = useMutation({
    mutationFn: (input: { status?: "in_progress"; progress_notes?: string }) =>
      updateMaintenanceRequestProgress({ id, ...input }),
    onSuccess: () => {
      toast.success(t("maintenanceRequests.toasts.updated"));
      void qc.invalidateQueries({ queryKey: ["maintenance-request-detail", id] });
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.requests() });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("maintenanceRequests.loading")}</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("maintenanceRequests.notFound")}</p>;
  }

  const canUploadProgressPhotos = canExecute && ["accepted", "in_progress"].includes(data.status);
  const canClose = canExecute && ["accepted", "in_progress"].includes(data.status);
  const showEdit = canManage && canEditRequestStatus(data.status);
  const attachments = data.attachments ?? [];
  const submissionMedia = attachments.filter((a) => a.kind === "submission");
  const workMedia = attachments.filter((a) => a.kind === "before" || a.kind === "after");
  const completionPhotos = attachments.filter((a) => a.kind === "completion");
  const isCompleted = data.status === "completed";
  const locationLabel = data.location
    ? `${data.location.name}${data.location.code ? ` (${data.location.code})` : ""}`
    : "—";
  const assignedLabel =
    data.assigned_technician_name ??
    (data.assigned_technician_id ? data.assigned_technician_id : t("maintenanceRequests.detail.unassigned"));
  const remarksText = typeof data.remarks === "string" ? data.remarks.trim() : "";
  const requestedFromRemarks = extractRequestedTechnician(remarksText);

  return (
    <div className="mx-auto max-w-3xl space-y-5 rounded-lg border border-border bg-surface/30 p-5 print:max-w-none print:border-0 print:bg-transparent print:p-0">
      {previewDialog}

      <div className="flex items-start justify-between gap-3 print:items-center">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("maintenanceRequests.detail.reportTitle")}
          </p>
          <h2 className="font-mono text-xl font-semibold tracking-tight">{data.request_number}</h2>
          <p className="text-xs text-muted-foreground">{t("maintenanceRequests.detail.printHint")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={data.priority === "urgent" ? "destructive" : "outline"}
            className="uppercase text-[10px]"
          >
            {data.priority}
          </Badge>
          <Badge variant="secondary" className="uppercase text-[10px]">
            {data.status}
          </Badge>
          <Button size="sm" variant="ghost" className="print:hidden" onClick={onClose}>
            {t("maintenanceRequests.actions.dismiss")}
          </Button>
        </div>
      </div>

      <ReportSection title={t("maintenanceRequests.detail.requestInfo")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <ReportField label={t("maintenanceRequests.detail.requestId")}>
            <span className="font-mono text-xs">{data.request_number}</span>
          </ReportField>
          <ReportField label={t("maintenanceRequests.detail.status")}>{data.status}</ReportField>
          <ReportField label={t("maintenanceRequests.detail.priority")}>
            <span className="uppercase">{data.priority}</span>
          </ReportField>
          <ReportField label={t("maintenanceRequests.detail.category")}>{data.category}</ReportField>
          <ReportField label={t("maintenanceRequests.detail.issueType")}>
            {data.issue_type ?? "—"}
          </ReportField>
          <ReportField label={t("maintenanceRequests.detail.branch")}>{locationLabel}</ReportField>
          <ReportField label={t("maintenanceRequests.detail.area")}>{data.area || "—"}</ReportField>
          <ReportField label={t("maintenanceRequests.detail.reporter")}>
            {data.reporter_name || "—"}
          </ReportField>
          <ReportField label={t("maintenanceRequests.detail.reported")}>
            {new Date(data.reported_at).toLocaleString()}
          </ReportField>
          <ReportField label={t("maintenanceRequests.detail.assigned")}>
            {data.assigned_technician_name || data.assigned_technician_id
              ? assignedLabel
              : requestedFromRemarks
                ? `${t("maintenanceRequests.detail.unassigned")} (${requestedFromRemarks})`
                : assignedLabel}
          </ReportField>
        </div>
      </ReportSection>

      <ReportSection title={t("maintenanceRequests.detail.issue")}>
        <ReportField label={t("maintenanceRequests.detail.description")}>
          <p className="whitespace-pre-wrap leading-relaxed">{data.description}</p>
        </ReportField>
        {remarksText ? (
          <ReportField label={t("maintenanceRequests.detail.remarks")}>
            <p className="whitespace-pre-wrap leading-relaxed">{remarksText}</p>
          </ReportField>
        ) : null}
        {data.progress_notes && !isCompleted && (
          <ReportField label={t("maintenanceRequests.detail.progressNotes")}>
            <p className="whitespace-pre-wrap leading-relaxed">{data.progress_notes}</p>
          </ReportField>
        )}
      </ReportSection>

      <ReportSection title={t("maintenanceRequests.detail.attachments")}>
        {submissionMedia.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("maintenanceRequests.detail.submissionMedia")}
            </p>
            <MaintenanceAttachmentsGallery attachments={submissionMedia} />
          </div>
        )}
        {workMedia.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("maintenanceRequests.detail.workMedia")}
            </p>
            <MaintenanceAttachmentsGallery attachments={workMedia} />
          </div>
        )}
        {!submissionMedia.length && !workMedia.length && (
          <p className="text-xs text-muted-foreground">{t("maintenanceRequests.detail.noAttachments")}</p>
        )}
      </ReportSection>

      {isCompleted && (
        <ReportSection title={t("maintenanceRequests.completion.title")}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <ReportField label={t("maintenanceRequests.completion.completedBy")}>
              {data.completed_by_name ?? "—"}
            </ReportField>
            <ReportField label={t("maintenanceRequests.completion.completedAt")}>
              {data.completed_at ? new Date(data.completed_at).toLocaleString() : "—"}
            </ReportField>
          </div>

          {data.progress_notes && (
            <ReportField label={t("maintenanceRequests.completion.notes")}>
              <p className="whitespace-pre-wrap leading-relaxed">{data.progress_notes}</p>
            </ReportField>
          )}

          {data.completion_signature_url && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("maintenanceRequests.completion.signature")}
              </p>
              <button
                type="button"
                className="block max-w-xs overflow-hidden rounded-md border border-border bg-white p-2"
                onClick={() =>
                  openPreview({
                    src: data.completion_signature_url!,
                    alt: t("maintenanceRequests.completion.signature"),
                    mimeType: "image/png",
                  })
                }
              >
                <img
                  src={data.completion_signature_url}
                  alt={t("maintenanceRequests.completion.signature")}
                  className="h-24 w-full object-contain"
                />
              </button>
            </div>
          )}

          {completionPhotos.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("maintenanceRequests.completion.photos")}
              </p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {completionPhotos.map((att) => (
                  <MediaThumbnail
                    key={att.id}
                    src={att.url ?? ""}
                    alt={att.file_name ?? "Completion"}
                    mimeType={att.mime_type}
                    unavailable={!att.url}
                    onPreview={() =>
                      openPreview({
                        src: att.url ?? "",
                        alt: att.file_name ?? "Completion",
                        mimeType: att.mime_type,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </ReportSection>
      )}

      {canUploadProgressPhotos && (
        <div className="space-y-3 rounded border border-dashed border-border p-3 print:hidden">
          <p className="text-sm font-medium">{t("maintenanceRequests.detail.progressPhotos")}</p>
          <PhotoCaptureUpload
            label={t("maintenanceRequests.detail.beforePhotos")}
            onUpload={(file) => uploadPhoto("before", file)}
            uploading={photoUploading}
            acceptVideos
            disabled={progressMut.isPending}
          />
          <PhotoCaptureUpload
            label={t("maintenanceRequests.detail.afterPhotos")}
            onUpload={(file) => uploadPhoto("after", file)}
            uploading={photoUploading}
            acceptVideos
            disabled={progressMut.isPending}
          />
          <Field label={t("maintenanceRequests.detail.progressNotes")}>
            <Textarea
              rows={3}
              value={progressNotes}
              onChange={(e) => setProgressNotes(e.target.value)}
              placeholder={t("maintenanceRequests.detail.progressNotesPlaceholder")}
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {showEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            {t("maintenanceRequests.actions.edit")}
          </Button>
        )}
        {canManage && data.status === "submitted" && (
          <Button size="sm" variant="outline" disabled={acceptMut.isPending}
            onClick={() => acceptMut.mutate()}>
            {t("maintenanceRequests.actions.accept")}
          </Button>
        )}
        {canExecute && data.status === "accepted" && (
          <Button size="sm" variant="outline" disabled={progressMut.isPending}
            onClick={() => progressMut.mutate({ status: "in_progress", progress_notes: progressNotes || undefined })}>
            {t("maintenanceRequests.actions.startWork")}
          </Button>
        )}
        {canClose && (
          <Button size="sm" onClick={() => setCloseOpen(true)}>
            {t("maintenanceRequests.actions.markCompleted")}
          </Button>
        )}
        {canExecute && ["accepted", "in_progress"].includes(data.status) && progressNotes && (
          <Button size="sm" variant="secondary" disabled={progressMut.isPending}
            onClick={() => progressMut.mutate({ progress_notes: progressNotes })}>
            {t("maintenanceRequests.actions.saveNotes")}
          </Button>
        )}
      </div>

      <CloseMaintenanceRequestDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        requestId={id}
        requestNumber={data.request_number}
        initialNotes={progressNotes || data.progress_notes || ""}
      />
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

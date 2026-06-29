"use client";

import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  base64ToDataUrl,
  MediaThumbnail,
  useMediaPreview,
} from "@/components/maintenance/media-preview-lightbox";
import { PhotoCaptureUpload, fileToBase64 } from "@/components/maintenance/photo-capture-upload";
import { uploadMaintenanceReportAttachment } from "@/lib/maintenance-weekly-reports.functions";
import { queryKeys } from "@/lib/query-keys";

type WeeklyReportAttachment = {
  id: string;
  file_name: string;
  mime_type?: string;
  content_base64?: string | null;
};

interface MaintenanceWeeklyReportAttachmentsProps {
  reportId?: string;
  attachments?: WeeklyReportAttachment[];
  disabled?: boolean;
  editable?: boolean;
}

function attachmentPreviewSrc(attachment: WeeklyReportAttachment): string | null {
  if (!attachment.content_base64 || !attachment.mime_type) return null;
  return base64ToDataUrl(attachment.mime_type, attachment.content_base64);
}

export function MaintenanceWeeklyReportAttachments({
  reportId,
  attachments = [],
  disabled,
  editable = true,
}: MaintenanceWeeklyReportAttachmentsProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { openPreview, previewDialog } = useMediaPreview();

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!reportId) throw new Error(t("maintenanceWeeklyReports.form.saveDraftForPhotos"));
      const content_base64 = await fileToBase64(file);
      return uploadMaintenanceReportAttachment({
        maintenance_weekly_report_id: reportId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64,
      });
    },
    onSuccess: () => {
      toast.success(t("maintenanceWeeklyReports.form.attachmentUploaded"));
      if (reportId) {
        void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.detail(reportId) });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {previewDialog}
      <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.form.photosTitle")}</h3>

      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((attachment) => {
            const src = attachmentPreviewSrc(attachment);
            return (
              <MediaThumbnail
                key={attachment.id}
                src={src ?? ""}
                alt={attachment.file_name}
                mimeType={attachment.mime_type}
                unavailable={!src}
                onPreview={
                  src
                    ? () =>
                        openPreview({
                          src,
                          alt: attachment.file_name,
                          mimeType: attachment.mime_type,
                        })
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {editable ? (
        <>
          {!reportId && (
            <p className="text-xs text-amber-700">{t("maintenanceWeeklyReports.form.saveDraftForPhotos")}</p>
          )}
          <PhotoCaptureUpload
            label={t("maintenanceWeeklyReports.form.addPhoto")}
            disabled={disabled || !reportId || uploadMut.isPending}
            uploading={uploadMut.isPending}
            onUpload={async (file) => {
              await uploadMut.mutateAsync(file);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("maintenanceWeeklyReports.form.attachmentHint")}</p>
        </>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("maintenanceWeeklyReports.form.noPhotos")}</p>
      ) : null}

      {uploadMut.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("maintenanceWeeklyReports.form.uploadingPhoto")}
        </div>
      )}
    </div>
  );
}

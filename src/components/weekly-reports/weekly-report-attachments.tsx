"use client";

import { ImagePlus, Loader2, Paperclip } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadWeeklyReportAttachment } from "@/lib/weekly-reports.functions";
import { queryKeys } from "@/lib/query-keys";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface WeeklyReportAttachmentsProps {
  reportId: string;
  attachments?: Array<{ id: string; file_name: string }>;
  disabled?: boolean;
}

export function WeeklyReportAttachments({ reportId, attachments = [], disabled }: WeeklyReportAttachmentsProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const content_base64 = await fileToBase64(file);
      return uploadWeeklyReportAttachment({
        weekly_report_id: reportId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64,
      });
    },
    onSuccess: () => {
      toast.success(t("weeklyReports.form.attachmentUploaded"));
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.detail(reportId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMut.mutate(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm text-[#334155]">
              <Paperclip className="h-4 w-4 shrink-0 text-[#94A3B8]" />
              {a.file_name}
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          id="weekly-report-attachment"
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled || uploadMut.isPending}
          onChange={onFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploadMut.isPending}
          onClick={() => document.getElementById("weekly-report-attachment")?.click()}
        >
          {uploadMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          {t("weeklyReports.form.addPhoto")}
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("weeklyReports.form.attachmentHint")}</p>
      </div>
    </div>
  );
}
